# Adaptive Excel Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed-column Excel importer with a deterministic multi-sheet analyzer, confirmation UI, supplier profiles, and structured product attributes that work without AI.

**Architecture:** Split import into pure detection/parsing modules, a server-side analyze/commit workflow, and an admin preview UI. Analyze never changes the catalog; commit resends and revalidates the same file by SHA-256 before atomically switching the supplier's active import. Persistent profiles improve repeat imports without trusting fixed column positions.

**Tech Stack:** TypeScript 5.9, React 19, vinext/Vite, `read-excel-file` 9, Cloudflare Workers/D1, Node test runner, CSS.

## Global Constraints

- The complete workflow must operate without AI models or external recognition services.
- Support `.xlsx` only, maximum 5 MiB and 10,000 accepted product rows.
- Never commit `C:\Users\beken\Downloads\price 10.08.2026.xlsx`; it contains live supplier data and is used only for local verification.
- Existing fixed-format files must remain importable.
- The old active supplier import remains live until the new import completes successfully.
- Critical fields are product name, positive KZT price, and a stable identifier.
- Special KZT price has priority over regular/dealer KZT price when positive.

---

### Task 1: Import domain types and deterministic column detection

**Files:**
- Create: `lib/import-types.ts`
- Create: `lib/import-detection.ts`
- Create: `tests/import-detection.test.ts`

**Interfaces:**
- Produces: `ColumnRole`, `ColumnMapping`, `DetectedTable`, `ImportAnalysis`, `normalizeHeader(value)`, `detectTable(sheetName, matrix)`, and `applyMapping(table, overrides)`.
- Consumes: only plain JavaScript values; no database or workbook library.

- [ ] **Step 1: Write failing detection tests**

Cover a realistic matrix whose header is row 4, whose category rows have one text cell, and whose price candidates are `D3`, `Дил. тг.`, `Наличие`, `Спец.цена`, and `Спец.тенге`. Assert that the table starts at row 4, `name` maps to `Описание`, `sku` maps to `Код производителя`, `stock` maps to `Наличие`, and `special_price_kzt` plus `price_kzt` are both retained.

```ts
const table = detectTable("Ноутбуки", matrix);
assert.equal(table?.headerRow, 3);
assert.equal(table?.mapping.name.column, 2);
assert.equal(table?.mapping.sku.column, 3);
assert.equal(table?.mapping.price_kzt.column, 7);
assert.equal(table?.mapping.special_price_kzt.column, 10);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx tsx --test tests/import-detection.test.ts`

Expected: FAIL because `lib/import-detection.ts` does not exist.

- [ ] **Step 3: Implement focused types and detection**

Define the roles:

```ts
export type ColumnRole = "external_id" | "article" | "sku" | "name" | "description" |
  "brand" | "price_kzt" | "special_price_kzt" | "stock" | "warranty" | "supplier" | "category";

export type ColumnMapping = {
  role: ColumnRole;
  column: number;
  header: string;
  confidence: number;
  reason: string;
  alternatives: Array<{ column: number; header: string; confidence: number }>;
};
```

Use normalized alias dictionaries plus column profiles. Header scoring must require at least three recognized roles or a combined score high enough to avoid the `Главная` contacts sheet. Price roles require a price alias; numeric magnitude alone must never select a price column.

- [ ] **Step 4: Run detection tests and verify GREEN**

Run: `npx tsx --test tests/import-detection.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/import-types.ts lib/import-detection.ts tests/import-detection.test.ts
git commit -m "feat: detect Excel table structures"
```

### Task 2: Row classification, price selection, and multi-sheet analysis

**Files:**
- Create: `lib/import-analysis.ts`
- Modify: `lib/import-excel.ts`
- Modify: `tests/import-excel.test.ts`

**Interfaces:**
- Consumes: `DetectedTable` and optional `MappingOverrides` from Task 1.
- Produces: `analyzeWorkbook(sheets, options): ImportAnalysis`, `materializeRows(analysis, overrides): ParsedImport`, and `parseExcel(input, overrides?)`.

