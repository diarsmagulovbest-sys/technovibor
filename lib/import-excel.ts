import readXlsxFile from "read-excel-file/browser";
import { analyzeWorkbook } from "./import-analysis";
import type { ImportAnalysis, MappingOverrides, WorkbookSheet } from "./import-types";

export { analyzeWorkbook } from "./import-analysis";

type ParsedImport = { rows: ImportAnalysis["rows"]; errors: string[]; analysis: ImportAnalysis };

export async function analyzeExcel(
  input: File | Blob | ArrayBuffer,
  options: { fileName?: string; overrides?: MappingOverrides; supplier?: string } = {},
) {
  const workbook = await readXlsxFile(input);
  return analyzeWorkbook(workbook as unknown as WorkbookSheet[], options);
}

export async function parseExcel(
  input: File | Blob | ArrayBuffer,
  overrides: MappingOverrides = {},
  fileName = "price.xlsx",
): Promise<ParsedImport> {
  const analysis = await analyzeExcel(input, { fileName, overrides });
  return { rows: analysis.rows, errors: analysis.errors, analysis };
}

export function parseRows(matrix: unknown[][]): ParsedImport {
  const analysis = analyzeWorkbook([{ sheet: "Прайс", data: matrix }], { fileName: "price.xlsx" });
  return { rows: analysis.rows, errors: analysis.errors, analysis };
}
