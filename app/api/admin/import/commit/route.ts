import { isAdminRequest } from "../../../../../lib/admin-auth";
import { importService } from "../../../../../lib/import-runtime";
import { ImportWorkflowError } from "../../../../../lib/import-service";
import type { MappingOverrides } from "../../../../../lib/import-types";

export const dynamic = "force-dynamic";

function parseOverrides(value: FormDataEntryValue | null): MappingOverrides {
  if (typeof value !== "string" || !value) return {};
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Некорректные настройки колонок.");
  return parsed as MappingOverrides;
}

export async function POST(request: Request) {
  if (!(await isAdminRequest(request))) return Response.json({ message: "Требуется вход." }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  const analysisId = String(form.get("analysisId") ?? "").trim();
  if (!(file instanceof File)) return Response.json({ message: "Выберите исходный Excel-файл." }, { status: 400 });
  if (!analysisId) return Response.json({ message: "Сначала проанализируйте файл." }, { status: 400 });
  if (!file.name.toLocaleLowerCase().endsWith(".xlsx") || file.size > 5 * 1024 * 1024) {
    return Response.json({ message: "Нужен файл .xlsx размером до 5 МБ." }, { status: 400 });
  }
  try {
    const result = await importService.commitImport({
      input: await file.arrayBuffer(),
      fileName: file.name,
      analysisId,
      supplier: String(form.get("supplier") ?? "").trim() || undefined,
      overrides: parseOverrides(form.get("overrides")),
    });
    return Response.json({ message: `Импортировано ${result.rowCount} товаров.`, ...result });
  } catch (error) {
    if (error instanceof ImportWorkflowError) {
      const status = error.code === "ANALYSIS_NOT_FOUND" || error.code === "ANALYSIS_EXPIRED" ? 410 : 422;
      return Response.json({ message: error.message, code: error.code, errors: error.details }, { status });
    }
    return Response.json({ message: error instanceof Error ? error.message : "Не удалось выполнить импорт." }, { status: 500 });
  }
}
