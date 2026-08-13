"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, RefreshCw, SearchCheck, UploadCloud } from "lucide-react";
import type { PublicImportAnalysis } from "../../lib/import-service";
import type { ColumnRole, MappingOverrides, MappingSet } from "../../lib/import-types";

type AnalyzeResponse = PublicImportAnalysis & { analysisId: string; expiresAt: string; message?: string };
type Notice = { type: "success" | "error"; text: string };

const editableRoles: Array<{ role: ColumnRole; label: string }> = [
  { role: "name", label: "Название товара" },
  { role: "description", label: "Описание / характеристики" },
  { role: "sku", label: "Код производителя (SKU)" },
  { role: "article", label: "Артикул" },
  { role: "external_id", label: "Внешний ID" },
  { role: "special_price_kzt", label: "Специальная цена, ₸" },
  { role: "price_kzt", label: "Обычная цена, ₸" },
  { role: "brand", label: "Бренд" },
  { role: "stock", label: "Наличие" },
  { role: "warranty", label: "Гарантия" },
  { role: "category", label: "Категория" },
];

function effectiveColumn(mapping: MappingSet, overrides: MappingOverrides, tableId: string, role: ColumnRole) {
  const override = overrides[tableId]?.[role];
  return override === undefined ? mapping[role]?.column : override;
}

function hasRole(mapping: MappingSet, overrides: MappingOverrides, tableId: string, role: ColumnRole) {
  const column = effectiveColumn(mapping, overrides, tableId, role);
  return typeof column === "number" && column >= 0;
}

