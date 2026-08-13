import { isAdminRequest } from "../../../../lib/admin-auth";
import { importService } from "../../../../lib/import-runtime";
import { ImportWorkflowError } from "../../../../lib/import-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await isAdminRequest(request))) return Response.json({ message: "Требуется вход." }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ message: "Выберите Excel-файл." }, { status: 400 });
  if (!file.name.toLocaleLowerCase().endsWith(".xlsx") || file.size > 5 * 1024 * 1024) {
    return Response.json({ message: "Нужен файл .xlsx размером до 5 МБ." }, { status: 400 });
  }
  try {
    const input = await file.arrayBuffer();
    const preview = await importService.analyzeImport({ input, fileName: file.name });
    if (preview.errors.length || preview.requiresConfirmation) {
      return Response.json({ message: "Проверьте распознанную структуру перед импортом.", ...preview }, { status: 409 });
    }
    const result = await importService.commitImport({ input, fileName: file.name, analysisId: preview.analysisId });
    return Response.json({ message: `Импортировано ${result.rowCount} товаров.`, ...result });
  } catch (error) {
    if (error instanceof ImportWorkflowError) {
      return Response.json({ message: error.message, code: error.code, errors: error.details }, { status: 422 });
    }
    return Response.json({ message: error instanceof Error ? error.message : "Не удалось прочитать Excel-файл." }, { status: 500 });
  }
}
