import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { chunkForJson, OFFER_BATCH_SQL, PRODUCT_BATCH_SQL } from "../lib/catalog-batching";

test("chunks catalog payloads below the configured JSON byte limit", () => {
  const rows = Array.from({ length: 7 }, (_, index) => ({ sku: `SKU-${index}`, description: "x".repeat(40) }));
  const chunks = chunkForJson(rows, 180);
  assert.ok(chunks.length > 1);
  assert.deepEqual(chunks.flat(), rows);
  for (const chunk of chunks) assert.ok(new TextEncoder().encode(JSON.stringify(chunk)).byteLength <= 180);
});

test("rejects one payload that cannot fit in a D1 string value", () => {
  assert.throws(() => chunkForJson([{ description: "x".repeat(200) }], 100), /слишком большая/i);
});

test("batch SQL atomically upserts products and offers from JSON", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`CREATE TABLE products (id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    brand TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, subcategory TEXT NOT NULL,
    attributes_json TEXT NOT NULL, search_text TEXT NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE offers (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, supplier_id INTEGER NOT NULL,
    import_id INTEGER NOT NULL, price INTEGER NOT NULL, stock INTEGER, raw_json TEXT NOT NULL, UNIQUE(import_id, product_id));`);
  const json = JSON.stringify([{ sku: "SKU-1", name: "Notebook", brand: "ASUS", description: "16 GB", category: "Ноутбуки",
    subcategory: "ASUS", attributesJson: "{\"ramGb\":16}", searchText: "notebook 16", price: 450000, stock: 3, rawJson: "{}" }]);
  database.prepare(PRODUCT_BATCH_SQL).run(json);
  database.prepare(OFFER_BATCH_SQL).run(7, 9, json);
  assert.deepEqual({ ...database.prepare("SELECT sku, name FROM products").get() }, { sku: "SKU-1", name: "Notebook" });
  assert.deepEqual({ ...database.prepare("SELECT supplier_id, import_id, price, stock FROM offers").get() }, { supplier_id: 7, import_id: 9, price: 450000, stock: 3 });
});
