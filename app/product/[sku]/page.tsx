import type { Metadata } from "next";
import { ArrowLeft, BadgeCheck, Building2, CalendarDays, Laptop } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandHeader } from "../../components/BrandHeader";
import { formatPrice } from "../../components/ProductCard";
import { getProductBySku } from "../../../lib/catalog";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ sku: string }> }): Promise<Metadata> {
  const { sku } = await params;
  const product = await getProductBySku(decodeURIComponent(sku));
  return product
    ? { title: product.name, description: `Сравните предложения на ${product.name}.` }
    : { title: "Товар не найден" };
}

export default async function ProductPage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const product = await getProductBySku(decodeURIComponent(sku));
  if (!product) notFound();

  return (
    <div className="site-shell">
      <BrandHeader />
      <main className="product-page" id="main-content">
        <Link className="back-link" href="/"><ArrowLeft size={18} /> Вернуться в каталог</Link>
        <section className="product-hero">
          <div className="product-detail-art">
            <span>{product.brand || "Ноутбук"}</span>
            <Laptop size={150} strokeWidth={1.1} />
            <small>{product.sku}</small>
          </div>
          <div className="product-summary">
            <p className="eyebrow"><BadgeCheck size={16} /> Проверено по прайсу</p>
            <h1>{product.name}</h1>
            <div className="detail-tags"><span>{product.brand || "Бренд не указан"}</span><span>Артикул: {product.sku}</span></div>
            <div className="best-price"><span>Лучшая цена</span><strong>{formatPrice(product.minPrice)}</strong><small>Среди {product.offerCount} предложений</small></div>
          </div>
        </section>

        <section className="offers-section" aria-labelledby="offers-title">
          <div className="section-heading"><div><p className="eyebrow">Предложения</p><h2 id="offers-title">Где купить</h2></div></div>
          <div className="offers-table-wrap">
            <table className="offers-table">
              <thead><tr><th>Поставщик</th><th>Обновлено</th><th>Цена</th></tr></thead>
              <tbody>
                {product.offers.map((offer) => (
                  <tr key={`${offer.supplier}-${offer.price}`}>
                    <td><span className="supplier-name"><Building2 size={18} />{offer.supplier}</span></td>
                    <td><span className="date-cell"><CalendarDays size={17} />{formatDate(offer.importedAt)}</span></td>
                    <td><strong>{formatPrice(offer.price)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value.replace(" ", "T") + "Z"));
}
