import type { Metadata } from "next";
import { ArrowRight, BadgeCheck, Laptop, Search, SlidersHorizontal, Upload } from "lucide-react";
import Link from "next/link";
import { BrandHeader } from "./components/BrandHeader";
import { ProductCard } from "./components/ProductCard";
import { getCatalogProducts } from "../lib/catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Каталог ноутбуков",
  description: "Поиск ноутбуков и сравнение актуальных предложений из проверенных Excel-прайсов.",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const products = await getCatalogProducts(q);

  return (
    <div className="site-shell">
      <BrandHeader />
      <main id="main-content">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow"><BadgeCheck size={16} /> Цены без догадок</p>
            <h1>Ноутбук по делу.<br /><span>Цена — по фактам.</span></h1>
            <p className="hero-text">
              Один каталог собирает предложения поставщиков из Excel и показывает,
              где нужная модель стоит выгоднее.
            </p>
            <form className="hero-search" action="/" role="search">
              <Search size={22} aria-hidden="true" />
              <label className="sr-only" htmlFor="catalog-search">Поиск по каталогу</label>
              <input
                id="catalog-search"
                name="q"
                defaultValue={q}
                placeholder="Название, артикул или бренд"
                autoComplete="off"
              />
              <button type="submit">Найти</button>
            </form>
            <div className="quick-links" aria-label="Популярные бренды">
              <span>Быстрый поиск:</span>
              {['Lenovo', 'ASUS', 'Acer', 'Apple'].map((brand) => (
                <Link key={brand} href={`/?q=${encodeURIComponent(brand)}`}>{brand}</Link>
              ))}
            </div>
          </div>
          <div className="hero-panel" aria-label="Как работает каталог">
            <div className="hero-panel-top">
              <span className="panel-label">Актуальный каталог</span>
              <span className="live-dot">Обновлён</span>
            </div>
            <div className="laptop-visual"><Laptop size={92} strokeWidth={1.35} /></div>
            <div className="price-signal">
              <span>Предложения от</span>
              <strong>319 990 ₸</strong>
            </div>
            <div className="process-row">
              <span><Upload size={17} /> Excel</span>
              <ArrowRight size={18} />
              <span><Search size={17} /> Поиск</span>
              <ArrowRight size={18} />
              <span><SlidersHorizontal size={17} /> Выбор</span>
            </div>
          </div>
        </section>

        <section className="catalog-section" aria-labelledby="catalog-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Каталог</p>
              <h2 id="catalog-title">{q ? `Результаты по запросу «${q}»` : "Ноутбуки в наличии"}</h2>
            </div>
            <p className="result-count">{products.length} {pluralize(products.length, "модель", "модели", "моделей")}</p>
          </div>

          {products.length ? (
            <div className="product-grid">
              {products.map((product) => <ProductCard key={product.id} product={product} />)}
            </div>
          ) : (
            <div className="empty-state">
              <Search size={32} />
              <h3>Ничего не нашли</h3>
              <p>Проверьте артикул или попробуйте запрос покороче.</p>
              <Link className="button secondary" href="/">Показать весь каталог</Link>
            </div>
          )}
        </section>

        <section className="how-it-works">
          <div>
            <p className="eyebrow">Прозрачный процесс</p>
            <h2>Без ИИ. Только данные и правила.</h2>
          </div>
          <div className="steps">
            <article><span>01</span><h3>Админ загружает Excel</h3><p>Файл проходит проверку обязательных колонок и цен.</p></article>
            <article><span>02</span><h3>Товары объединяются</h3><p>Одинаковые артикулы становятся одной карточкой.</p></article>
            <article><span>03</span><h3>Клиент сравнивает</h3><p>Поиск находит модель, а карточка показывает предложения.</p></article>
          </div>
        </section>
      </main>
      <footer className="footer">
        <span className="brand-mark small"><Laptop size={18} /> ТехноВыбор</span>
        <p>Тестовый каталог ноутбуков · цены в тенге</p>
        <Link href="/admin">Для администратора</Link>
      </footer>
    </div>
  );
}

function pluralize(value: number, one: string, few: string, many: string) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
