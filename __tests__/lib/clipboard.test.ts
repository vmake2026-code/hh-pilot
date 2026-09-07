import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { copyToClipboard } from "../../lib/clipboard";

// P26-F2: focused contract tests for the copy flow — modern path, legacy
// fallback, rejection handling, and the empty-text guard. Browser globals
// are stubbed on globalThis (the codebase's established pattern — no jsdom).

// ---- Minimal DOM double for the execCommand fallback ----

interface FakeTextarea {
  value: string;
  style: Record<string, string>;
  removed: boolean;
  focus(): void;
  select(): void;
  remove(): void;
}

function makeFakeTextarea(tag: string): FakeTextarea {
  const t: FakeTextarea = {
    value: "",
    style: {},
    removed: false,
    focus() {},
    select() {},
    remove() {
      t.removed = true;
      const idx = fakeBody.children.indexOf(t);
      if (idx !== -1) fakeBody.children.splice(idx, 1);
    },
  };
  // (tag is captured to consume the argument the real API receives.)
  void tag;
  return t;
}

const fakeBody = {
  children: [] as FakeTextarea[],
  appendChild(el: FakeTextarea) {
    fakeBody.children.push(el);
  },
  removeChild(el: FakeTextarea) {
    const idx = fakeBody.children.indexOf(el);
    if (idx !== -1) fakeBody.children.splice(idx, 1);
  },
};

type ExecCommandHandler = (command: string) => boolean;

interface ClipboardGlobals {
  navigator: unknown;
  document: unknown;
  execCommandResult: boolean | Error;
  execCommandCalls: string[];
  textareaCreated: FakeTextarea[];
}

let savedNavigator: typeof globalThis.navigator | undefined;
let savedDocument: typeof globalThis.document | undefined;
let g: ClipboardGlobals;

function installGlobals(execCommandHandler?: ExecCommandHandler): void {
  savedNavigator = globalThis.navigator;
  savedDocument = globalThis.document;

  const execCommand = (command: string): boolean => {
    g.execCommandCalls.push(command);
    if (g.execCommandResult instanceof Error) throw g.execCommandResult;
    if (execCommandHandler) return execCommandHandler(command);
    return g.execCommandResult;
  };

  const documentDouble = {
    createElement: (tag: string) => {
      const t = makeFakeTextarea(tag);
      g.textareaCreated.push(t);
      return t;
    },
    body: fakeBody,
    execCommand,
  };

  (globalThis as unknown as { document?: unknown }).document = documentDouble;
  // Node's `navigator` is getter-only, so a plain assignment throws.
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: g.navigator,
  });
}

function restoreGlobals(): void {
  if (savedNavigator !== undefined) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      writable: true,
      value: savedNavigator,
    });
  } else {
    delete (globalThis as unknown as { navigator?: unknown }).navigator;
  }
  if (savedDocument !== undefined) {
    (globalThis as unknown as { document?: unknown }).document = savedDocument;
  } else {
    delete (globalThis as unknown as { document?: unknown }).document;
  }
}

beforeEach(() => {
  g = {
    navigator: {},
    document: {},
    execCommandResult: false,
    execCommandCalls: [],
    textareaCreated: [],
  };
  fakeBody.children = [];
});

afterEach(() => {
  restoreGlobals();
});

// ---- Tests ----

describe("copyToClipboard — modern path", () => {
  it("writeText success → { ok: true }, fallback never touched", async () => {
    let captured = "";
    g.navigator = {
      clipboard: {
        writeText: async (text: string) => {
          captured = text;
        },
      },
    };
    installGlobals();

    const result = await copyToClipboard("Frontend Developer");
    expect(result).toEqual({ ok: true });
    expect(captured).toBe("Frontend Developer");
    expect(g.execCommandCalls).toEqual([]);
    expect(g.textareaCreated).toEqual([]);
  });

  it("writeText rejection → falls back to execCommand", async () => {
    g.navigator = {
      clipboard: {
        writeText: async () => {
          throw new Error("NotAllowedError");
        },
      },
    };
    g.execCommandResult = true;
    installGlobals();

    const result = await copyToClipboard("some text");
    expect(result).toEqual({ ok: true });
    expect(g.execCommandCalls).toEqual(["copy"]);
  });
});

describe("copyToClipboard — fallback path", () => {
  it("Clipboard API unavailable → execCommand success → { ok: true }", async () => {
    g.navigator = {}; // no clipboard property
    g.execCommandResult = true;
    installGlobals();

    const result = await copyToClipboard("fallback text");
    expect(result).toEqual({ ok: true });
    expect(g.execCommandCalls).toEqual(["copy"]);
    expect(g.textareaCreated.length).toBe(1);
    expect(g.textareaCreated[0].value).toBe("fallback text");
  });

  it("API unavailable AND fallback fails → { ok: false }", async () => {
    g.navigator = {};
    g.execCommandResult = false; // execCommand returns false
    installGlobals();

    const result = await copyToClipboard("doomed text");
    expect(result).toEqual({ ok: false });
  });

  it("API unavailable AND document unavailable → { ok: false }", async () => {
    // navigator stub without clipboard; document left undefined in Node
    g.navigator = {};
    installGlobals();
    delete (globalThis as unknown as { document?: unknown }).document;

    const result = await copyToClipboard("no dom");
    expect(result).toEqual({ ok: false });
  });

  it("execCommand throws mid-flight → { ok: false } and no textarea leak (P26-F4)", async () => {
    g.navigator = {};
    g.execCommandResult = new Error("unexpected throw");
    installGlobals();

    const result = await copyToClipboard("crash path");
    expect(result).toEqual({ ok: false });
    // finally-cleanup must run even when execCommand threw
    expect(g.textareaCreated.length).toBe(1);
    expect(g.textareaCreated[0].removed).toBe(true);
    expect(fakeBody.children.length).toBe(0);
  });

  it("execCommand returns false → textarea still removed (no DOM leak)", async () => {
    g.navigator = {};
    g.execCommandResult = false;
    installGlobals();

    await copyToClipboard("clean failure");
    expect(g.textareaCreated.length).toBe(1);
    expect(g.textareaCreated[0].removed).toBe(true);
    expect(fakeBody.children.length).toBe(0);
  });
});

describe("copyToClipboard — input guard", () => {
  it("empty string → { ok: false } without touching any API", async () => {
    let writeTextCalled = false;
    g.navigator = {
      clipboard: {
        writeText: async () => {
          writeTextCalled = true;
        },
      },
    };
    g.execCommandResult = true;
    installGlobals();

    const result = await copyToClipboard("");
    expect(result).toEqual({ ok: false });
    expect(writeTextCalled).toBe(false);
    expect(g.execCommandCalls).toEqual([]);
  });
});
