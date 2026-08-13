import { Laptop } from "lucide-react";
import Link from "next/link";

export function BrandHeader() {
  return (
    <header className="header">
      <Link className="brand-mark" href="/" aria-label="ТехноВыбор — главная">
        <span className="brand-icon"><Laptop size={22} /></span>
        <span>ТехноВыбор</span>
      </Link>
      <nav aria-label="Основная навигация">
        <Link href="/#catalog-title">Каталог</Link>
        <Link href="/#main-content">Поиск</Link>
        <a className="admin-link" href="/admin">Загрузить прайс</a>
      </nav>
    </header>
  );
}
