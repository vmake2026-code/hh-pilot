"use client";

import Link from "next/link";

/**
 * P10.6 F3: минимальный корневой error boundary App Router.
 * Ловит render-ошибки на любой странице, не показывает stack trace
 * и внутренние детали, даёт retry и путь к безопасному месту.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Диагностика — только в консоль разработчика; наружу — generic-текст.
  console.error("[app] render error boundary", error);

  return (
    <main className="page-wide">
      <div className="stub-section">
        <h1>Что-то пошло не так</h1>
        <p>
          Произошла непредвиденная ошибка. Попробуйте повторить действие —
          если ошибка повторяется, вернитесь на главную страницу.
        </p>
        <div className="preview-actions-bar" style={{ justifyContent: "center", marginTop: 16 }}>
          <button type="button" className="btn btn-primary btn-md" onClick={() => reset()}>
            Попробовать снова
          </button>
          <Link href="/" className="btn btn-secondary btn-md">
            На главную
          </Link>
        </div>
      </div>
    </main>
  );
}
