import Link from "next/link";

export default function NotFound() {
  return <main className="simple-state"><p className="eyebrow">Ошибка 404</p><h1>Такого товара нет</h1><p>Возможно, прайс поставщика был обновлён.</p><Link className="button" href="/">Вернуться в каталог</Link></main>;
}