- [ ] **Step 1: Write failing analysis tests**

Add tests for:

- skipping `Главная` without a stable table;
- accepting 11 product sheets in a VSTrade-shaped synthetic workbook;
- inheriting sheet category and section-row subcategory;
- selecting positive `Спец.тенге`, otherwise `Дил. тг.`;
- ignoring repeated headers and malformed rows;
- preserving compatibility with the downloadable template.

```ts
assert.equal(result.includedSheets.length, 11);
assert.equal(result.skippedSheets[0].name, "Главная");
assert.equal(result.rows[0].category, "Ноутбуки");
assert.equal(result.rows[0].subcategory, "Ноутбуки ASUS");
assert.equal(result.rows[0].price, 2276995);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npx tsx --test tests/import-excel.test.ts`

Expected: FAIL because multi-sheet analysis is absent.

- [ ] **Step 3: Implement row classification and stable IDs**

Classify rows as `product`, `category`, `header`, `service`, `blank`, or `invalid`. Select ID in order: manufacturer code, article, external ID, then deterministic hash of normalized brand/model/name. Mark hash fallback as low confidence and reject collisions.

Keep `parseRows()` as a compatibility wrapper over a single synthetic sheet so existing callers and tests remain valid.

- [ ] **Step 4: Detect supplier and file fingerprint**

Recognize `VSTrade` from `vstrade.kz`; otherwise use explicit supplier column, profile match, workbook price-list text, or normalized file stem. Compute a structure fingerprint from normalized sheet/header signatures rather than column numbers.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npx tsx --test tests/import-excel.test.ts tests/import-detection.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add lib/import-analysis.ts lib/import-excel.ts tests/import-excel.test.ts
git commit -m "feat: analyze multi-sheet price lists"
```

### Task 3: Deterministic specification extraction

**Files:**
- Create: `lib/spec-extraction.ts`
- Create: `tests/spec-extraction.test.ts`
- Modify: `lib/import-analysis.ts`

**Interfaces:**
- Produces: `extractProductAttributes(input: { name; description; category }): ProductAttributes`.
- Consumes: normalized product text produced by Task 2.

- [ ] **Step 1: Write failing extraction tests**

Use representative attached-file descriptions and assert extraction of CPU, RAM, storage, GPU, display, and OS.

```ts
const attrs = extractProductAttributes({
  name: "ASUS ROG Strix",
  description: "CU9 275HX/RTX5080/64G/D5/1T PCIE/18 WQXGA/W11H",
  category: "Ноутбуки",
});
assert.equal(attrs.cpu, "Intel Core Ultra 9 275HX");
assert.equal(attrs.ramGb, 64);
assert.equal(attrs.storageGb, 1024);
assert.equal(attrs.gpu, "NVIDIA GeForce RTX 5080");
assert.equal(attrs.screenInches, 18);
assert.equal(attrs.os, "Windows 11 Home");
```

- [ ] **Step 2: Run test and verify RED**

Run: `npx tsx --test tests/spec-extraction.test.ts`

Expected: FAIL because the extractor does not exist.

- [ ] **Step 3: Implement versioned rules**

Use ordered regex rules and explicit dictionaries for Intel/AMD/Apple CPU names, RTX/Radeon/Intel graphics, RAM units, SSD/HDD sizes, screen sizes/resolutions, and OS abbreviations. Return only supported attributes plus `rulesVersion: 1`; retain the original description separately.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npx tsx --test tests/spec-extraction.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/spec-extraction.ts lib/import-analysis.ts tests/spec-extraction.test.ts
git commit -m "feat: extract hardware specifications without AI"
```

### Task 4: Database schema, supplier profiles, and enriched catalog writes

**Files:**
- Modify: `db/schema.ts`
- Modify: `lib/catalog.ts`
- Create: `drizzle/0001_adaptive_import.sql`
- Modify: `drizzle/meta/_journal.json`
- Create or update: `drizzle/meta/0001_snapshot.json`
- Create: `tests/catalog-shape.test.ts`

