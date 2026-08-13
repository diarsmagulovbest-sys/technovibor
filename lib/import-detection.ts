import type { ColumnMapping, ColumnRole, DetectedTable, MappingOverrides, MappingSet } from "./import-types";

type AliasRule = { role: ColumnRole; patterns: RegExp[]; confidence: number; reason: string };

const aliasRules: AliasRule[] = [
  { role: "special_price_kzt", patterns: [/спец.*(тенге|тг)/, /акци.*(тенге|тг)/, /промо.*(тенге|тг)/], confidence: 0.99, reason: "заголовок специальной цены в тенге" },
  { role: "price_kzt", patterns: [/дил.*(тенге|тг)/, /цена.*(тенге|тг)/, /стоим.*(тенге|тг)/, /^цена$/, /^ррц$/, /^дил тг$/], confidence: 0.97, reason: "заголовок цены в тенге" },
  { role: "external_id", patterns: [/^id( товара)?$/, /идентификатор/, /^код товара$/], confidence: 0.96, reason: "заголовок внешнего ID" },
  { role: "article", patterns: [/^артикул$/, /^арт(икул)?$/], confidence: 0.97, reason: "заголовок артикула" },
  { role: "sku", patterns: [/код производителя/, /manufacturer.*code/, /^sku$/, /^mpn$/], confidence: 0.99, reason: "заголовок кода производителя" },
  { role: "name", patterns: [/^название$/, /^наименование$/, /^товар$/, /^модель$/], confidence: 0.99, reason: "заголовок названия" },
  { role: "description", patterns: [/описание/, /характеристик/, /спецификац/], confidence: 0.98, reason: "заголовок описания" },
  { role: "name", patterns: [/описание/], confidence: 0.84, reason: "описание используется как полное название" },
  { role: "brand", patterns: [/^бренд$/, /производитель/, /^марка$/], confidence: 0.88, reason: "заголовок бренда" },
  { role: "stock", patterns: [/наличие/, /остаток/, /склад/, /кол.*во доступ/], confidence: 0.98, reason: "заголовок остатка" },
  { role: "warranty", patterns: [/гарант/], confidence: 0.97, reason: "заголовок гарантии" },
  { role: "supplier", patterns: [/поставщик/, /дистрибьютор/], confidence: 0.98, reason: "заголовок поставщика" },
  { role: "category", patterns: [/категор/, /группа/, /раздел/], confidence: 0.94, reason: "заголовок категории" },
];

export function cleanCell(value: unknown) {
  return String(value ?? "").normalize("NFKC").replace(/\u00a0/g, " ").trim();
}

export function normalizeHeader(value: unknown) {
  return cleanCell(value)
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function candidatesForHeader(header: unknown, column: number): ColumnMapping[] {
  const normalized = normalizeHeader(header);
  if (!normalized) return [];
  return aliasRules
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(normalized)))
    .map((rule) => ({
      role: rule.role,
      column,
      header: cleanCell(header),
      confidence: rule.confidence,
      reason: rule.reason,
      alternatives: [],
    }));
}

function headerScore(row: unknown[]) {
  const candidates = row.flatMap((header, column) => candidatesForHeader(header, column));
  const roles = new Set(candidates.map((candidate) => candidate.role));
  const strong = candidates.filter((candidate) => candidate.confidence >= 0.9).length;
  const hasText = row.filter((value) => cleanCell(value)).length;
  return { candidates, roleCount: roles.size, score: roles.size * 2 + strong + Math.min(hasText, 8) * 0.1 };
}

function detectMappings(headers: unknown[]): MappingSet {
  const byRole = new Map<ColumnRole, ColumnMapping[]>();
  headers.forEach((header, column) => {
    for (const candidate of candidatesForHeader(header, column)) {
      const list = byRole.get(candidate.role) ?? [];
      list.push(candidate);
      byRole.set(candidate.role, list);
    }
  });

  const mapping: MappingSet = {};
  for (const [role, values] of byRole) {
    values.sort((left, right) => right.confidence - left.confidence || left.column - right.column);
    const selected = values[0];
    mapping[role] = {
      ...selected,
      alternatives: values.slice(1).map(({ column, header, confidence }) => ({ column, header, confidence })),
    };
  }

  if (!mapping.name && mapping.article) {
    mapping.name = { ...mapping.article, role: "name", confidence: 0.62, reason: "артикул используется как короткое название" };
  }
  return mapping;
}

export function detectTable(sheetName: string, matrix: unknown[][]): DetectedTable | null {
  let best: { row: number; score: number; roleCount: number } | null = null;
  const scanLimit = Math.min(matrix.length, 80);
  for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
    const row = matrix[rowIndex] ?? [];
    const scored = headerScore(row);
    if (scored.roleCount < 3) continue;
    if (!best || scored.score > best.score) best = { row: rowIndex, score: scored.score, roleCount: scored.roleCount };
  }
  if (!best) return null;

  const headers = (matrix[best.row] ?? []).map(cleanCell);
  const mapping = detectMappings(headers);
  const identifier = mapping.sku ?? mapping.article ?? mapping.external_id;
  const price = mapping.special_price_kzt ?? mapping.price_kzt;
  const confidence = Math.min(mapping.name?.confidence ?? 0, identifier?.confidence ?? 0, price?.confidence ?? 0);
  const warnings: string[] = [];
  if (!mapping.name) warnings.push("Не найдена колонка названия.");
  if (!identifier) warnings.push("Не найдена колонка идентификатора.");
  if (!price) warnings.push("Не найдена колонка цены в тенге.");

  return {
    id: `${normalizeHeader(sheetName) || "sheet"}-${best.row + 1}`,
    sheetName,
    headerRow: best.row,
    headers,
    rows: matrix.slice(best.row + 1),
    mapping,
    confidence,
    warnings,
  };
}

export function applyMapping(table: DetectedTable, overrides: MappingOverrides = {}): DetectedTable {
  const changes = overrides[table.id];
  if (!changes) return table;
  const mapping: MappingSet = { ...table.mapping };
  for (const [role, column] of Object.entries(changes) as Array<[ColumnRole, number | null]>) {
    if (column === null || column < 0) {
      delete mapping[role];
      continue;
    }
    mapping[role] = {
      role,
      column,
      header: table.headers[column] ?? `Колонка ${column + 1}`,
      confidence: 1,
      reason: "подтверждено администратором",
      alternatives: [],
    };
  }
  return { ...table, mapping };
}
