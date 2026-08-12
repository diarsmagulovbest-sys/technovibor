import { adminCredentials, createAdminCookie } from "../../../../lib/admin-auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { username?: string; password?: string };
  const expected = adminCredentials();
  if (body.username !== expected.username || body.password !== expected.password) {
    return Response.json({ message: "Неверный логин или пароль." }, { status: 401 });
  }
  return Response.json(
    { ok: true },
    { headers: { "set-cookie": await createAdminCookie(request) } },
  );
}
