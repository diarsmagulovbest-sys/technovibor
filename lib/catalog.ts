import { getD1 } from "../db";
import { chunkForJson, OFFER_BATCH_SQL, PRODUCT_BATCH_SQL } from "./catalog-batching";
import { buildProductSearchText, normalizeSearch } from "./catalog-search";
import type { AdaptiveImportRow, ProductAttributes } from "./import-types";

export type CatalogProduct = {
  id: number;
  sku: string;
  name: string;
  brand: string;
  description: string;
  category: string;
  subcategory: string;
  attributes: ProductAttributes;
  minPrice: number;
  offerCount: number;
};

export type ProductOffer = { supplier: string; price: number; stock: number | null; importedAt: string };
export type ProductDetails = CatalogProduct & { offers: ProductOffer[] };
export type ImportRow = AdaptiveImportRow;
export { normalizeSearch } from "./catalog-search";

let schemaReady: Promise<void> | null = null;

export async function ensureCatalogDb() {
  if (schemaReady) return schemaReady;
  schemaReady = initializeCatalogDb().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

async function initializeCatalogDb() {
  const d1 = getD1();
  await d1.batch([
    d1.prepare("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      brand TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '',
      subcategory TEXT NOT NULL DEFAULT '', attributes_json TEXT NOT NULL DEFAULT '{}', search_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, active_import_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT, supplier_id INTEGER NOT NULL, file_name TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'staging',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, supplier_id INTEGER NOT NULL,
      import_id INTEGER NOT NULL, price INTEGER NOT NULL CHECK(price > 0), stock INTEGER,
      raw_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(import_id, product_id)
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS import_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT, supplier_name TEXT NOT NULL, fingerprint TEXT NOT NULL UNIQUE,
      mapping_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS import_analyses (
      id TEXT PRIMARY KEY, file_hash TEXT NOT NULL, file_name TEXT NOT NULL, supplier_name TEXT NOT NULL,
      analysis_json TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_products_search_text ON products(search_text)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_offers_product ON offers(product_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_offers_supplier_import ON offers(supplier_id, import_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_imports_supplier_created ON imports(supplier_id, created_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_import_analyses_expires_at ON import_analyses(expires_at)"),
  ]);

  const [productColumns, offerColumns] = await Promise.all([
    d1.prepare("PRAGMA table_info(products)").all<{ name: string }>(),
    d1.prepare("PRAGMA table_info(offers)").all<{ name: string }>(),
  ]);
  const products = new Set((productColumns.results ?? []).map((column) => column.name));
  const offers = new Set((offerColumns.results ?? []).map((column) => column.name));
  const migrations = [
    !products.has("description") && d1.prepare("ALTER TABLE products ADD COLUMN description TEXT NOT NULL DEFAULT ''"),
    !products.has("category") && d1.prepare("ALTER TABLE products ADD COLUMN category TEXT NOT NULL DEFAULT ''"),
    !products.has("subcategory") && d1.prepare("ALTER TABLE products ADD COLUMN subcategory TEXT NOT NULL DEFAULT ''"),
    !products.has("attributes_json") && d1.prepare("ALTER TABLE products ADD COLUMN attributes_json TEXT NOT NULL DEFAULT '{}'"),
    !offers.has("stock") && d1.prepare("ALTER TABLE offers ADD COLUMN stock INTEGER"),
  ].filter(Boolean) as D1PreparedStatement[];
  if (migrations.length) await d1.batch(migrations);

  const seeded = await d1.prepare("SELECT value FROM app_meta WHERE key = 'demo_seed_v1'").first();
  if (seeded) return;
  await seedDemoCatalog();
}

async function seedDemoCatalog() {
  const d1 = getD1();
  const demoProducts = [
    ["NB-LEN-001", "Lenovo IdeaPad Slim 5 16IRL8", "Lenovo", 429990],
    ["NB-ASU-002", "ASUS Vivobook 15 X1504VA", "ASUS", 319990],
    ["NB-ACE-003", "Acer Swift Go 14 SFG14-71", "Acer", 519990],
    ["NB-HP-004", "HP Pavilion Plus 14-ew1003ci", "HP", 579990],
    ["NB-MSI-005", "MSI Katana 17 B13VGK", "MSI", 799990],
    ["NB-APP-006", "Apple MacBook Air 13 M3", "Apple", 649990],
  ] as const;
  await d1.prepare("INSERT OR IGNORE INTO suppliers(name) VALUES (?)").bind("Demo Supply").run();
  const supplier = await d1.prepare("SELECT id FROM suppliers WHERE name = ?").bind("Demo Supply").first<{ id: number }>();
  if (!supplier) throw new Error("Не удалось подготовить демо-каталог.");
  const imported = await d1.prepare("INSERT INTO imports(supplier_id, file_name, row_count, status) VALUES (?, ?, ?, 'completed') RETURNING id")
    .bind(supplier.id, "demo-catalog.xlsx", demoProducts.length).first<{ id: number }>();
  if (!imported) throw new Error("Не удалось подготовить демо-импорт.");
  for (const [sku, name, brand, price] of demoProducts) {
    await d1.prepare(`INSERT INTO products(sku, name, brand, search_text) VALUES (?, ?, ?, ?)
      ON CONFLICT(sku) DO UPDATE SET name=excluded.name, brand=excluded.brand, search_text=excluded.search_text`)
      .bind(sku, name, brand, normalizeSearch(`${sku} ${name} ${brand}`)).run();
    const product = await d1.prepare("SELECT id FROM products WHERE sku = ?").bind(sku).first<{ id: number }>();
    if (product) await d1.prepare("INSERT OR REPLACE INTO offers(product_id, supplier_id, import_id, price, raw_json) VALUES (?, ?, ?, ?, ?)")
      .bind(product.id, supplier.id, imported.id, price, JSON.stringify({ demo: true })).run();
  }
  await d1.batch([
    d1.prepare("UPDATE suppliers SET active_import_id = ? WHERE id = ?").bind(imported.id, supplier.id),
    d1.prepare("INSERT OR REPLACE INTO app_meta(key, value) VALUES ('demo_seed_v1', 'done')"),
    d1.prepare("PRAGMA optimize"),
  ]);
}

function attributesFrom(value: unknown): ProductAttributes {
  try { return JSON.parse(String(value ?? "{}")) as ProductAttributes; } catch { return { rulesVersion: 1 }; }
}

export async function getCatalogProducts(query = ""): Promise<CatalogProduct[]> {
  await ensureCatalogDb();
  const d1 = getD1();
  const normalized = normalizeSearch(query);
  const where = normalized ? "WHERE p.search_text LIKE ?" : "";
  const statement = d1.prepare(`SELECT p.id, p.sku, p.name, p.brand, p.description, p.category, p.subcategory, p.attributes_json,
    MIN(o.price) AS min_price, COUNT(o.id) AS offer_count FROM products p
    JOIN offers o ON o.product_id=p.id JOIN suppliers s ON s.id=o.supplier_id AND s.active_import_id=o.import_id
    ${where} GROUP BY p.id, p.sku, p.name, p.brand, p.description, p.category, p.subcategory, p.attributes_json
    ORDER BY min_price ASC, p.name ASC LIMIT 120`);
  const result = normalized ? await statement.bind(`%${normalized}%`).all() : await statement.all();
  return (result.results ?? []).map((row) => ({
    id: Number(row.id), sku: String(row.sku), name: String(row.name), brand: String(row.brand ?? ""),
    description: String(row.description ?? ""), category: String(row.category ?? ""), subcategory: String(row.subcategory ?? ""),
    attributes: attributesFrom(row.attributes_json), minPrice: Number(row.min_price), offerCount: Number(row.offer_count),
  }));
}

export async function getProductBySku(sku: string): Promise<ProductDetails | null> {
  await ensureCatalogDb();
  const d1 = getD1();
  const product = await d1.prepare(`SELECT p.id, p.sku, p.name, p.brand, p.description, p.category, p.subcategory, p.attributes_json,
    MIN(o.price) AS min_price, COUNT(o.id) AS offer_count FROM products p
    JOIN offers o ON o.product_id=p.id JOIN suppliers s ON s.id=o.supplier_id AND s.active_import_id=o.import_id
    WHERE p.sku=? GROUP BY p.id, p.sku, p.name, p.brand, p.description, p.category, p.subcategory, p.attributes_json`).bind(sku).first();
  if (!product) return null;
  const offers = await d1.prepare(`SELECT s.name AS supplier, o.price, o.stock, i.created_at AS imported_at FROM offers o
    JOIN suppliers s ON s.id=o.supplier_id AND s.active_import_id=o.import_id JOIN imports i ON i.id=o.import_id
    WHERE o.product_id=? ORDER BY o.price ASC`).bind(product.id).all();
  return {
    id: Number(product.id), sku: String(product.sku), name: String(product.name), brand: String(product.brand ?? ""),
    description: String(product.description ?? ""), category: String(product.category ?? ""), subcategory: String(product.subcategory ?? ""),
    attributes: attributesFrom(product.attributes_json), minPrice: Number(product.min_price), offerCount: Number(product.offer_count),
    offers: (offers.results ?? []).map((offer) => ({ supplier: String(offer.supplier), price: Number(offer.price),
      stock: offer.stock === null || offer.stock === undefined ? null : Number(offer.stock), importedAt: String(offer.imported_at) })),
  };
}

export async function getAdminOverview() {
  await ensureCatalogDb();
  const d1 = getD1();
  const [products, suppliers, offers, history] = await Promise.all([
    d1.prepare("SELECT COUNT(DISTINCT p.id) AS count FROM products p JOIN offers o ON o.product_id=p.id JOIN suppliers s ON s.id=o.supplier_id AND s.active_import_id=o.import_id").first<{ count: number }>(),
    d1.prepare("SELECT COUNT(*) AS count FROM suppliers WHERE active_import_id IS NOT NULL").first<{ count: number }>(),
    d1.prepare("SELECT COUNT(*) AS count FROM offers o JOIN suppliers s ON s.id=o.supplier_id AND s.active_import_id=o.import_id").first<{ count: number }>(),
    d1.prepare("SELECT i.id, s.name AS supplier, i.file_name, i.row_count, i.status, i.created_at FROM imports i JOIN suppliers s ON s.id=i.supplier_id ORDER BY i.id DESC LIMIT 10").all(),
  ]);
  return { products: Number(products?.count ?? 0), suppliers: Number(suppliers?.count ?? 0), offers: Number(offers?.count ?? 0), history: history.results ?? [] };
}

export async function replaceSupplierOffers(rows: ImportRow[], fileName: string) {
  await ensureCatalogDb();
  const d1 = getD1();
  const groups = new Map<string, ImportRow[]>();
  for (const row of rows) groups.set(row.supplier, [...(groups.get(row.supplier) ?? []), row]);
  const completed: Array<{ supplier: string; rows: number }> = [];
  for (const [supplierName, supplierRows] of groups) {
    await d1.prepare("INSERT OR IGNORE INTO suppliers(name) VALUES (?)").bind(supplierName).run();
    const supplier = await d1.prepare("SELECT id FROM suppliers WHERE name=?").bind(supplierName).first<{ id: number }>();
    if (!supplier) throw new Error(`Не удалось создать поставщика «${supplierName}».`);
    const staged = await d1.prepare("INSERT INTO imports(supplier_id, file_name, row_count, status) VALUES (?, ?, ?, 'staging') RETURNING id")
      .bind(supplier.id, fileName, supplierRows.length).first<{ id: number }>();
    if (!staged) throw new Error(`Не удалось начать импорт «${supplierName}».`);
    try {
      const payloads = supplierRows.map((row) => ({
        sku: row.sku,
        name: row.name,
        brand: row.brand,
        description: row.description,
        category: row.category,
        subcategory: row.subcategory,
        attributesJson: JSON.stringify(row.attributes),
        searchText: buildProductSearchText(row),
        price: row.price,
        stock: row.stock,
        rawJson: JSON.stringify(row.raw),
      }));
      const statements: D1PreparedStatement[] = [];
      for (const chunk of chunkForJson(payloads)) {
        const json = JSON.stringify(chunk);
        statements.push(
          d1.prepare(PRODUCT_BATCH_SQL).bind(json),
          d1.prepare(OFFER_BATCH_SQL).bind(supplier.id, staged.id, json),
        );
      }
      statements.push(
        d1.prepare("UPDATE suppliers SET active_import_id=? WHERE id=?").bind(staged.id, supplier.id),
        d1.prepare("UPDATE imports SET status='completed' WHERE id=?").bind(staged.id),
        d1.prepare("DELETE FROM offers WHERE supplier_id=? AND import_id<>?").bind(supplier.id, staged.id),
      );
      await d1.batch(statements);
      completed.push({ supplier: supplierName, rows: supplierRows.length });
    } catch (error) {
      await d1.prepare("UPDATE imports SET status='failed' WHERE id=?").bind(staged.id).run();
      throw error;
    }
  }
  await d1.batch([
    d1.prepare("DELETE FROM products WHERE NOT EXISTS (SELECT 1 FROM offers o JOIN suppliers s ON s.id=o.supplier_id AND s.active_import_id=o.import_id WHERE o.product_id=products.id)"),
    d1.prepare("PRAGMA optimize"),
  ]);
  return completed;
}

export async function saveImportProfile(input: { supplierName: string; fingerprint: string; mapping: unknown }) {
  await ensureCatalogDb();
  await getD1().prepare(`INSERT INTO import_profiles(supplier_name, fingerprint, mapping_json, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(fingerprint) DO UPDATE SET supplier_name=excluded.supplier_name, mapping_json=excluded.mapping_json, updated_at=CURRENT_TIMESTAMP`)
    .bind(input.supplierName, input.fingerprint, JSON.stringify(input.mapping)).run();
}

export async function findImportProfile(fingerprint: string) {
  await ensureCatalogDb();
  const row = await getD1().prepare("SELECT supplier_name, mapping_json FROM import_profiles WHERE fingerprint=?")
    .bind(fingerprint).first<{ supplier_name: string; mapping_json: string }>();
  return row ? { supplierName: row.supplier_name, mapping: JSON.parse(row.mapping_json) as unknown } : null;
}

export async function createImportAnalysis(input: { id: string; fileHash: string; fileName: string; supplierName: string; analysis: unknown; expiresAt: string }) {
  await ensureCatalogDb();
  const d1 = getD1();
  await d1.batch([
    d1.prepare("DELETE FROM import_analyses WHERE expires_at<=CURRENT_TIMESTAMP"),
    d1.prepare("INSERT OR REPLACE INTO import_analyses(id, file_hash, file_name, supplier_name, analysis_json, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(input.id, input.fileHash, input.fileName, input.supplierName, JSON.stringify(input.analysis), input.expiresAt),
  ]);
}

export async function getImportAnalysis(id: string) {
  await ensureCatalogDb();
  const row = await getD1().prepare("SELECT file_hash, file_name, supplier_name, analysis_json, expires_at FROM import_analyses WHERE id=?")
    .bind(id).first<{ file_hash: string; file_name: string; supplier_name: string; analysis_json: string; expires_at: string }>();
  return row ? { id, fileHash: row.file_hash, fileName: row.file_name, supplierName: row.supplier_name,
    analysis: JSON.parse(row.analysis_json) as unknown, expiresAt: row.expires_at } : null;
}
