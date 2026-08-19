import { APP_CONFIG } from "./config";

// ---------- SSRF protection ----------

const ALLOWED_HOSTS = APP_CONFIG.allowedVacancyHosts;

function isAllowedUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return false;
    }
    return ALLOWED_HOSTS.some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

function sanitizeUrl(urlString: string): string | null {
  if (!isAllowedUrl(urlString)) {
    return null;
  }
  try {
    const url = new URL(urlString);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

// ---------- Input validation ----------

function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email) && email.length <= 320;
}

function validatePhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-()]/g, "");
  return /^\+?\d{7,15}$/.test(cleaned);
}

function validateTextInput(
  text: string,
  maxLength: number = APP_CONFIG.maxTextInputLength,
): boolean {
  return typeof text === "string" && text.length > 0 && text.length <= maxLength;
}

// ---------- Sanitization ----------

function sanitizeText(input: string): string {
  return input
    .replace(/\0/g, "")
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .trim();
}

function sanitizeHTML(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function limitLength(input: string, maxLength: number): string {
  if (input.length <= maxLength) return input;
  return input.slice(0, maxLength);
}

export {
  ALLOWED_HOSTS,
  isAllowedUrl,
  sanitizeUrl,
  validateEmail,
  validatePhone,
  validateTextInput,
  sanitizeText,
  sanitizeHTML,
  limitLength,
};
