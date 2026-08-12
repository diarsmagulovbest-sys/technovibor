import { isAdminRequest } from "../../../../lib/admin-auth";
import { getAdminOverview } from "../../../../lib/catalog";

export async function GET(request: Request) {
  if (!(await isAdminRequest(request))) return Response.json({ message: "Требуется вход." }, { status: 401 });
  return Response.json(await getAdminOverview());
}
