// SERVER-ONLY module: импортируется ТОЛЬКО из app/api/vacancies/import/route.ts.
// Никогда не попадает в client bundle (server fetch пользовательского URL).

import { isAllowedUrl } from "../lib/security";

// ---------- Tunables ----------

/** Request timeout. HH-страница ~800KB отдаётся быстро; 10s достаточно
 * даже для медленных сетей, но не позволяет запросу висеть бесконечно. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** Cap ответа: публичная HH vacancy ~834KB (P17 audit); 2MB с запасом,
 * но ограничивает abuse (streaming guard останавливает чтение). */
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

/** Redirect jumps cap: каждый прыжок отдельно валидируется против allowlist. */
const MAX_REDIRECTS = 3;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// ---------- Error contract ----------
// Стабильные коды + санитизированный текст. Технические детали
// (upstream body, URLs промежуточных прыжков) наружу не уходят.

export const HH_IMPORT_ERROR_CODES = [
  "invalid_url",
  "vacancy_not_found",
  "hh_access_denied",
  "rate_limited",
  "timeout",
  "response_too_large",
  "unsupported_content_type",
  "redirect_blocked",
  "extraction_failed",
  "upstream_error",
  "network_error",
] as const;

export type HHImportErrorCode = (typeof HH_IMPORT_ERROR_CODES)[number];

export class HHFetchError extends Error {
  readonly code: HHImportErrorCode;
  constructor(code: HHImportErrorCode, message: string) {
    super(message);
    this.name = "HHFetchError";
    this.code = code;
  }
}

// ---------- HH fetch with SSRF hardening ----------

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/**
 * Читает тело с hard byte cap: не загружает бесконечный ответ.
 * Content-Length выше лимита отклоняется сразу; streaming guard
 * останавливает чтение на границе лимита.
 */
async function readBodyWithCap(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new HHFetchError("response_too_large", "Страница вакансии слишком большая");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  // Streaming cap: чтение останавливается сразу при превышении лимита.
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // cancel best-effort
      }
      throw new HHFetchError("response_too_large", "Страница вакансии слишком большая");
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}

/**
 * P18 SSRF hardening:
 * - scheme allowlist: http/https (повторно проверяется через isAllowedUrl)
 * - host allowlist: hh.ru + subdomains (lib/security.ts — single source of truth)
 * - redirect: manual + КАЖДЫЙ прыжок валидируется заново — hh.ru → evil.com невозможен
 * - timeout: AbortSignal.timeout
 * - size cap: readBodyWithCap
 * - content-type: только HTML
 */
export async function fetchHHVacancyPage(
  rawUrl: string,
  options: { timeoutMs?: number; maxBytes?: number; fetchImpl?: typeof fetch } = {},
): Promise<{ html: string; finalUrl: string }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const doFetch = options.fetchImpl ?? fetch;

  // Server-side re-validation: client validation не является источником истины.
  if (!isAllowedUrl(rawUrl)) {
    throw new HHFetchError("invalid_url", "Ссылка должна вести на hh.ru (http/https)");
  }

  let currentUrl = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await doFetch(currentUrl, {
      redirect: "manual",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ru-RU,ru;q=0.9",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (isRedirectStatus(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new HHFetchError("network_error", "HH вернул некорректный redirect");
      }
      const nextUrl = new URL(location, currentUrl).toString();
      // Redirect policy: конечный (и каждый промежуточный) host обязан
      // оставаться в allowlist. hh.ru → evil.com блокируется здесь.
      if (!isAllowedUrl(nextUrl)) {
        throw new HHFetchError("redirect_blocked", "Redirect ведёт за пределы hh.ru");
      }
      try {
        await response.body?.cancel();
      } catch {
        // cancel best-effort
      }
      currentUrl = nextUrl;
      continue;
    }

    if (response.status === 404) {
      throw new HHFetchError("vacancy_not_found", "Вакансия не найдена или уже закрыта");
    }
    if (response.status === 401 || response.status === 403) {
      throw new HHFetchError("hh_access_denied", "HH ограничил доступ к странице вакансии");
    }
    if (response.status === 429) {
      throw new HHFetchError("rate_limited", "Слишком много запросов к HH. Попробуйте позже.");
    }
    if (response.status === 400) {
      throw new HHFetchError("vacancy_not_found", "Вакансия не найдена или уже закрыта");
    }
    if (response.status >= 500) {
      throw new HHFetchError("upstream_error", "HH временно недоступен. Попробуйте позже.");
    }
    if (response.status !== 200) {
      throw new HHFetchError("upstream_error", "HH временно недоступен. Попробуйте позже.");
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (contentType && !contentType.includes("text/html")) {
      throw new HHFetchError("unsupported_content_type", "Ожидалась HTML-страница вакансии");
    }

    const html = await readBodyWithCap(response, maxBytes);
    return { html, finalUrl: currentUrl };
  }

  // Превышен redirect budget: слишком много прыжков — отклоняем.
  throw new HHFetchError("redirect_blocked", "Слишком много redirect'ов");
}

