/**
 * Unified salary parsing.
 *
 * Single source of truth for parsing user-entered salary strings
 * into finite numbers. Returns undefined for empty/invalid/malformed
 * input — NaN never reaches the domain model or localStorage.
 */

function parseSalaryValue(raw: string | undefined | null): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const trimmed = String(raw).trim().replace(/\s+/g, "");
  if (trimmed === "") return undefined;
  if (!/^\d+(?:[.,]\d+)?$/.test(trimmed)) return undefined;
  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) ? value : undefined;
}

export { parseSalaryValue };