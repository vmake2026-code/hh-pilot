import Link from "next/link";

/**
 * Глобальная branded 404-страница для неизвестных маршрутов.
 * Использует существующие классы проекта (stub-section, btn) —
 * никакого нового дизайна; динамические not-found состояния
 * отдельных страниц не затрагиваются.
 */
export default function NotFound() {
  return (
    <main className="page-wide">
      <div className="stub-section">
        <h1>Страница не найдена</h1>
        <p>
          Запрашиваемая страница не существует или была перемещена.
          Проверьте адрес или вернитесь на главную.
        </p>
        <Link href="/" className="btn btn-primary btn-md">
          На главную
        </Link>
      </div>
    </main>
  );
}
