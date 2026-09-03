import { NextResponse } from "next/server";
import {
  fetchHHVacancyPage,
  extractVacancyText,
  HHFetchError,
} from "@/services/hh-fetch";

// P18: server-side HH URL import. Повторная валидация URL, fetch с SSRF
// hardening (timeout/size/redirect/content-type), extraction → текст
// для существующего клиентского text parser. Никаких credentials HH.

/** HTTP status по стабильному коду ошибки. */
function statusForCode(code: string): number {
  switch (code) {
    case "invalid_url":
      return 400;
    case "vacancy_not_found":
      return 404;
    case "hh_access_denied":
    case "redirect_blocked":
      return 403;
    case "rate_limited":
      return 429;
    case "timeout":
      return 504;
    case "response_too_large":
      return 413;
    case "unsupported_content_type":
      return 415;
    default:
      return 502;
  }
}

export async function POST(request: Request) {
  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Некорректное тело запроса", code: "invalid_body" },
      { status: 400 },
    );
  }

  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json(
      { ok: false, error: "Не указан URL вакансии", code: "invalid_url" },
      { status: 400 },
    );
  }

  const maxBytes = Number(process.env.HH_IMPORT_MAX_BYTES ?? "");
  try {
    const { html, finalUrl } = await fetchHHVacancyPage(url, {
      maxBytes: Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : undefined,
    });
    const { text, fields } = extractVacancyText(html);

    // fetchedAt фиксирует момент реального server-side fetch.
    return NextResponse.json({
      ok: true,
      text,
      fields,
      sourceUrl: url,
      finalUrl,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof HHFetchError) {
      const status = statusForCode(error.code);
      const headers =
        error.code === "rate_limited" ? { "Retry-After": "30" } : undefined;
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status, ...(headers ? { headers } : {}) },
      );
    }
    // AbortError от AbortSignal.timeout → timeout; всё остальное — generic.
    // Внутренние детали (URL прыжков, stack) наружу не уходят.
    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json(
        { ok: false, error: "HH не ответил вовремя. Попробуйте ещё раз.", code: "timeout" },
        { status: 504 },
      );
    }
    console.error("[vacancies/import] unexpected error", error);
    return NextResponse.json(
      { ok: false, error: "Не удалось загрузить вакансию. Попробуйте позже.", code: "network_error" },
      { status: 502 },
    );
  }
}
