import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseExcel, parseRows } from "../lib/import-excel";

test("reads the downloadable fixed-format price list", async () => {
  const bytes = await readFile(new URL("../public/technovibor-import-template.xlsx", import.meta.url));
  const result = await parseExcel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0].price, 429990);
  assert.equal(result.rows[0].brand, "Lenovo");
});

test("reports missing required columns", () => {
  const result = parseRows([
    ["Название", "Цена"],
    ["Ноутбук", 100000],
  ]);
  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0], /Артикул/);
  assert.match(result.errors[0], /Поставщик/);
});

test("reports invalid rows and does not import them", () => {
  const result = parseRows([
    ["Артикул", "Название", "Цена", "Поставщик"],
    ["NB-1", "ASUS Vivobook", -1, "Supplier A"],
    ["", "Acer Swift", 420000, "Supplier A"],
  ]);
  assert.equal(result.rows.length, 0);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0], /положительным числом/);
  assert.match(result.errors[1], /артикула/);
});
