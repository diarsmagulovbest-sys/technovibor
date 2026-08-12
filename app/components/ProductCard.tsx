import { ArrowUpRight, Laptop } from "lucide-react";
import Link from "next/link";
import type { CatalogProduct } from "../../lib/catalog";

const colorByBrand: Record<string, string> = {
  Lenovo: "coral",
  ASUS: "blue",
  Acer: "green",
  HP: "violet",
  MSI: "red",
  Apple: "slate",
};

export function ProductCard({ product }: { product: CatalogProduct }) {
  return (
    <Link className="product-card" href={`/product/${encodeURIComponent(product.sku)}`}>
      <div className={`product-art ${colorByBrand[product.brand] ?? "blue"}`}>
        <span className="product-brand">{product.brand || "Ноутбук"}</span>
        <Laptop size={72} strokeWidth={1.25} aria-hidden="true" />
        <span className="sku-chip">{product.sku}</span>
      </div>
      <div className="product-body">
        <h3>{product.name}</h3>
        <p className="offer-note">
          {product.offerCount === 1 ? "1 предложение" : `${product.offerCount} предложения`}
        </p>
        <div className="product-bottom">
          <div><span>от</span><strong>{formatPrice(product.minPrice)}</strong></div>
          <span className="card-arrow" aria-hidden="true"><ArrowUpRight size={20} /></span>
        </div>
      </div>
    </Link>
  );
}

export function formatPrice(price: number) {
  return `${new Intl.NumberFormat("ru-RU").format(price)} ₸`;
}