**Interfaces:**
- Consumes: enriched `ImportRow` with `description`, `category`, `subcategory`, `stock`, and `attributes`.
- Produces: `saveImportProfile(profile)`, `findImportProfile(fingerprint)`, `createImportAnalysis(record)`, `getImportAnalysis(id)`, and enriched search/catalog rows.

- [ ] **Step 1: Write a failing schema-shape test**

Assert that runtime schema creation and Drizzle schema contain product enrichment, `import_profiles`, and `import_analyses`.

- [ ] **Step 2: Run test and verify RED**

Run: `npx tsx --test tests/catalog-shape.test.ts`

Expected: FAIL because the new tables and fields are absent.

- [ ] **Step 3: Extend schema safely**

Add product columns `description`, `category`, `subcategory`, and `attributes_json`. Add:

```sql
CREATE TABLE IF NOT EXISTS import_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_name TEXT NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE,
  mapping_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS import_analyses (
  id TEXT PRIMARY KEY,
  file_hash TEXT NOT NULL,
  file_name TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  analysis_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Runtime initialization must inspect `PRAGMA table_info(products)` before issuing `ALTER TABLE` for existing Sites databases.

- [ ] **Step 4: Enrich writes and search**

Update product upsert and `search_text` to include description, category, subcategory, and serialized attribute values. Keep supplier active-import switching after successful staging only.

- [ ] **Step 5: Generate/inspect migration and run tests**

Run: `npm run db:generate`

Run: `npx tsx --test tests/catalog-shape.test.ts tests/*.test.ts`

Expected: migration contains only intended additions; tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add db/schema.ts lib/catalog.ts drizzle tests/catalog-shape.test.ts
git commit -m "feat: persist adaptive import metadata"
```

### Task 5: Analyze and commit API workflow

**Files:**
- Create: `app/api/admin/import/analyze/route.ts`
- Create: `app/api/admin/import/commit/route.ts`
- Modify: `app/api/admin/import/route.ts`
- Create: `lib/import-service.ts`
- Create: `tests/import-service.test.ts`

**Interfaces:**
- `analyzeImport(file): Promise<ImportAnalysisResponse>` hashes and analyzes without catalog writes.
- `commitImport({ file, analysisId, overrides, supplier }): Promise<CommitResult>` verifies hash, re-analyzes, blocks unresolved critical mappings, writes catalog, and saves profile.

- [ ] **Step 1: Write failing service tests**

Test SHA-256 mismatch rejection, expiration rejection, unresolved critical mapping rejection, and successful materialization. Use injected persistence/catalog callbacks so tests do not require D1.

- [ ] **Step 2: Run test and verify RED**

Run: `npx tsx --test tests/import-service.test.ts`

Expected: FAIL because `lib/import-service.ts` does not exist.

- [ ] **Step 3: Implement analyze service and route**

Validate authentication, extension, size, row limits, and file hash. Store only analysis JSON and hash in D1; do not store workbook bytes. Return sheet summaries, mappings, confidence, examples, warnings, and analysis ID.

- [ ] **Step 4: Implement commit service and compatibility route**

Commit receives the file again, confirms the same SHA-256, reapplies overrides server-side, and rejects any unresolved critical role. Keep `/api/admin/import` as a compatibility endpoint that analyzes and commits only when confidence is high; otherwise return `409` with the analysis payload.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npx tsx --test tests/import-service.test.ts tests/*.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add app/api/admin/import lib/import-service.ts tests/import-service.test.ts
git commit -m "feat: add safe analyze and commit workflow"
```

### Task 6: Admin analysis and mapping interface

**Files:**
- Create: `app/admin/ImportAnalyzer.tsx`
- Modify: `app/admin/AdminConsole.tsx`
- Modify: `app/globals.css`
- Modify: `tests/project.test.ts`

**Interfaces:**
- Consumes analyze response from Task 5.
- Produces multipart commit request with the original file, analysis ID, supplier, and JSON mapping overrides.

- [ ] **Step 1: Write failing UI source test**

Assert the admin source contains separate analyze/commit endpoints, analysis summary labels, mapping selects, warnings, and file re-use on commit.

- [ ] **Step 2: Run test and verify RED**

Run: `npx tsx --test tests/project.test.ts`

Expected: FAIL because the preview UI is absent.

- [ ] **Step 3: Implement three-state UI**

States are `select`, `analyzing`, and `review`. The review screen shows supplier, included/skipped sheets, detected rows, chosen price rule, examples, warnings, and only mappings that are ambiguous or user-expandable. Disable commit while a critical role is unresolved.

- [ ] **Step 4: Add accessible responsive styles**

Use labeled controls, keyboard-visible focus, responsive cards, compact tables with horizontal scrolling, explicit warning/success colors, and no drag-only interaction.

- [ ] **Step 5: Run tests, lint, and build**

Run: `npm test`

Run: `npm run lint`

Run: `npm run build`

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```powershell
git add app/admin app/globals.css tests/project.test.ts
git commit -m "feat: preview and confirm adaptive imports"
```

### Task 7: Real-file verification, regression hardening, and documentation

**Files:**
- Modify: `README.md`
- Modify: tests under `tests/` only when a real-file observation exposes a missing deterministic rule.

**Interfaces:**
- Consumes local file `C:\Users\beken\Downloads\price 10.08.2026.xlsx` without copying it into Git.
- Produces a compact verification report in terminal output; no supplier workbook artifact is committed.

- [ ] **Step 1: Run local analyzer against the real workbook**

Use a local script or test-only command to assert:

- `Главная` is skipped;
- 11 product sheets are included;
- header row is Excel row 4 on those sheets;
- supplier is `VSTrade`;
- special KZT price falls back to dealer KZT;
- `Наличие` is stock;
- laptop attributes are extracted;
- accepted rows are nonzero and below 10,000;
- no unresolved critical mappings remain.

- [ ] **Step 2: Add minimal regression cases for discovered gaps**

For each gap, add a small synthetic matrix or description to the existing test files, observe failure, patch only the responsible detector/extractor, and rerun the focused test.

- [ ] **Step 3: Update operator documentation**

Document analyze-before-import behavior, confidence levels, supported `.xlsx` limits, saved supplier profiles, and the guarantee that the feature uses no AI.

- [ ] **Step 4: Run full verification**

Run: `npm test`

Run: `npm run lint`

Run: `npm run build`

Run: `git diff --check`

Expected: all commands exit 0 and the worktree contains no downloaded supplier workbook.

- [ ] **Step 5: Commit**

```powershell
git add README.md tests lib app db drizzle
git commit -m "test: verify adaptive import with real price list"
```

### Task 8: Review, publish, and production smoke test

**Files:**
- No product-code changes unless review or smoke testing finds a defect.

**Interfaces:**
- Consumes the verified Git commit from Task 7.
- Produces updated GitHub `main` and a successful Sites production deployment.

- [ ] **Step 1: Review specification compliance and code quality**

Check every design requirement against implementation, inspect error paths and destructive replacement behavior, and fix any critical or important finding with a focused regression test.

- [ ] **Step 2: Re-run verification after review fixes**

Run: `npm test`

Run: `npm run lint`

Run: `npm run build`

Expected: all commands exit 0.

- [ ] **Step 3: Push GitHub main and Sites source**

Push the exact verified commit to `origin/main` and to the configured Sites repository. Package the same commit for Sites versioning.

- [ ] **Step 4: Deploy the saved Sites version**

Deploy privately to project `appgprj_6a7c3ce1a7308191b815983be6155d12` and poll until `succeeded`.

- [ ] **Step 5: Production smoke test**

Verify admin authentication, file selection, analyze response for the real workbook, preview summary, and that no catalog write occurs before commit. Do not commit the real workbook during smoke testing.

- [ ] **Step 6: Final handoff**

Report the production URL, GitHub update, exact verification results, and a short plain-language explanation of how automatic detection and confirmation work.
