import assert from "node:assert/strict";
import test from "node:test";
import { createImportService, ImportWorkflowError, sha256Hex } from "../lib/import-service";
import type { ImportAnalysis } from "../lib/import-types";

function analysis(overrides: Partial<ImportAnalysis> = {}): ImportAnalysis {
  return {
    supplier: "VSTrade",
    supplierConfidence: 0.99,
    fingerprint: "book-1",
    sheets: [],
    rows: [{
      sku: "SKU-1", name: "Notebook", description: "Notebook", brand: "ASUS", price: 100,
      stock: 4, warrantyMonths: 12, supplier: "VSTrade", category: "Notebooks", subcategory: "ASUS",
      attributes: { rulesVersion: 1, ramGb: 16 }, raw: {}, source: { sheet: "Price", row: 5 },
    }],
    warnings: [], errors: [], examples: [], requiresConfirmation: false, confidence: 0.95,
    ...overrides,
  };
}

test("sha256Hex is stable", async () => {
  assert.equal(await sha256Hex(new TextEncoder().encode("price").buffer), "683b531f41ec88a2f345b727afe59757b73162a340a65c86bba62866f8fe556c");
});

test("commit rejects a different workbook", async () => {
  const first = new TextEncoder().encode("first").buffer;
  const service = createImportService({
    analyze: async () => analysis(), now: () => new Date("2026-08-13T10:00:00Z"), createId: () => "analysis-1",
    saveAnalysis: async () => undefined,
    loadAnalysis: async () => ({ id: "analysis-1", fileHash: await sha256Hex(first), fileName: "price.xlsx", supplierName: "VSTrade", analysis: {}, expiresAt: "2026-08-13T10:30:00.000Z" }),
    writeCatalog: async () => [], saveProfile: async () => undefined,
  });
  await assert.rejects(
    service.commitImport({ input: new TextEncoder().encode("second").buffer, fileName: "price.xlsx", analysisId: "analysis-1" }),
    (error: unknown) => error instanceof ImportWorkflowError && error.code === "FILE_MISMATCH",
  );
});

test("commit rejects an expired analysis", async () => {
  const input = new TextEncoder().encode("first").buffer;
  const service = createImportService({
    analyze: async () => analysis(), now: () => new Date("2026-08-13T11:00:00Z"), createId: () => "analysis-1",
    saveAnalysis: async () => undefined,
    loadAnalysis: async () => ({ id: "analysis-1", fileHash: await sha256Hex(input), fileName: "price.xlsx", supplierName: "VSTrade", analysis: {}, expiresAt: "2026-08-13T10:30:00.000Z" }),
    writeCatalog: async () => [], saveProfile: async () => undefined,
  });
  await assert.rejects(
    service.commitImport({ input, fileName: "price.xlsx", analysisId: "analysis-1" }),
    (error: unknown) => error instanceof ImportWorkflowError && error.code === "ANALYSIS_EXPIRED",
  );
});

test("commit blocks unresolved critical mappings", async () => {
  const input = new TextEncoder().encode("first").buffer;
  const hash = await sha256Hex(input);
  const service = createImportService({
    analyze: async () => analysis({ rows: [], errors: ["Price: missing price."] }),
    now: () => new Date("2026-08-13T10:00:00Z"), createId: () => "analysis-1", saveAnalysis: async () => undefined,
    loadAnalysis: async () => ({ id: "analysis-1", fileHash: hash, fileName: "price.xlsx", supplierName: "VSTrade", analysis: {}, expiresAt: "2026-08-13T10:30:00.000Z" }),
    writeCatalog: async () => [], saveProfile: async () => undefined,
  });
  await assert.rejects(
    service.commitImport({ input, fileName: "price.xlsx", analysisId: "analysis-1" }),
    (error: unknown) => error instanceof ImportWorkflowError && error.code === "UNRESOLVED_MAPPING",
  );
});

test("analyze stores a compact preview and commit materializes rows", async () => {
  const input = new TextEncoder().encode("first").buffer;
  let stored: Awaited<ReturnType<ReturnType<typeof createImportService>["analyzeImport"]>> | undefined;
  let written = 0;
  const service = createImportService({
    analyze: async () => analysis(), now: () => new Date("2026-08-13T10:00:00Z"), createId: () => "analysis-1",
    saveAnalysis: async (record) => { stored = { analysisId: record.id, expiresAt: record.expiresAt, ...record.analysis } as typeof stored; },
    loadAnalysis: async () => ({ id: "analysis-1", fileHash: await sha256Hex(input), fileName: "price.xlsx", supplierName: "VSTrade", analysis: {}, expiresAt: "2026-08-13T10:30:00.000Z" }),
    writeCatalog: async (rows) => { written = rows.length; return [{ supplier: "VSTrade", rows: rows.length }]; },
    saveProfile: async () => undefined,
  });
  const preview = await service.analyzeImport({ input, fileName: "price.xlsx" });
  assert.equal(preview.analysisId, "analysis-1");
  assert.equal(preview.rowCount, 1);
  assert.equal("rows" in preview, false);
  assert.equal(stored?.analysisId, "analysis-1");
  const result = await service.commitImport({ input, fileName: "price.xlsx", analysisId: "analysis-1", supplier: "VSTrade" });
  assert.equal(written, 1);
  assert.equal(result.rowCount, 1);
});

test("analyze reuses a saved supplier mapping profile", async () => {
  const input = new TextEncoder().encode("first").buffer;
  const calls: Array<{ supplier?: string; overrides?: unknown }> = [];
  const savedMapping = { "price-4": { name: 2, special_price_kzt: 10 } };
  const service = createImportService({
    analyze: async (_input, options) => { calls.push(options); return analysis(); },
    loadProfile: async () => ({ supplierName: "Remembered supplier", mapping: savedMapping }),
    now: () => new Date("2026-08-13T10:00:00Z"), createId: () => "analysis-1",
    saveAnalysis: async () => undefined, loadAnalysis: async () => null,
    writeCatalog: async () => [], saveProfile: async () => undefined,
  });
  await service.analyzeImport({ input, fileName: "price.xlsx" });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].supplier, "Remembered supplier");
  assert.deepEqual(calls[1].overrides, savedMapping);
});
