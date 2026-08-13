/* eslint-disable @next/next/no-html-link-for-pages -- Cross-page fragment links are static and keep this small component independently testable. */
import { ArrowLeft, ArrowRight, CheckCircle2, LogOut } from "lucide-react";

export function AdminHeaderActions({ onLogout }: { onLogout(): void }) {
  return <div className="admin-actions">
    <a className="text-button catalog-return" href="/#catalog-title"><ArrowLeft size={18} />В каталог</a>
    <button className="text-button" type="button" onClick={onLogout}><LogOut size={18} />Выйти</button>
  </div>;
}

export function ImportSuccessNotice({ text }: { text: string }) {
  return <div className="form-message success success-actions" role="status">
    <span className="success-copy"><CheckCircle2 size={18} />{text}</span>
    <a className="success-catalog-link" href="/#catalog-title">Посмотреть каталог<ArrowRight size={16} /></a>
  </div>;
}
