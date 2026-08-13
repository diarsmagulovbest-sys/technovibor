import assert from "node:assert/strict";
import test from "node:test";
import { detectTable, normalizeHeader } from "../lib/import-detection";

const headers = [
  "ID товара", "Артикул", "Описание", "Код производителя", "Срок гарантии",
  "Кол-во в коробке", "D3", "Дил. тг.", "Наличие", "Спец.цена", "Спец.тенге",
];

test("normalizes punctuation and Russian header variants", () => {
  assert.equal(normalizeHeader("  Спец. тг. "), "спец тг");
  assert.equal(normalizeHeader("КОЛ-ВО  в коробке"), "кол во в коробке");
});

test("finds a VSTrade table on Excel row 4 and maps KZT prices", () => {
  const table = detectTable("Ноутбуки", [
    ["ВОЗВРАТ НА ГЛАВНУЮ СТРАНИЦУ"],
    ["Прайс-лист: DEALER_PRICE от 10.08.2026. Лист: Ноутбуки"],
    [],
    headers,
    ["Ноутбуки ASUS"],
    [329289, "90NR0LI1 Notebook ASUS", "Ноутбук ASUS ROG Strix CU9 275HX/RTX5080/64G/1T", "90NR0LI1", 24, null, 5341, 2504929, 2, 4855, 2276995],
  ]);

  assert.ok(table);
  assert.equal(table.headerRow, 3);
  assert.equal(table.mapping.name?.column, 2);
  assert.equal(table.mapping.sku?.column, 3);
  assert.equal(table.mapping.price_kzt?.column, 7);
  assert.equal(table.mapping.special_price_kzt?.column, 10);
  assert.equal(table.mapping.stock?.column, 8);
});

test("does not treat a contacts sheet as a product table", () => {
  const table = detectTable("Главная", [
    ["www.vstrade.kz", "Курс USD/KZT = 469"],
    ["Контакты"],
    ["Анна", "Лев", "Андрей"],
    ["Внутр.: 1247", "+7 707 000 00 00"],
  ]);
  assert.equal(table, null);
});
