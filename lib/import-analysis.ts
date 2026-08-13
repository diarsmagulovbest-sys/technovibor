import { applyMapping, cleanCell, detectTable, normalizeHeader } from "./import-detection";
import type { AdaptiveImportRow, ImportAnalysis, MappingOverrides, WorkbookSheet } from "./import-types";
import { extractProductAttributes } from "./spec-extraction";

const knownBrands = ["Lenovo", "ASUS", "Acer", "HP", "Dell", "MSI", "Apple", "Huawei", "Honor", "Samsung", "Xiaomi", "Gigabyte", "AMD", "Intel", "UGREEN", "Ippon", "Epson"];

type AnalyzeOptions = { fileName?: string; overrides?: MappingOverrides; supplier?: string };

function numeric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = cleanCell(value).replace(/[\s₸$€]/g, "").replace(/,/g, ".");
  if (!normalized) return null;
  const result = Number(normalized);
  return Number.isFinite(result) ? result : null;
}

function inferBrand(text: string) {
  const normalized = text.toLocaleLowerCase("ru");
  return knownBrands.find((brand) => normalized.includes(brand.toLocaleLowerCase("ru"))) ?? "";
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function supplierFromWorkbook(sheets: WorkbookSheet[], fileName: string) {
  const sample = sheets.flatMap((sheet) => sheet.data.slice(0, 20).flat().map(cleanCell)).join(" ").toLocaleLowerCase("ru");
  const file = fileName.toLocaleLowerCase("ru");
  if (sample.includes("vstrade.kz") || file.includes("vstrade")) return { name: "VSTrade", confidence: 0.99 };
  const priceList = sample.match(/прайс[- ]лист:\s*([^\n.]{2,60})/i)?.[1]?.trim();
  if (priceList && !/^dealer_price/i.test(priceList)) return { name: priceList, confidence: 0.72 };
  const stem = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return { name: stem || "Новый поставщик", confidence: 0.45 };
}

function isRepeatedHeader(row: unknown[], headers: string[]) {
  let matches = 0;
  for (let index = 0; index < Math.min(row.length, headers.length); index += 1) {
    if (normalizeHeader(row[index]) && normalizeHeader(row[index]) === normalizeHeader(headers[index])) matches += 1;
  }
  return matches >= 3;
}

export function analyzeWorkbook(sheets: WorkbookSheet[], options: AnalyzeOptions = {}): ImportAnalysis {
  const fileName = options.fileName ?? "price.xlsx";
  const detectedSupplier = options.supplier
    ? { name: options.supplier.trim(), confidence: 1 }
    : supplierFromWorkbook(sheets, fileName);
  const rows: AdaptiveImportRow[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const sheetAnalyses: ImportAnalysis["sheets"] = [];
  const signatures: string[] = [];

  for (const sheet of sheets) {
    const detected = detectTable(sheet.sheet, sheet.data);
    if (!detected) {
      sheetAnalyses.push({ name: sheet.sheet, included: false, reason: "Товарная таблица не найдена.", productRows: 0, invalidRows: 0 });
      continue;
    }
    const table = applyMapping(detected, options.overrides);
    const mapping = table.mapping;
    const identifierMapping = mapping.sku ?? mapping.article ?? mapping.external_id;
    const priceMapping = mapping.special_price_kzt ?? mapping.price_kzt;
    if (!mapping.name || !identifierMapping || !priceMapping) {
      const missing = [!mapping.name && "название", !identifierMapping && "идентификатор", !priceMapping && "цена в тенге"].filter(Boolean).join(", ");
      errors.push(`${sheet.sheet}: не найдены критические поля: ${missing}.`);
      sheetAnalyses.push({ name: sheet.sheet, included: false, reason: `Не найдены критические поля: ${missing}.`, table, productRows: 0, invalidRows: 0 });
      continue;
    }

    signatures.push(`${normalizeHeader(sheet.sheet)}:${table.headers.map(normalizeHeader).join("|")}`);
    let currentSubcategory = "";
    let productRows = 0;
    let invalidRows = 0;
    const seenIds = new Set<string>();

    for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
      const source = table.rows[rowIndex] ?? [];
      const nonEmpty = source.filter((value) => cleanCell(value)).length;
      if (!nonEmpty || isRepeatedHeader(source, table.headers)) continue;
      const rawName = cleanCell(source[mapping.name.column]);
      const description = cleanCell(source[mapping.description?.column ?? mapping.name.column]);
      const article = cleanCell(source[mapping.article?.column ?? -1]);
      const manufacturerCode = cleanCell(source[mapping.sku?.column ?? -1]);
      const externalId = cleanCell(source[mapping.external_id?.column ?? -1]);
      const regularPrice = numeric(source[mapping.price_kzt?.column ?? -1]);
      const specialPrice = numeric(source[mapping.special_price_kzt?.column ?? -1]);
      const price = specialPrice && specialPrice > 0 ? specialPrice : regularPrice;

      if (nonEmpty === 1 && !price) {
        currentSubcategory = cleanCell(source.find((value) => cleanCell(value)));
        continue;
      }

      const stableSource = manufacturerCode || article || externalId;
      if (!rawName || !price || price <= 0 || !stableSource) {
        if (nonEmpty >= 2) {
          invalidRows += 1;
          const reasons = [!rawName && "нет названия", (!price || price <= 0) && "нет положительной цены", !stableSource && "нет идентификатора"].filter(Boolean).join(", ");
          errors.push(`${sheet.sheet}, строка ${table.headerRow + rowIndex + 2}: ${reasons}.`);
        }
        continue;
      }

      const brandFromColumn = cleanCell(source[mapping.brand?.column ?? -1]);
      const brand = brandFromColumn || inferBrand(`${article} ${rawName} ${description}`);
      const normalizedIdentity = normalizeHeader(`${brand} ${stableSource} ${rawName}`);
      const sku = stableSource || `AUTO-${fnv1a(normalizedIdentity)}`;
      if (seenIds.has(sku)) {
        invalidRows += 1;
        errors.push(`${sheet.sheet}, строка ${table.headerRow + rowIndex + 2}: повторный идентификатор ${sku}.`);
        continue;
      }
      seenIds.add(sku);
      const supplierValue = cleanCell(source[mapping.supplier?.column ?? -1]) || detectedSupplier.name;
      const categoryValue = cleanCell(source[mapping.category?.column ?? -1]) || sheet.sheet;
      const raw = Object.fromEntries(table.headers.map((header, column) => [header || `Колонка ${column + 1}`, source[column] ?? ""]));
      rows.push({
        sku,
        name: rawName,
        description,
        brand,
        price: Math.round(price),
        stock: numeric(source[mapping.stock?.column ?? -1]),
        warrantyMonths: numeric(source[mapping.warranty?.column ?? -1]),
        supplier: supplierValue,
        category: categoryValue,
        subcategory: currentSubcategory,
        attributes: extractProductAttributes({ name: rawName, description, category: categoryValue }),
        raw,
        source: { sheet: sheet.sheet, row: table.headerRow + rowIndex + 2 },
      });
      productRows += 1;
    }

    sheetAnalyses.push({ name: sheet.sheet, included: true, reason: "Товарная таблица распознана.", table, productRows, invalidRows });
  }

  if (!rows.length && !errors.length) errors.push("В книге не найдено строк с товарами.");
  if (rows.length > 10_000) errors.push("В файле больше 10 000 товарных строк.");
  const included = sheetAnalyses.filter((sheet) => sheet.included && sheet.table);
  const confidence = included.length ? Math.min(...included.map((sheet) => sheet.table?.confidence ?? 0)) : 0;
  const unresolved = included.some((sheet) => {
    const mapping = sheet.table?.mapping;
    return !mapping?.name || !(mapping.sku ?? mapping.article ?? mapping.external_id) || !(mapping.special_price_kzt ?? mapping.price_kzt);
  });

  return {
    supplier: rows[0]?.supplier || detectedSupplier.name,
    supplierConfidence: rows[0]?.supplier !== detectedSupplier.name ? 0.98 : detectedSupplier.confidence,
    fingerprint: fnv1a(signatures.sort().join("||")),
    sheets: sheetAnalyses,
    rows,
    warnings,
    errors,
    examples: rows.slice(0, 5),
    requiresConfirmation: unresolved || confidence < 0.8 || detectedSupplier.confidence < 0.7,
    confidence,
  };
}
