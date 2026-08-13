import type { ProductAttributes } from "./import-types";

type SearchProduct = {
  sku: string;
  name: string;
  brand: string;
  description: string;
  category: string;
  subcategory: string;
  attributes: ProductAttributes;
};

export function normalizeSearch(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

export function buildProductSearchText(product: SearchProduct) {
  const attributes = Object.values(product.attributes).filter((value) => value !== undefined).join(" ");
  return normalizeSearch([
    product.sku, product.name, product.brand, product.description,
    product.category, product.subcategory, attributes,
  ].join(" "));
}
