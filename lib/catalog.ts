import { getD1 } from "../db";

export type CatalogProduct = {
  id: number;
  sku: string;
  name: string;
  brand: string;
  minPrice: number;
  offerCount: number;
};

export type ProductOffer = {
  supplier: string;
  price: number;
  importedAt: string;
};

export type ProductDetails = CatalogProduct & { offers: ProductOffer[] };

export type ImportRow = {
  sku: string;
  name: string;
  brand: string;
  price: number;
  supplier: string;
  raw: Record<string, unknown>;
};

let schemaReady: Promise<void> | null = null;

export function normalizeSearch(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

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
    d1.prepare(`CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      brand TEXT NOT NULL DEFAULT '',
      search_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      active_import_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'staging',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      supplier_id INTEGER NOT NULL,
      import_id INTEGER NOT NULL,
      price INTEGER NOT NULL CHECK(price > 0),
      raw_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(import_id, product_id)
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_products_search_text ON products(search_text)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_offers_product ON offers(product_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_offers_supplier_import ON offers(supplier_id, import_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_imports_supplier_created ON imports(supplier_id, created_at)"),
  ]);

  const seeded = await d1.prepare("SELECT value FROM app_meta WHERE key = 'demo_seed_v1'").first();
  if (seeded) return;

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
  const importResult = await d1
    .prepare("INSERT INTO imports(supplier_id, file_name, row_count, status) VALUES (?, ?, ?, 'completed') RETURNING id")
    .bind(supplier.id, "demo-catalog.xlsx", demoProducts.length)
    .first<{ id: number }>();
  if (!importResult) throw new Error("Не удалось подготовить демо-импорт.");

  for (const [sku, name, brand, price] of demoProducts) {
    await d1
      .prepare(`INSERT INTO products(sku, name, brand, search_text)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(sku) DO UPDATE SET name = excluded.name, brand = excluded.brand,
          search_text = excluded.search_text, updated_at = CURRENT_TIMESTAMP`)
      .bind(sku, name, brand, normalizeSearch(`${sku} ${name} ${brand}`))
      .run();
    const product = await d1.prepare("SELECT id FROM products WHERE sku = ?").bind(sku).first<{ id: number }>();
    if (!product) continue;
    await d1
      .prepare("INSERT OR REPLACE INTO offers(product_id, supplier_id, import_id, price, raw_json) VALUES (?, ?, ?, ?, ?)")
      .bind(product.id, supplier.id, importResult.id, price, JSON.stringify({ demo: true }))
      .run();
  }
  await d1.batch([
    d1.prepare("UPDATE suppliers SET active_import_id = ? WHERE id = ?").bind(importResult.id, supplier.id),
    d1.prepare("INSERT OR REPLACE INTO app_meta(key, value) VALUES ('demo_seed_v1', 'done')"),
    d1.prepare("PRAGMA optimize"),
  ]);
}

export async function getCatalogProducts(query = ""): Promise<CatalogProduct[]> {
  await ensureCatalogDb();
  const d1 = getD1();
  const normalized = normalizeSearch(query);
  const where = normalized ? "WHERE p.search_text LIKE ?" : "";
  const statement = d1.prepare(`SELECT p.id, p.sku, p.name, p.brand,
    MIN(o.price) AS min_price, COUNT(o.id) AS offer_count
    FROM products p
    JOIN offers o ON o.product_id = p.id
    JOIN suppliers s ON s.id = o.supplier_id AND s.active_import_id = o.import_id
    ${where}
    GROUP BY p.id, p.sku, p.name, p.brand
    ORDER BY min_price ASC, p.name ASC
    LIMIT 120`);
  const result = normalized ? await statement.bind(`%${normalized}%`).all() : await statement.all();
  return (result.results ?? []).map((row) => ({
    id: Number(row.id),
    sku: String(row.sku),
    name: String(row.name),
    brand: String(row.brand ?? ""),
    minPrice: Number(row.min_price),
    offerCount: Number(row.offer_count),
  }));
}

export async function getProductBySku(sku: string): Promise<ProductDetails | null> {
  await ensureCatalogDb();
  const d1 = getD1();
  const product = await d1.prepare(`SELECT p.id, p.sku, p.name, p.brand,
      MIN(o.price) AS min_price, COUNT(o.id) AS offer_count
    FROM products p
    JOIN offers o ON o.product_id = p.id
    JOIN suppliers s ON s.id = o.supplier_id AND s.active_import_id = o.import_id
    WHERE p.sku = ?
    GROUP BY p.id, p.sku, p.name, p.brand`).bind(sku).first();
  if (!product) return null;
  const offers = await d1.prepare(`SELECT s.name AS supplier, o.price, i.created_at AS imported_at
    FROM offers o
    JOIN suppliers s ON s.id = o.supplier_id AND s.active_import_id = o.import_id
    JOIN imports i ON i.id = o.import_id
    WHERE o.product_id = ?
    ORDER BY o.price ASC`).bind(product.id).all();
  return {
    id: Number(product.id),
    sku: String(product.sku),
    name: String(product.name),
    brand: String(product.brand ?? ""),
    minPrice: Number(product.min_price),
    offerCount: Number(product.offer_count),
    offers: (offers.results ?? []).map((offer) => ({
      supplier: String(offer.supplier),
      price: Number(offer.price),
      importedAt: String(offer.imported_at),
    })),
  };
}

export async function getAdminOverview() {
  await ensureCatalogDb();
  const d1 = getD1();
  const [products, suppliers, offers, history] = await Promise.all([
    d1.prepare(`SELECT COUNT(DISTINCT p.id) AS count FROM products p
      JOIN offers o ON o.product_id=p.id JOIN suppliers s ON s.id=o.supplier_id AND s.active_import_id=o.import_id`).first<{ count: number }>(),
    d1.prepare("SELECT COUNT(*) AS count FROM suppliers WHERE active_import_id IS NOT NULL").first<{ count: number }>(),
    d1.prepare(`SELECT COUNT(*) AS count FROM offers o JOIN suppliers s ON s.id=o.supplier_id AND s.active_import_id=o.import_id`).first<{ count: number }>(),
    d1.prepare(`SELECT i.id, s.name AS supplier, i.file_name, i.row_count, i.status, i.created_at
      FROM imports i JOIN suppliers s ON s.id=i.supplier_id
      ORDER BY i.id DESC LIMIT 10`).all(),
  ]);
  return {
    products: Number(products?.count ?? 0),
    suppliers: Number(suppliers?.count ?? 0),
    offers: Number(offers?.count ?? 0),
    history: history.results ?? [],
  };
}

export async function replaceSupplierOffers(rows: ImportRow[], fileName: string) {
  await ensureCatalogDb();
  const d1 = getD1();
  const groups = new Map<string, ImportRow[]>();
  for (const row of rows) {
    const group = groups.get(row.supplier) ?? [];
    group.push(row);
    groups.set(row.supplier, group);
  }

  const completed: Array<{ supplier: string; rows: number }> = [];
  for (const [supplierName, supplierRows] of groups) {
    await d1.prepare("INSERT OR IGNORE INTO suppliers(name) VALUES (?)").bind(supplierName).run();
    const supplier = await d1.prepare("SELECT id FROM suppliers WHERE name = ?").bind(supplierName).first<{ id: number }>();
    if (!supplier) throw new Error(`Не удалось создать поставщика «${supplierName}».`);
    const staged = await d1
      .prepare("INSERT INTO imports(supplier_id, file_name, row_count, status) VALUES (?, ?, ?, 'staging') RETURNING id")
      .bind(supplier.id, fileName, supplierRows.length)
      .first<{ id: number }>();
    if (!staged) throw new Error(`Не удалось начать импорт «${supplierName}».`);

    try {
      for (const row of supplierRows) {
        await d1.prepare(`INSERT INTO products(sku, name, brand, search_text)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(sku) DO UPDATE SET name=excluded.name, brand=excluded.brand,
            search_text=excluded.search_text, updated_at=CURRENT_TIMESTAMP`)
          .bind(row.sku, row.name, row.brand, normalizeSearch(`${row.sku} ${row.name} ${row.brand}`))
          .run();
        const product = await d1.prepare("SELECT id FROM products WHERE sku = ?").bind(row.sku).first<{ id: number }>();
        if (!product) throw new Error(`Не удалось сохранить товар ${row.sku}.`);
        await d1.prepare(`INSERT INTO offers(product_id, supplier_id, import_id, price, raw_json)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(import_id, product_id) DO UPDATE SET price=excluded.price, raw_json=excluded.raw_json`)
          .bind(product.id, supplier.id, staged.id, row.price, JSON.stringify(row.raw))
          .run();
      }

      await d1.batch([
        d1.prepare("UPDATE suppliers SET active_import_id = ? WHERE id = ?").bind(staged.id, supplier.id),
        d1.prepare("UPDATE imports SET status = 'completed' WHERE id = ?").bind(staged.id),
        d1.prepare("DELETE FROM offers WHERE supplier_id = ? AND import_id <> ?").bind(supplier.id, staged.id),
      ]);
      completed.push({ supplier: supplierName, rows: supplierRows.length });
    } catch (error) {
      await d1.prepare("UPDATE imports SET status = 'failed' WHERE id = ?").bind(staged.id).run();
      throw error;
    }
  }

  await d1.batch([
    d1.prepare(`DELETE FROM products WHERE NOT EXISTS (
      SELECT 1 FROM offers o JOIN suppliers s ON s.id=o.supplier_id AND s.active_import_id=o.import_id
      WHERE o.product_id=products.id
    )`),
    d1.prepare("PRAGMA optimize"),
  ]);
  return completed;
}
