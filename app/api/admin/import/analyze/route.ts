import { isAdminRequest } from "../../../../../lib/admin-auth";
import { importService } from "../../../../../lib/import-runtime";

export const dynamic = "force-dynamic";

function validateFile(file: FormDataEntryValue | null) {
  if (!(file instanceof File)) return "Выберите Excel-файл.";
  if (!file.name.toLocaleLowerCase().endsWith(".xlsx")) return "Поддерживаются только файлы .xlsx.";
  if (file.size > 5 * 1024 * 1024) return "Файл превышает лимит 5 МБ.";
  return null;
}

export async function POST(request: Request) {
  if (!(await isAdminRequest(request))) return Response.json({ message: "Требуется вход." }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  const invalid = validateFile(file);
  if (invalid || !(file instanceof File)) return Response.json({ message: invalid }, { status: 400 });
  try {
    const supplier = String(form.get("supplier") ?? "").trim() || undefined;
    const preview = await importService.analyzeImport({ input: await file.arrayBuffer(), fileName: file.name, supplier });
    return Response.json(preview, { status: preview.errors.length ? 422 : 200 });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "Не удалось прочитать Excel-файл." }, { status: 500 });
  }
}
