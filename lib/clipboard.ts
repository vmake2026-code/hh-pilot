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
  let textarea: HTMLTextAreaElement | null = null;
  try {
    textarea = document.createElement("textarea");
    textarea.value = text;
    // Position off-screen but still rendered so selection works.
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    // P26-F4: cleanup runs on success, failure, and throw — a leaked
    // off-screen textarea would otherwise accumulate in the DOM.
    textarea?.remove();
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
