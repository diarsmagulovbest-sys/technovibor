import readXlsxFile from "read-excel-file/browser";
import type { ImportRow } from "./catalog";

type ParsedImport = { rows: ImportRow[]; errors: string[] };

const requiredHeaders = ["Артикул", "Название", "Цена", "Поставщик"] as const;
const knownBrands = ["Lenovo", "ASUS", "Acer", "HP", "Dell", "MSI", "Apple", "Huawei", "Honor", "Samsung", "Xiaomi", "Gigabyte"];

function clean(value: unknown) {
  return String(value ?? "").normalize("NFKC").trim();
}

function headerKey(value: unknown) {
  return clean(value).toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/\s+/g, " ");
}

function inferBrand(name: string) {
  const lower = name.toLocaleLowerCase("ru");
  return knownBrands.find((brand) => lower.includes(brand.toLocaleLowerCase("ru"))) ?? "";
}

export async function parseExcel(input: File | Blob | ArrayBuffer): Promise<ParsedImport> {
  const workbook = await readXlsxFile(input);
  const firstSheet = workbook[0];
  if (!firstSheet) return { rows: [], errors: ["В книге нет листов."] };
  return parseRows(firstSheet.data as unknown[][]);
}

export function parseRows(matrix: unknown[][]): ParsedImport {
  if (!matrix.length) return { rows: [], errors: ["Первый лист пуст."] };

  const headerRow = matrix[0] as unknown[];
  const indexes = new Map<string, number>();
  headerRow.forEach((value, index) => indexes.set(headerKey(value), index));
  const missing = requiredHeaders.filter((header) => !indexes.has(headerKey(header)));
  if (missing.length) {
    return { rows: [], errors: [`Не найдены обязательные колонки: ${missing.join(", ")}.`] };
  }

  const valueAt = (row: unknown[], header: string) => row[indexes.get(headerKey(header)) ?? -1];
  const rows: ImportRow[] = [];
  const errors: string[] = [];

  for (let index = 1; index < matrix.length; index += 1) {
    const source = matrix[index] as unknown[];
    if (source.every((value) => clean(value) === "")) continue;
    const excelRow = index + 1;
    const sku = clean(valueAt(source, "Артикул"));
    const name = clean(valueAt(source, "Название"));
    const supplier = clean(valueAt(source, "Поставщик"));
    const priceValue = valueAt(source, "Цена");
    const price = typeof priceValue === "number"
      ? priceValue
      : Number(clean(priceValue).replace(/[\s\u00a0₸]/g, "").replace(",", "."));
    const brandFromFile = indexes.has(headerKey("Бренд")) ? clean(valueAt(source, "Бренд")) : "";

    const rowErrors: string[] = [];
    if (!sku) rowErrors.push("нет артикула");
    if (!name) rowErrors.push("нет названия");
    if (!supplier) rowErrors.push("нет поставщика");
    if (!Number.isFinite(price) || price <= 0) rowErrors.push("цена должна быть положительным числом");
    if (rowErrors.length) {
      errors.push(`Строка ${excelRow}: ${rowErrors.join(", ")}.`);
      continue;
    }

    const raw = Object.fromEntries(headerRow.map((header, column) => [clean(header), source[column] ?? ""]));
    rows.push({ sku, name, supplier, price: Math.round(price), brand: brandFromFile || inferBrand(name), raw });
  }

  if (!rows.length && !errors.length) errors.push("В файле нет строк с товарами.");
  return { rows, errors };
}
