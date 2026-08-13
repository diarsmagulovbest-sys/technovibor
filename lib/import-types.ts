export type ColumnRole =
  | "external_id"
  | "article"
  | "sku"
  | "name"
  | "description"
  | "brand"
  | "price_kzt"
  | "special_price_kzt"
  | "stock"
  | "warranty"
  | "supplier"
  | "category";

export type ColumnAlternative = { column: number; header: string; confidence: number };

export type ColumnMapping = {
  role: ColumnRole;
  column: number;
  header: string;
  confidence: number;
  reason: string;
  alternatives: ColumnAlternative[];
};

export type MappingSet = Partial<Record<ColumnRole, ColumnMapping>>;

export type DetectedTable = {
  id: string;
  sheetName: string;
  headerRow: number;
  headers: string[];
  rows: unknown[][];
  mapping: MappingSet;
  confidence: number;
  warnings: string[];
};

export type ProductAttributes = {
  rulesVersion: 1;
  cpu?: string;
  ramGb?: number;
  memoryType?: string;
  storageGb?: number;
  storageType?: string;
  gpu?: string;
  screenInches?: number;
  resolution?: string;
  os?: string;
};

export type AdaptiveImportRow = {
  sku: string;
  name: string;
  description: string;
  brand: string;
  price: number;
  stock: number | null;
  warrantyMonths: number | null;
  supplier: string;
  category: string;
  subcategory: string;
  attributes: ProductAttributes;
  raw: Record<string, unknown>;
  source: { sheet: string; row: number };
};

export type MappingOverrides = Record<string, Partial<Record<ColumnRole, number | null>>>;

export type SheetAnalysis = {
  name: string;
  included: boolean;
  reason: string;
  table?: DetectedTable;
  productRows: number;
  invalidRows: number;
};

export type ImportAnalysis = {
  supplier: string;
  supplierConfidence: number;
  fingerprint: string;
  sheets: SheetAnalysis[];
  rows: AdaptiveImportRow[];
  warnings: string[];
  errors: string[];
  examples: AdaptiveImportRow[];
  requiresConfirmation: boolean;
  confidence: number;
};

export type WorkbookSheet = { sheet: string; data: unknown[][] };
