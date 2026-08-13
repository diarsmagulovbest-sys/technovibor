import assert from "node:assert/strict";
import test from "node:test";
import { buildProductSearchText } from "../lib/catalog-search";

test("catalog search text includes category, description, and detected specifications", () => {
  const search = buildProductSearchText({
    sku: "90NR0LI1",
    name: "ASUS ROG Strix",
    brand: "ASUS",
    description: "Игровой ноутбук",
    category: "Ноутбуки",
    subcategory: "Ноутбуки ASUS",
    attributes: { rulesVersion: 1, cpu: "Intel Core Ultra 9 275HX", ramGb: 64, gpu: "NVIDIA GeForce RTX 5080" },
  });
  assert.match(search, /ноутбуки/);
  assert.match(search, /intel core ultra 9 275hx/);
  assert.match(search, /nvidia geforce rtx 5080/);
  assert.match(search, /64/);
});