// ---------- HTML → readable text extraction ----------
// Каскад без внешних зависимостей, отталкивается от зафиксированной
// структуры реального hh.ru vacancy HTML (P18 research):
// 1) JSON-LD JobPosting (SEO-schema, независим от bloko/magritte layout)
// 2) data-qa контейнеры (стабильные QA-атрибуты, общие для обоих layout'ов)
// 3) meta name="description" (фиксированная грамматика)

function stripHtmlTags(html: string): string {
  // Регекс-вариант normalizeText из vacancy-import: HH description
  // содержит <p>/<ul>/<li>/<strong>/<br>, вложенных <div> нет.
  let text = html;
  text = text.replace(/<!--\s*-->/g, ""); // React hydration артефакты
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|li|h[1-6])>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
  text = text
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

/** Первое совпадение по data-qa атрибуту (открывающий тег → закрывающий
 * того же тега; inner content не содержит одноимённых тегов). */
function extractDataQa(html: string, name: string): string | null {
  const re = new RegExp(`<([a-z0-9]+)[^>]*data-qa="${name}"[^>]*>([\\s\\S]*?)<\\/\\1>`, "i");
  const match = html.match(re);
  if (!match?.[2]) return null;
  const text = stripHtmlTags(match[2]);
  return text.trim() || null;
}

interface JobPostingLD {
  description?: string;
  title?: string;
  organizationName?: string;
  city?: string;
  valid: boolean;
}

/** JSON-LD: <script type="application/ld+json"> c "@type": "JobPosting". */
function extractJobPostingLD(html: string): JobPostingLD {
  const result: JobPostingLD = { valid: false };
  const blocks = html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    const raw = block[1]?.trim();
    if (!raw || !raw.includes("JobPosting")) continue;
    try {
      const parsed = JSON.parse(raw) as {
        description?: string;
        title?: string;
        hiringOrganization?: { name?: string };
        jobLocation?: { address?: { addressLocality?: string } };
      };
      result.description = typeof parsed.description === "string" ? parsed.description : undefined;
      result.title = typeof parsed.title === "string" ? parsed.title : undefined;
      result.organizationName = parsed.hiringOrganization?.name;
      result.city = parsed.jobLocation?.address?.addressLocality;
      result.valid = true;
      break;
    } catch {
      // damaged LD block — продолжаем поиск следующего
    }
  }
  return result;
}

/** meta name="description": фиксированная грамматика HH
 * ("Вакансия … Зарплата: … Город. Опыт: … Занятость: …"). */
function extractMetaDescription(html: string): string | null {
  const match = html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i);
  if (!match?.[1]) return null;
  const text = match[1]
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
  return text || null;
}

export interface HHExtractedFields {
  title?: string;
  company?: string;
  location?: string;
  experience?: string;
  employment?: string;
  workFormat?: string;
}

export interface HHExtractResult {
  text: string;
  fields: HHExtractedFields;
}

/** Массивы прыжков не поддерживаем — берём первый попавшийся. */
function firstMatch(html: string, names: string[]): string | null {
  for (const name of names) {
    const value = extractDataQa(html, name);
    if (value) return value;
  }
  return null;
}

/**
 * HH-заголовки секций → канонические ключи, которые понимает
 * существующий SECTION_KEYWORDS parser ("Требования:"/"Обязанности:").
 * Канонический вид — с двоеточием, отдельной строкой.
 */
