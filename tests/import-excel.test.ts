import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { analyzeWorkbook, parseExcel, parseRows } from "../lib/import-excel";

const headers = [
  "ID товара", "Артикул", "Описание", "Код производителя", "Срок гарантии",
  "Кол-во в коробке", "D3", "Дил. тг.", "Наличие", "Спец.цена", "Спец.тенге",
];

function productSheet(name: string, specialPrice: number | null = 2276995) {
  return {
    sheet: name,
    data: [
      ["ВОЗВРАТ НА ГЛАВНУЮ СТРАНИЦУ"],
      [`Прайс-лист: DEALER_PRICE от 10.08.2026. Лист: ${name}`],
      [],
      headers,
      [`${name} ASUS`],
      [329289, "90NR0LI1 Notebook ASUS", "Ноутбук ASUS ROG Strix CU9 275HX/RTX5080/64G/1T", "90NR0LI1", 24, null, 5341, 2504929, 2, 4855, specialPrice],
    ],
  };
}

test("reads the downloadable fixed-format price list", async () => {
  const bytes = await readFile(new URL("../public/technovibor-import-template.xlsx", import.meta.url));
  const result = await parseExcel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0].price, 429990);
  assert.equal(result.rows[0].brand, "Lenovo");
});

test("skips service sheets and analyzes all product sheets", () => {
  const sheets = [
    { sheet: "Главная", data: [["www.vstrade.kz", "Курс USD/KZT = 469"], ["Контакты"], ["Анна", "Лев"]] },
    ...Array.from({ length: 11 }, (_, index) => productSheet(index === 0 ? "Ноутбуки" : `Категория ${index + 1}`)),
  ];
  const result = analyzeWorkbook(sheets, { fileName: "price 10.08.2026.xlsx" });
  assert.equal(result.sheets.filter((sheet) => sheet.included).length, 11);
  assert.equal(result.sheets.find((sheet) => sheet.name === "Главная")?.included, false);
  assert.equal(result.supplier, "VSTrade");
  assert.equal(result.rows.length, 11);
  assert.equal(result.rows[0].category, "Ноутбуки");
  assert.equal(result.rows[0].subcategory, "Ноутбуки ASUS");
  assert.equal(result.rows[0].price, 2276995);
  assert.equal(result.rows[0].stock, 2);
});

test("falls back to dealer KZT when special KZT price is empty", () => {
  const result = analyzeWorkbook([productSheet("Ноутбуки", null)], { fileName: "vstrade.xlsx" });
  assert.equal(result.rows[0].price, 2504929);
});

test("reports missing critical columns instead of importing", () => {
  const result = parseRows([
    ["Название", "Наличие"],
    ["Ноутбук", 10],
  ]);
  assert.equal(result.rows.length, 0);
  assert.ok(result.errors.some((error) => /цены|идентификатор/i.test(error)));
});

test("keeps a distinct fingerprint when a detected table needs manual mapping", () => {
  const first = parseRows([["Название", "Наличие"], ["Ноутбук", 10]]).analysis;
  const second = parseRows([["Описание", "Гарантия"], ["Монитор", 12]]).analysis;
  assert.notEqual(first.fingerprint, second.fingerprint);
});

test("reports invalid rows and does not import them", () => {
  const result = parseRows([
    ["Артикул", "Название", "Цена", "Поставщик"],
    ["NB-1", "ASUS Vivobook", -1, "Supplier A"],
    ["", "Acer Swift", 420000, "Supplier A"],
  ]);
  assert.equal(result.rows.length, 0);
  assert.ok(result.errors.length >= 2);
});