export function ImportAnalyzer({ onImported }: { onImported(): Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<AnalyzeResponse | null>(null);
  const [supplier, setSupplier] = useState("");
  const [overrides, setOverrides] = useState<MappingOverrides>({});
  const [phase, setPhase] = useState<"select" | "analyzing" | "review" | "committing">("select");
  const [notice, setNotice] = useState<Notice | null>(null);

  const criticalReady = useMemo(() => {
    if (!preview || preview.rowCount === 0) return false;
    const tables = preview.sheets.filter((sheet) => sheet.table);
    return tables.length > 0 && tables.every((sheet) => {
      const table = sheet.table!;
      return hasRole(table.mapping, overrides, table.id, "name")
        && (["sku", "article", "external_id"] as ColumnRole[]).some((role) => hasRole(table.mapping, overrides, table.id, role))
        && (["special_price_kzt", "price_kzt"] as ColumnRole[]).some((role) => hasRole(table.mapping, overrides, table.id, role));
    });
  }, [preview, overrides]);

  function chooseFile(file: File | null) {
    setOriginalFile(file); setPreview(null); setOverrides({}); setNotice(null); setPhase("select");
  }

  async function analyze() {
    if (!originalFile) return;
    setPhase("analyzing"); setNotice(null);
    const form = new FormData(); form.set("file", originalFile);
    const response = await fetch("/api/admin/import/analyze", { method: "POST", body: form });
    const result = await response.json() as AnalyzeResponse & { message?: string };
    if (!result.analysisId) {
      setNotice({ type: "error", text: result.message || "Не удалось проанализировать файл." }); setPhase("select"); return;
    }
    setPreview(result); setSupplier(result.supplier); setPhase("review");
  }

  function changeMapping(tableId: string, role: ColumnRole, value: string) {
    setOverrides((current) => ({ ...current, [tableId]: { ...current[tableId], [role]: value === "" ? null : Number(value) } }));
  }

  async function commit() {
    if (!originalFile || !preview || !criticalReady) return;
    setPhase("committing"); setNotice(null);
    const form = new FormData();
    form.set("file", originalFile); form.set("analysisId", preview.analysisId); form.set("supplier", supplier); form.set("overrides", JSON.stringify(overrides));
    const response = await fetch("/api/admin/import/commit", { method: "POST", body: form });
    const result = await response.json() as { message?: string; errors?: string[] };
    if (!response.ok) {
      setNotice({ type: "error", text: result.errors?.slice(0, 5).join(" ") || result.message || "Импорт не выполнен." }); setPhase("review"); return;
    }
    setNotice({ type: "success", text: result.message || "Каталог обновлён." });
    setPreview(null); setOriginalFile(null); setOverrides({}); setPhase("select");
    if (inputRef.current) inputRef.current.value = "";
    await onImported();
  }

  const detectedTables = preview?.sheets.filter((sheet) => sheet.table) ?? [];

  return <section className="upload-card import-analyzer" aria-labelledby="import-title">
    <div className="upload-card-head"><div><p className="eyebrow">Новый импорт</p><h2 id="import-title">Умный разбор Excel</h2></div><FileSpreadsheet size={30} /></div>
    <label className="file-drop" htmlFor="price-file"><UploadCloud size={34} /><strong>{originalFile?.name || "Нажмите, чтобы выбрать файл .xlsx"}</strong><span>До 5 МБ и 10 000 товаров. Названия колонок могут отличаться.</span></label>
    <input ref={inputRef} className="file-input" id="price-file" name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => chooseFile(event.currentTarget.files?.[0] ?? null)} />

    {!preview && <div className="import-actions"><button className="button" type="button" disabled={!originalFile || phase === "analyzing"} onClick={analyze}><SearchCheck size={18} />{phase === "analyzing" ? "Анализируем структуру…" : "Проанализировать файл"}</button></div>}

    {preview && <div className="analysis-review">
      <div className="analysis-heading"><div><p className="eyebrow">Результат анализа</p><h3>{preview.rowCount.toLocaleString("ru-RU")} товаров найдено</h3></div><span className={`confidence-pill ${preview.confidence >= .8 ? "high" : "low"}`}>Точность {Math.round(preview.confidence * 100)}%</span></div>
      <label className="supplier-field" htmlFor="detected-supplier">Поставщик<input id="detected-supplier" value={supplier} onChange={(event) => setSupplier(event.currentTarget.value)} required /></label>
      <div className="sheet-summary">{preview.sheets.map((sheet) => <article key={sheet.name} className={sheet.included ? "included" : "skipped"}><strong>{sheet.name}</strong><span>{sheet.included ? `${sheet.productRows} товаров` : sheet.reason}</span></article>)}</div>

      {(preview.warnings.length > 0 || preview.errors.length > 0) && <div className="analysis-warnings" role="alert"><div><AlertTriangle size={18} /><strong>Предупреждения</strong></div><ul>{[...preview.errors, ...preview.warnings].slice(0, 8).map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}

      {detectedTables.length > 0 && <details className="mapping-panel" open={preview.requiresConfirmation || preview.errors.length > 0}><summary>Сопоставление колонок</summary><p>Меняйте поля только если система распознала их неправильно.</p>
        {detectedTables.map((sheet) => { const table = sheet.table!; return <fieldset key={table.id}><legend>{sheet.name} · заголовки в строке {table.headerRow + 1}</legend><div className="mapping-grid">{editableRoles.map(({ role, label }) => <label key={role}>{label}<select value={effectiveColumn(table.mapping, overrides, table.id, role) ?? ""} onChange={(event) => changeMapping(table.id, role, event.currentTarget.value)}><option value="">Не используется</option>{table.headers.map((header, column) => header && <option key={`${column}-${header}`} value={column}>{header}</option>)}</select></label>)}</div></fieldset>; })}
      </details>}

      {preview.examples.length > 0 && <div className="example-table"><h4>Пример распознанных товаров</h4><div className="offers-table-wrap"><table className="offers-table"><thead><tr><th>Товар</th><th>Категория</th><th>Цена</th></tr></thead><tbody>{preview.examples.slice(0, 3).map((row) => <tr key={`${row.source.sheet}-${row.source.row}`}><td><strong>{row.name}</strong><small>{row.sku}</small></td><td>{row.category}</td><td>{row.price.toLocaleString("ru-RU")} ₸</td></tr>)}</tbody></table></div></div>}
      {!criticalReady && <p className="form-message error"><AlertTriangle size={18} />Укажите название, идентификатор и цену для каждой найденной таблицы.</p>}
      <div className="review-actions"><button className="button secondary" type="button" disabled={phase === "committing"} onClick={() => { setPreview(null); setPhase("select"); }}><RefreshCw size={17} />Другой файл</button><button className="button" type="button" disabled={!criticalReady || !supplier.trim() || phase === "committing"} onClick={commit}><CheckCircle2 size={18} />{phase === "committing" ? "Обновляем каталог…" : "Подтвердить импорт"}</button></div>
    </div>}
    {notice && <p className={`form-message ${notice.type}`} role="status">{notice.type === "success" && <CheckCircle2 size={18} />}{notice.text}</p>}
  </section>;
}
