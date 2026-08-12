import type { Metadata } from "next";
import { BrandHeader } from "../components/BrandHeader";
import { AdminConsole } from "./AdminConsole";

export const metadata: Metadata = {
  title: "Управление каталогом",
  description: "Загрузка и проверка Excel-прайсов каталога ТехноВыбор.",
};

export default function AdminPage() {
  return <div className="site-shell admin-page"><BrandHeader /><main id="main-content"><AdminConsole /></main></div>;
}
