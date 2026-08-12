import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["cyrillic", "latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  const title = "ТехноВыбор — каталог ноутбуков";
  const description = "Сравнение цен на ноутбуки из актуальных прайс-листов поставщиков.";
  const image = new URL("/og.png", base).toString();
  return {
    metadataBase: base,
    title: { default: title, template: "%s · ТехноВыбор" },
    description,
    openGraph: { title, description, type: "website", images: [{ url: image, width: 1536, height: 1024 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className={`${inter.variable} antialiased`}>
        <a className="skip-link" href="#main-content">К основному содержанию</a>
        {children}
      </body>
    </html>
  );
}
