import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "ResumePilot",
  description: "Сервис для создания и оптимизации резюме",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <nav className="nav">
          <Link href="/" className="nav-brand">
            ResumePilot
          </Link>
          <div className="nav-links">
            <Link href="/dashboard">Дашборд</Link>
            <Link href="/resume">Резюме</Link>
            <Link href="/vacancies">Вакансии</Link>
            <Link href="/matches">История</Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
