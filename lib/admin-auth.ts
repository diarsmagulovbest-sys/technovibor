import { env } from "cloudflare:workers";

const COOKIE_NAME = "technovibor_admin";
const encoder = new TextEncoder();

function runtimeValue(name: string, fallback: string) {
  const bindings = env as unknown as Record<string, unknown>;
  const bindingValue = bindings[name];
  if (typeof bindingValue === "string" && bindingValue) return bindingValue;
  const processValue = typeof process !== "undefined" ? process.env[name] : undefined;
  return processValue || fallback;
}

export function adminCredentials() {
  return {
    username: runtimeValue("ADMIN_USERNAME", "admin"),
    password: runtimeValue("ADMIN_PASSWORD", "catalog-demo"),
  };
}

async function expectedToken() {
  const { username, password } = adminCredentials();
  const secret = runtimeValue("ADMIN_SESSION_SECRET", "local-catalog-session-secret-change-me");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`${username}:${password}:${secret}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function isAdminRequest(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === COOKIE_NAME)?.[1];
  return Boolean(cookie && cookie === (await expectedToken()));
}

export async function createAdminCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${await expectedToken()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure}`;
}

export function clearAdminCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}
