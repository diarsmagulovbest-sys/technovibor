declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ADMIN_USERNAME?: string;
    ADMIN_PASSWORD?: string;
    ADMIN_SESSION_SECRET?: string;
  }
}
