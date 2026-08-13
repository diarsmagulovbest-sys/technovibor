"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, LockKeyhole, PackageSearch, Store, Tags } from "lucide-react";
import { ImportAnalyzer } from "./ImportAnalyzer";
import { AdminHeaderActions } from "./AdminNavigation";

type HistoryRow = { id: number; supplier: string; file_name: string; row_count: number; status: string; created_at: string };
type Overview = { products: number; suppliers: number; offers: number; history: HistoryRow[] };

export function AdminConsole() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/admin/status", { cache: "no-store" });
    if (response.status === 401) { setAuthenticated(false); setOverview(null); return; }
    setOverview(await response.json() as Overview); setAuthenticated(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/status", { cache: "no-store" }).then(async (response) => {
      if (cancelled) return;
      if (response.status === 401) { setAuthenticated(false); return; }
      setOverview(await response.json() as Overview); setAuthenticated(true);
    }).catch(() => { if (!cancelled) setAuthenticated(false); });
    return () => { cancelled = true; };
  }, []);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: form.get("username"), password: form.get("password") }) });
    if (!response.ok) { setMessage({ type: "error", text: "Неверный логин или пароль." }); setLoading(false); return; }
    await refresh(); setLoading(false);
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" }); setAuthenticated(false); setOverview(null);
  }

  if (authenticated === null) return <div className="admin-loading" role="status">Проверяем доступ…</div>;
  if (!authenticated) return <section className="login-layout">
    <div className="login-copy"><p className="eyebrow">Закрытый раздел</p><h1>Управление каталогом</h1><p>Войдите, чтобы анализировать прайсы поставщиков и подтверждать обновление каталога.</p><div className="security-note"><LockKeyhole size={21} /><span>Покупателям этот раздел недоступен.</span></div></div>
    <form className="login-card" onSubmit={login}>
      <div className="login-icon"><LockKeyhole size={25} /></div><h2>Вход администратора</h2>
      <label htmlFor="username">Логин</label><input id="username" name="username" defaultValue="admin" autoComplete="username" required />
      <label htmlFor="password">Пароль</label><input id="password" name="password" type="password" autoComplete="current-password" required />
      {message && <p className={`form-message ${message.type}`} role="alert">{message.text}</p>}
      <button className="button" type="submit" disabled={loading}>{loading ? "Входим…" : "Войти"}</button>
    </form>
  </section>;

  return <section className="admin-console">
    <div className="admin-title"><div><p className="eyebrow">Админ-панель</p><h1>Прайсы и каталог</h1><p>Система сама находит товарные таблицы, цены и характеристики. Перед записью вы увидите результат и сможете исправить сопоставление.</p></div><AdminHeaderActions onLogout={logout} /></div>
    <div className="stats-grid">
      <article><PackageSearch size={21} /><span>Товаров</span><strong>{overview?.products ?? 0}</strong></article>
      <article><Store size={21} /><span>Поставщиков</span><strong>{overview?.suppliers ?? 0}</strong></article>
      <article><Tags size={21} /><span>Предложений</span><strong>{overview?.offers ?? 0}</strong></article>
    </div>
    <div className="admin-grid">
      <ImportAnalyzer onImported={refresh} />
      <aside className="template-card"><Download size={28} /><h2>Без строгого шаблона</h2><p>Можно загрузить обычный прайс поставщика. Если структура неоднозначна, система попросит указать нужные колонки.</p><a className="button secondary" href="/technovibor-import-template.xlsx" download>Скачать простой пример</a><small>Распознавание выполняется правилами и формулами — без ИИ.</small></aside>
    </div>
    <section className="history-section"><div className="section-heading"><div><p className="eyebrow">Журнал</p><h2>Последние импорты</h2></div></div><div className="offers-table-wrap"><table className="offers-table history-table"><thead><tr><th>Поставщик</th><th>Файл</th><th>Строк</th><th>Статус</th><th>Дата</th></tr></thead><tbody>{overview?.history.map((row) => <tr key={row.id}><td>{row.supplier}</td><td>{row.file_name}</td><td>{row.row_count}</td><td><span className={`status-pill ${row.status}`}>{statusLabel(row.status)}</span></td><td>{new Date(row.created_at.replace(" ", "T") + "Z").toLocaleString("ru-RU")}</td></tr>)}</tbody></table></div></section>
  </section>;
}

function statusLabel(status: string) {
  if (status === "completed") return "Готово";
  if (status === "failed") return "Ошибка";
  return "Обработка";
}
