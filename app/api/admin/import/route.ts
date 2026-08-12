import { isAdminRequest } from "../../../../lib/admin-auth";
import { replaceSupplierOffers } from "../../../../lib/catalog";
import { parseExcel } from "../../../../lib/import-excel";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await isAdminRequest(request))) return Response.json({ message: "Требуется вход." }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ message: "Выберите Excel-файл." }, { status: 400 });
  if (!file.name.toLocaleLowerCase().endsWith(".xlsx")) return Response.json({ message: "Поддерживаются только файлы .xlsx." }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return Response.json({ message: "Файл превышает лимит 5 МБ." }, { status: 400 });

  try {
    const parsed = await parseExcel(file);
    if (parsed.errors.length) return Response.json({ message: "Исправьте ошибки в файле.", errors: parsed.errors.slice(0, 100) }, { status: 422 });
    if (parsed.rows.length > 10_000) return Response.json({ message: "В файле больше 10 000 строк." }, { status: 400 });
    const completed = await replaceSupplierOffers(parsed.rows, file.name);
    const suppliers = completed.map((item) => item.supplier).join(", ");
    return Response.json({ message: `Импортировано ${parsed.rows.length} строк. Обновлены поставщики: ${suppliers}.`, completed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось прочитать Excel-файл.";
    return Response.json({ message }, { status: 500 });
  }
}
