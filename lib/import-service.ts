import type { AdaptiveImportRow, ImportAnalysis, MappingOverrides, MappingSet } from "./import-types";

export type PublicDetectedTable = {
  id: string;
  sheetName: string;
  headerRow: number;
  headers: string[];
  mapping: MappingSet;
  confidence: number;
  warnings: string[];
};

export type PublicSheetAnalysis = Omit<ImportAnalysis["sheets"][number], "table"> & {
  table?: PublicDetectedTable;
};

export type PublicImportAnalysis = {
  supplier: string;
  supplierConfidence: number;
  fingerprint: string;
  sheets: PublicSheetAnalysis[];
  rowCount: number;
  warnings: string[];
  errors: string[];
  examples: AdaptiveImportRow[];
  requiresConfirmation: boolean;
  confidence: number;
};

export type StoredImportAnalysis = {
  id: string;
  fileHash: string;
  fileName: string;
  supplierName: string;
  analysis: unknown;
  expiresAt: string;
};

type AnalyzeOptions = { fileName?: string; overrides?: MappingOverrides; supplier?: string };

type ImportServiceDependencies = {
  analyze(input: ArrayBuffer, options: AnalyzeOptions): Promise<ImportAnalysis>;
  saveAnalysis(record: StoredImportAnalysis): Promise<void>;
  loadAnalysis(id: string): Promise<StoredImportAnalysis | null>;
  loadProfile?(fingerprint: string): Promise<{ supplierName: string; mapping: unknown } | null>;
  writeCatalog(rows: AdaptiveImportRow[], fileName: string): Promise<Array<{ supplier: string; rows: number }>>;
  saveProfile(input: { supplierName: string; fingerprint: string; mapping: unknown }): Promise<void>;
  now?: () => Date;
  createId?: () => string;
};

export type ImportWorkflowErrorCode =
  | "ANALYSIS_NOT_FOUND"
  | "ANALYSIS_EXPIRED"
  | "FILE_MISMATCH"
  | "UNRESOLVED_MAPPING"
  | "EMPTY_IMPORT";

export class ImportWorkflowError extends Error {
  constructor(public readonly code: ImportWorkflowErrorCode, message: string, public readonly details?: string[]) {
    super(message);
    this.name = "ImportWorkflowError";
  }
}

function tablePreview(table: NonNullable<ImportAnalysis["sheets"][number]["table"]>): PublicDetectedTable {
  return {
    id: table.id,
    sheetName: table.sheetName,
    headerRow: table.headerRow,
    headers: table.headers,
    mapping: table.mapping,
    confidence: table.confidence,
    warnings: table.warnings,
  };
}

export function presentAnalysis(analysis: ImportAnalysis): PublicImportAnalysis {
  return {
    supplier: analysis.supplier,
    supplierConfidence: analysis.supplierConfidence,
    fingerprint: analysis.fingerprint,
    sheets: analysis.sheets.map((sheet) => ({
      name: sheet.name,
      included: sheet.included,
      reason: sheet.reason,
      productRows: sheet.productRows,
      invalidRows: sheet.invalidRows,
      ...(sheet.table ? { table: tablePreview(sheet.table) } : {}),
    })),
    rowCount: analysis.rows.length,
    warnings: analysis.warnings,
    errors: analysis.errors,
    examples: analysis.examples,
    requiresConfirmation: analysis.requiresConfirmation,
    confidence: analysis.confidence,
  };
}

export async function sha256Hex(input: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createImportService(dependencies: ImportServiceDependencies) {
  const now = dependencies.now ?? (() => new Date());
  const createId = dependencies.createId ?? (() => crypto.randomUUID());

  return {
    async analyzeImport(input: { input: ArrayBuffer; fileName: string; supplier?: string }) {
      const [fileHash, initialAnalysis] = await Promise.all([
        sha256Hex(input.input),
        dependencies.analyze(input.input, { fileName: input.fileName, supplier: input.supplier }),
      ]);
      const profile = await dependencies.loadProfile?.(initialAnalysis.fingerprint);
      const analysis = profile
        ? await dependencies.analyze(input.input, {
          fileName: input.fileName,
          supplier: input.supplier || profile.supplierName,
          overrides: profile.mapping as MappingOverrides,
        })
        : initialAnalysis;
      const preview = presentAnalysis(analysis);
      const analysisId = createId();
      const expiresAt = new Date(now().getTime() + 30 * 60 * 1000).toISOString();
      await dependencies.saveAnalysis({
        id: analysisId,
        fileHash,
        fileName: input.fileName,
        supplierName: analysis.supplier,
        analysis: preview,
        expiresAt,
      });
      return { analysisId, expiresAt, ...preview };
    },

    async commitImport(input: {
      input: ArrayBuffer;
      fileName: string;
      analysisId: string;
      supplier?: string;
      overrides?: MappingOverrides;
    }) {
      const stored = await dependencies.loadAnalysis(input.analysisId);
      if (!stored) throw new ImportWorkflowError("ANALYSIS_NOT_FOUND", "Анализ не найден. Загрузите файл заново.");
      if (new Date(stored.expiresAt).getTime() <= now().getTime()) {
        throw new ImportWorkflowError("ANALYSIS_EXPIRED", "Предпросмотр устарел. Проанализируйте файл ещё раз.");
      }
      if (await sha256Hex(input.input) !== stored.fileHash) {
        throw new ImportWorkflowError("FILE_MISMATCH", "Выбран другой файл. Используйте тот же Excel-файл, который был проанализирован.");
      }
      const supplier = input.supplier?.trim() || stored.supplierName;
      const analysis = await dependencies.analyze(input.input, {
        fileName: input.fileName,
        supplier,
        overrides: input.overrides,
      });
      if (analysis.errors.length) {
        throw new ImportWorkflowError("UNRESOLVED_MAPPING", "Не все обязательные поля распознаны.", analysis.errors);
      }
      if (!analysis.rows.length) throw new ImportWorkflowError("EMPTY_IMPORT", "В файле не найдено товаров для импорта.");
      const completed = await dependencies.writeCatalog(analysis.rows, input.fileName);
      const mappings: MappingOverrides = Object.fromEntries(analysis.sheets
        .filter((sheet) => sheet.table)
        .map((sheet) => [sheet.table!.id, Object.fromEntries(Object.entries(sheet.table!.mapping)
          .map(([role, mapping]) => [role, mapping?.column ?? null]))]));
      await dependencies.saveProfile({ supplierName: supplier, fingerprint: analysis.fingerprint, mapping: mappings });
      return { rowCount: analysis.rows.length, completed, warnings: analysis.warnings };
    },
  };
}