function normalizeHHSectionHeaders(text: string): string {
  return text
    .replace(/^[ \t]*Чем предстоит заниматься[ \t]*$/gim, "Требования:")
    .replace(/^[ \t]*Наши ожидания[ \t]*$/gim, "Требования:")
    .replace(/^[ \t]*Что нужно делать[ \t]*$/gim, "Обязанности:")
    .replace(/^[ \t]*Обязанности[ \t]*$/gim, "Обязанности:")
    .replace(/^[ \t]*Требования[ \t]*$/gim, "Требования:");
}

/**
 * Extraction cascade: HH HTML → readable text representation,
 * готовый для существующего parseVacancyImport (section-aware parser).
 * Строит structured preamble + description body, чтобы один и тот же
 * существующий parser извлекал и заголовок/компанию/зарплату,
 * и секции Требования/Обязанности.
 */
export function extractVacancyText(html: string): HHExtractResult {
  const ld = extractJobPostingLD(html);

  // Description body (HTML) — приоритет: JSON-LD → data-qa контейнер.
  let descriptionHtml: string | null = null;
  if (ld.valid && ld.description && ld.description.trim()) {
    descriptionHtml = ld.description;
  }
  if (!descriptionHtml) {
    const container = html.match(
      /<div[^>]*(?:data-qa="vacancy-description"|itemprop="description")[^>]*>([\s\S]*?)<\/div>/i,
    );
    if (container?.[1]) descriptionHtml = container[1];
  }

  const descriptionText = descriptionHtml
    ? normalizeHHSectionHeaders(stripHtmlTags(descriptionHtml))
    : "";
  if (!descriptionText) {
    throw new HHFetchError(
      "extraction_failed",
      "Не удалось извлечь текст вакансии со страницы HH",
    );
  }

  // Structured fields — cascade: JSON-LD → data-qa → meta description.
  const title = ld.title ?? firstMatch(html, ["vacancy-title"]);
  const company =
    ld.organizationName ?? firstMatch(html, ["vacancy-company-name"]);
  const location =
    ld.city ??
    firstMatch(html, ["vacancy-view-raw-address", "vacancy-address-with-map", "vacancy-view-location"]);
  const experience = firstMatch(html, ["vacancy-experience"]);
  const employmentRaw = firstMatch(html, ["common-employment-text", "vacancy-employment-mode"]);
  const workFormatRaw = firstMatch(html, ["work-formats-text"]);

  // "Формат работы: удалённо" → "удалённо"
  const workFormat = workFormatRaw
    ? workFormatRaw.replace(/^Формат\s+работы\s*:\s*/i, "").trim() || undefined
    : undefined;

  // Зарплата: стабильного data-qa якоря нет — берём из meta description,
  // грамматика "Зарплата: от 100 000 до 150 000 ₽." / "не указана".
  let salaryLine = "";
  const meta = extractMetaDescription(html);
  if (meta) {
    const salaryMatch = meta.match(/Зарплата:\s*([^.]+)\./i);
    if (salaryMatch?.[1] && !/не\s+указан/i.test(salaryMatch[1])) {
      salaryLine = salaryMatch[1].trim();
    }
  }

  // Existing parser понимает meta-grammar (Занятость: полная) и
  // текстовые ключи (Полная занятость, удалённо и т.д.).
  const employment = employmentRaw ?? undefined;

  const preambleLines: string[] = [];
  if (title) preambleLines.push(title);
  if (company) preambleLines.push(`Компания: ${company}`);
  if (salaryLine) preambleLines.push(`Зарплата: ${salaryLine}`);
  if (location) preambleLines.push(`Локация: ${location}`);
  if (experience) preambleLines.push(`Опыт работы: ${experience}`);
  if (employment) preambleLines.push(employment);
  if (workFormat) preambleLines.push(`Формат работы: ${workFormat}`);

  const text = `${preambleLines.join("\n")}\n\n${descriptionText}`.trim();

  return {
    text,
    fields: {
      title: title ?? undefined,
      company: company ?? undefined,
      location: location ?? undefined,
      experience: experience ?? undefined,
      employment: employment ?? undefined,
      workFormat: workFormat ?? undefined,
    },
  };
}
