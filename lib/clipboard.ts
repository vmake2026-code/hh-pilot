/**
 * Copy text to the system clipboard with a legacy fallback.
 *
 * P24: navigator.clipboard is unavailable in insecure contexts and in some
 * embedded browsers; the execCommand("copy") path keeps the HH wizard usable
 * there. Never throws — callers render the boolean as a visible
 * success/error state (no silent failures).
 */

interface CopyResult {
  ok: boolean;
}

function copyViaClipboardApi(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return Promise.resolve(false);
  }
  return navigator.clipboard
    .writeText(text)
    .then(() => true)
    .catch(() => false);
}

function copyViaExecCommand(text: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    // Position off-screen but still rendered so selection works.
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/** Copy to clipboard; ok=false means the user must be shown a visible error. */
async function copyToClipboard(text: string): Promise<CopyResult> {
  if (typeof text !== "string" || text === "") {
    return { ok: false };
  }
  if (await copyViaClipboardApi(text)) return { ok: true };
  if (copyViaExecCommand(text)) return { ok: true };
  return { ok: false };
}

export { copyToClipboard };
export type { CopyResult };
