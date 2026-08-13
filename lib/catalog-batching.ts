const encoder = new TextEncoder();

export const PRODUCT_BATCH_SQL = `INSERT INTO products(sku, name, brand, description, category, subcategory, attributes_json, search_text)
  SELECT json_extract(value, '$.sku'), json_extract(value, '$.name'), json_extract(value, '$.brand'),
    json_extract(value, '$.description'), json_extract(value, '$.category'), json_extract(value, '$.subcategory'),
    json_extract(value, '$.attributesJson'), json_extract(value, '$.searchText') FROM json_each(?) WHERE 1
  ON CONFLICT(sku) DO UPDATE SET name=excluded.name, brand=excluded.brand, description=excluded.description,
    category=excluded.category, subcategory=excluded.subcategory, attributes_json=excluded.attributes_json,
    search_text=excluded.search_text, updated_at=CURRENT_TIMESTAMP`;

export const OFFER_BATCH_SQL = `INSERT INTO offers(product_id, supplier_id, import_id, price, stock, raw_json)
  SELECT p.id, ?, ?, CAST(json_extract(item.value, '$.price') AS INTEGER),
    CAST(json_extract(item.value, '$.stock') AS INTEGER), json_extract(item.value, '$.rawJson')
  FROM json_each(?) AS item JOIN products p ON p.sku=json_extract(item.value, '$.sku') WHERE 1
  ON CONFLICT(import_id, product_id) DO UPDATE SET price=excluded.price, stock=excluded.stock, raw_json=excluded.raw_json`;

export function chunkForJson<T>(values: T[], maxBytes = 1_400_000): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let currentBytes = 2;

  for (const value of values) {
    const valueBytes = encoder.encode(JSON.stringify(value)).byteLength;
    if (valueBytes + 2 > maxBytes) throw new Error("Одна строка товара слишком большая для сохранения.");
    const separatorBytes = current.length ? 1 : 0;
    if (current.length && currentBytes + separatorBytes + valueBytes > maxBytes) {
      chunks.push(current);
      current = [];
      currentBytes = 2;
    }
    current.push(value);
    currentBytes += (current.length > 1 ? 1 : 0) + valueBytes;
  }
  if (current.length) chunks.push(current);
  return chunks;
}
