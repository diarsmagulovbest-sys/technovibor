"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, LockKeyhole, LogOut, PackageSearch, Store, Tags, UploadCloud } from "lucide-react";

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
    const data = await response.json() as Overview;
    setAuthenticated(true); setOverview(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/status", { cache: "no-store" })
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 401) { setAuthenticated(false); return; }
        setOverview(await response.json() as Overview);
        setAuthenticated(true);
      })
      .catch(() => { if (!cancelled) setAuthenticated(false); });
    return () => { cancelled = true; };
  }, []);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: form.get("username"), password: form.get("password") }) });
    if (!response.ok) { setMessage({ type: "error", text: "Неверный логин или пароль." }); setLoading(false); return; }
    await refresh(); setLoading(false);
  }

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/import", { method: "POST", body: form });
    const result = await response.json() as { message?: string; errors?: string[] };
    if (!response.ok) {
      setMessage({ type: "error", text: result.errors?.slice(0, 6).join(" ") || result.message || "Не удалось загрузить файл." });
      setLoading(false); return;
    }
    setMessage({ type: "success", text: result.message || "Прайс успешно обновлён." });
    event.currentTarget.reset(); await refresh(); setLoading(false);
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" }); setAuthenticated(false); setOverview(null);
  }

  if (authenticated === null) return <div className="admin-loading" role="status">Проверяем доступ…</div>;
  if (!authenticated) {
    return (
      <section className="login-layout">
        <div className="login-copy"><p className="eyebrow">Закрытый раздел</p><h1>Управление каталогом</h1><p>Войдите, чтобы заменить прайс поставщика и проверить результат импорта.</p><div className="security-note"><LockKeyhole size={21} /><span>Покупателям этот раздел недоступен.</span></div></div>
        <form className="login-card" onSubmit={login}>
          <div className="login-icon"><LockKeyhole size={25} /></div><h2>Вход администратора</h2>
          <label htmlFor="username">Логин</label><input id="username" name="username" defaultValue="admin" autoComplete="username" required />
          <label htmlFor="password">Пароль</label><input id="password" name="password" type="password" autoComplete="current-password" required />
          {message && <p className={`form-message ${message.type}`} role="alert">{message.text}</p>}
          <button className="button" type="submit" disabled={loading}>{loading ? "Входим…" : "Войти"}</button>
        </form>
      </section>
    );
  }

  return (
    <section className="admin-console">
      <div className="admin-title"><div><p className="eyebrow">Админ-панель</p><h1>Прайсы и каталог</h1><p>Загрузите файл по шаблону. Прайс каждого поставщика из файла будет полностью заменён.</p></div><button className="text-button" onClick={logout}><LogOut size={18} />Выйти</button></div>
      <div className="stats-grid">
        <article><PackageSearch size={21} /><span>Товаров</span><strong>{overview?.products ?? 0}</strong></article>
        <article><Store size={21} /><span>Поставщиков</span><strong>{overview?.suppliers ?? 0}</strong></article>
        <article><Tags size={21} /><span>Предложений</span><strong>{overview?.offers ?? 0}</strong></article>
      </div>
      <div className="admin-grid">
        <form className="upload-card" onSubmit={upload}>
          <div className="upload-card-head"><div><p className="eyebrow">Новый импорт</p><h2>Загрузить Excel</h2></div><FileSpreadsheet size={30} /></div>
          <label className="file-drop" htmlFor="price-file"><UploadCloud size={34} /><strong>Выберите файл .xlsx</strong><span>До 5 МБ, не более 10 000 строк</span><input id="price-file" name="file" type="file" accept=".xlsx" required /></label>
          <div className="required-columns"><span>Обязательные колонки:</span><code>Артикул</code><code>Название</code><code>Цена</code><code>Поставщик</code></div>
          {message && <p className={`form-message ${message.type}`} role="status">{message.type === "success" && <CheckCircle2 size={18} />}{message.text}</p>}
          <button className="button" type="submit" disabled={loading}>{loading ? "Проверяем и загружаем…" : "Проверить и импортировать"}</button>
        </form>
        <aside className="template-card"><Download size={28} /><h2>Готовый шаблон</h2><p>Скачайте пример с правильными заголовками и тремя тестовыми строками.</p><a className="button secondary" href="/technovibor-import-template.xlsx" download>Скачать шаблон Excel</a><small>Бренд — необязательная колонка.</small></aside>
      </div>
      <section className="history-section"><div className="section-heading"><div><p className="eyebrow">Журнал</p><h2>Последние импорты</h2></div></div><div className="offers-table-wrap"><table className="offers-table history-table"><thead><tr><th>Поставщик</th><th>Файл</th><th>Строк</th><th>Статус</th><th>Дата</th></tr></thead><tbody>{overview?.history.map((row) => <tr key={row.id}><td>{row.supplier}</td><td>{row.file_name}</td><td>{row.row_count}</td><td><span className={`status-pill ${row.status}`}>{statusLabel(row.status)}</span></td><td>{new Date(row.created_at.replace(" ", "T") + "Z").toLocaleString("ru-RU")}</td></tr>)}</tbody></table></div></section>
    </section>
  );
}

function statusLabel(status: string) {
  if (status === "completed") return "Готово";
  if (status === "failed") return "Ошибка";
  return "Обработка";
}
