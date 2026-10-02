import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { create, act } from "react-test-renderer";
import type { ReactTestRenderer, ReactTestInstance } from "react-test-renderer";
import { createElement } from "react";
import type React from "react";

// P32-FIX regression: unsaved wizard data safety.
//
//   P32-1  the wizard autosaves its draft (debounced) and flushes it before an
//          in-app navigation or a reload — leaving the page never loses input
//   P32-6  a restored creation draft is announced and can be discarded, while an
//          edit draft of an existing resume stays untouched
//
// Harness: react-test-renderer in the `node` environment, same as
// wizard-client-flow.test.tsx / wizard-input-integrity.test.tsx. Real browser
// events cannot be dispatched here; the closest deterministic equivalent is used
// — unmount models an in-app route change, and the component's own
// window.onbeforeunload handler models a reload.

const routerPush = vi.fn();
let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => currentSearchParams,
}));

vi.mock("next/link", async () => {
  const { createElement: el } = await import("react");
  return {
    default: ({ children, href, ...rest }: { children?: React.ReactNode; href?: string }) =>
      el("a", { href, ...rest }, children),
  };
});

const DRAFT_KEY = "rp:resume-draft:new";
const RESUME_LIST_KEY = "rp:resume-list";

interface StoreMap {
  [key: string]: string;
}

interface UnloadEventStub {
  prevented: boolean;
  returnValue: unknown;
  preventDefault: () => void;
}

function makeFakeWindow(initial: StoreMap = {}) {
  const data: StoreMap = { ...initial };
  const setItem = vi.fn((key: string, value: string) => {
    data[key] = value;
  });
  const win = {
    localStorage: {
      getItem: (key: string) => (key in data ? data[key] : null),
      setItem,
      removeItem: (key: string) => {
        delete data[key];
      },
      clear: () => {
        for (const k of Object.keys(data)) delete data[k];
      },
      key: () => null,
      length: 0,
    },
    scrollTo: vi.fn(),
    confirm: vi.fn(() => true),
    onbeforeunload: null as
      | ((event: UnloadEventStub) => void)
      | null,
  };
  return { win, data, localStorage: win.localStorage };
}

let fakeWindow: ReturnType<typeof makeFakeWindow>;

beforeEach(() => {
  routerPush.mockClear();
  currentSearchParams = new URLSearchParams();
  fakeWindow = makeFakeWindow();
  (globalThis as { window?: unknown }).window = fakeWindow.win;
  vi.resetModules();
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------- tree helpers ----------

async function mountWizard(): Promise<ReactTestRenderer> {
  const WizardClient = (await import("../../app/resume/create/wizard-client")).default;
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(createElement(WizardClient));
  });
  return tree;
}

async function mountResumeList(): Promise<ReactTestRenderer> {
  const ResumePage = (await import("../../app/resume/page")).default;
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(createElement(ResumePage));
  });
  return tree;
}

function collectText(node: ReactTestInstance | string): string {
  if (typeof node === "string") return node;
  if (node.children.length === 0) return "";
  return node.children
    .map((child) => collectText(child as never))
    .join(" ")
    .replace(/\s+/g, " ");
}

function renderedText(tree: ReactTestRenderer): string {
  return collectText(tree.root).trim();
}

function findAllByText(root: ReactTestInstance, type: string, text: string): ReactTestInstance[] {
  return root.findAll((node) => node.type === type && collectText(node).includes(text), {
    deep: true,
  });
}

function findByText(root: ReactTestInstance, type: string, text: string): ReactTestInstance {
  const found = findAllByText(root, type, text);
  if (found.length === 0) {
    throw new Error(`no <${type}> containing "${text}". Rendered: ${collectText(root).slice(0, 500)}`);
  }
  return found[0];
}

async function click(tree: ReactTestRenderer, label: string) {
  const button = findByText(tree.root, "button", label);
  await act(async () => {
    button.props.onClick();
  });
}

function controlValue(tree: ReactTestRenderer, fieldId: string): string {
  return tree.root.find(
    (n) =>
      (n.type === "input" || n.type === "textarea") && n.props.id === `field-${fieldId}`,
  ).props.value;
}

async function typeInto(tree: ReactTestRenderer, fieldId: string, text: string): Promise<void> {
  let typed = "";
  for (const char of text) {
    typed += char;
    await act(async () => {
      tree.root
        .find(
          (n) =>
            (n.type === "input" || n.type === "textarea") &&
            n.props.id === `field-${fieldId}`,
        )
        .props.onChange({ target: { value: typed } });
    });
  }
}

function stepHeading(tree: ReactTestRenderer): string {
  const heading = tree.root.find(
    (n) => typeof n.type === "string" && n.type === "h2" && n.props.className === "wizard-title",
  );
  return heading.children
    .map((child) => (typeof child === "string" ? child : String(child)))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function fieldBlock(tree: ReactTestRenderer, label: string): ReactTestInstance {
  return tree.root.find(
    (n) =>
      typeof n.props.className === "string" &&
      n.props.className === "form-field" &&
      collectText(n).includes(label),
  );
}

async function confirmFieldIn(tree: ReactTestRenderer, label: string) {
  const button = fieldBlock(tree, label).find(
    (n) => n.type === "button" && collectText(n).includes("Подтвердить"),
  );
  await act(async () => {
    button.props.onClick();
  });
}

function readDraft() {
  const raw = fakeWindow.data[DRAFT_KEY];
  return raw ? JSON.parse(raw) : null;
}

function draftWrites(): number {
  return fakeWindow.localStorage.setItem.mock.calls.filter(([key]) => key === DRAFT_KEY).length;
}

// ---------- draft seeding ----------

function baseData(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Иван",
    lastName: "Иванов",
    middleName: "",
    city: "Москва",
    phone: "+79001234567",
    email: "ivan@test.com",
    desiredPosition: "Frontend Developer",
    desiredSalary: "",
    workFormat: "",
    employmentType: "",
    workExperience: [],
    education: [],
    skills: [],
    summary: "",
    languages: [],
    ...overrides,
  };
}

function seedDraft(step: number, data: Record<string, unknown>, confirmedFields: string[] = []) {
  fakeWindow.data[DRAFT_KEY] = JSON.stringify({ data, step, confirmedFields });
}

/** Simulates a reload: the context dies without React cleanup, but the browser
 *  fires beforeunload first. */
function fireBeforeUnload(): UnloadEventStub {
  const event: UnloadEventStub = {
    prevented: false,
    returnValue: undefined,
    preventDefault() {
      event.prevented = true;
    },
  };
  fakeWindow.win.onbeforeunload?.(event);
  return event;
}

async function withTimers(run: () => Promise<void>) {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    await run();
  } finally {
    vi.useRealTimers();
  }
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

const DEBOUNCE = 600;

// =========================================================================
// P32-1 — debounced draft autosave
// =========================================================================

describe("wizard autosaves the draft (P32-1)", () => {
  it("a state change writes the draft only after the debounce window", async () => {
    await withTimers(async () => {
      seedDraft(1, baseData({ firstName: "" }));
      const tree = await mountWizard();

      await typeInto(tree, "firstName", "Иван Петров");
      expect(draftWrites()).toBe(0); // nothing written per keystroke

      await advance(DEBOUNCE - 1);
      expect(draftWrites()).toBe(0); // still inside the debounce window

      await advance(1);
      expect(draftWrites()).toBe(1);
      expect(readDraft().data.firstName).toBe("Иван Петров");

      act(() => tree.unmount());
    });
  });

  it("repeated changes are debounced into a single write", async () => {
    await withTimers(async () => {
      seedDraft(1, baseData({ firstName: "" }));
      const tree = await mountWizard();

      await typeInto(tree, "firstName", "Иван Петров");
      await advance(200);
      await typeInto(tree, "city", "Нижний Новгород");
      await advance(200);
      await typeInto(tree, "firstName", "Иван Петров-Сидоров");
      await advance(DEBOUNCE + 10);

      expect(draftWrites()).toBe(1);
      const saved = readDraft();
      // the LATEST state, not an intermediate one
      expect(saved.data.firstName).toBe("Иван Петров-Сидоров");
      expect(saved.data.city).toBe("Нижний Новгород");

      act(() => tree.unmount());
    });
  });

  it("the draft carries data, step and confirmedFields", async () => {
    await withTimers(async () => {
      seedDraft(1, baseData());
      const tree = await mountWizard();

      await confirmFieldIn(tree, "Телефон");
      await advance(DEBOUNCE + 10);

      const saved = readDraft();
      expect(saved.step).toBe(1);
      expect(saved.confirmedFields).toContain("phone");
      expect(saved.data.email).toBe("ivan@test.com");

      act(() => tree.unmount());
    });
  });

  it("step changes are persisted too", async () => {
    await withTimers(async () => {
      seedDraft(1, baseData());
      const tree = await mountWizard();

      await click(tree, "Далее →");
      await advance(DEBOUNCE + 10);

      expect(readDraft().step).toBe(2);
      act(() => tree.unmount());
    });
  });

  it("autosave never creates a resume, a version or a list entry", async () => {
    await withTimers(async () => {
      seedDraft(1, baseData({ firstName: "" }));
      const tree = await mountWizard();

      await typeInto(tree, "firstName", "Иван Петров");
      await confirmFieldIn(tree, "Телефон");
      await advance(DEBOUNCE + 10);

      expect(Object.keys(fakeWindow.data).filter((k) => k.startsWith("rp:rr:"))).toHaveLength(0);
      expect(fakeWindow.data[RESUME_LIST_KEY]).toBeUndefined();

      act(() => tree.unmount());
    });
  });

  it("opening a blank wizard writes nothing", async () => {
    await withTimers(async () => {
      const tree = await mountWizard();
      await advance(DEBOUNCE + 10);

      expect(draftWrites()).toBe(0);
      expect(fakeWindow.data[DRAFT_KEY]).toBeUndefined();

      act(() => tree.unmount());
    });
  });
});

// =========================================================================
// P32-1 — restore after navigation / reload
// =========================================================================

describe("wizard data survives navigation and reload (P32-1)", () => {
  it("leaving the page (in-app navigation) flushes the pending change", async () => {
    await withTimers(async () => {
      seedDraft(1, baseData({ firstName: "" }));
      const tree = await mountWizard();

      await typeInto(tree, "firstName", "Иван Петров");
      // Route change unmounts the page; beforeunload is NOT involved.
      act(() => tree.unmount());

      expect(readDraft().data.firstName).toBe("Иван Петров");
    });
  });

  it("returning to /resume/create restores what the user typed", async () => {
    await withTimers(async () => {
      seedDraft(1, baseData({ firstName: "" }));
      const tree = await mountWizard();
      await typeInto(tree, "firstName", "Иван Петров");
      act(() => tree.unmount());

      // "navigate away and come back": the draft is the only carrier of state.
      const returned = await mountWizard();
      expect(controlValue(returned, "firstName")).toBe("Иван Петров");
      act(() => returned.unmount());
    });
  });

  it("reload (beforeunload, React cleanup never runs) flushes the pending change", async () => {
    await withTimers(async () => {
      seedDraft(1, baseData({ firstName: "" }));
      const tree = await mountWizard();

      await typeInto(tree, "firstName", "Иван Петров");
      expect(draftWrites()).toBe(0); // debounce has not fired yet

      const event = fireBeforeUnload();
      expect(event.prevented).toBe(false); // saved, so no intrusive dialog
      expect(readDraft().data.firstName).toBe("Иван Петров");

      act(() => tree.unmount());

      // ...and the restored wizard shows the data again.
      const afterReload = await mountWizard();
      expect(controlValue(afterReload, "firstName")).toBe("Иван Петров");
      act(() => afterReload.unmount());
    });
  });

  it("no dialog is raised when everything is already saved", async () => {
    await withTimers(async () => {
      seedDraft(1, baseData({ firstName: "" }));
      const tree = await mountWizard();

      await typeInto(tree, "firstName", "Иван Петров");
      await advance(DEBOUNCE + 10);

      const event = fireBeforeUnload();
      expect(event.prevented).toBe(false);
      expect(draftWrites()).toBe(1); // nothing extra written

      act(() => tree.unmount());
    });
  });

  it("a failing flush still warns the user instead of losing data silently", async () => {
    await withTimers(async () => {
      seedDraft(1, baseData({ firstName: "" }));
      const tree = await mountWizard();

      await typeInto(tree, "firstName", "Иван Петров");
      const realSetItem = fakeWindow.localStorage.setItem;
      fakeWindow.localStorage.setItem = vi.fn(() => {
        throw new Error("QuotaExceededError");
      });

      const event = fireBeforeUnload();
      expect(event.prevented).toBe(true);

      fakeWindow.localStorage.setItem = realSetItem;
      act(() => tree.unmount());
    });
  });

  it("a finalized resume does not stay behind as an active new draft", async () => {
    seedDraft(8, baseData(), ["phone", "email", "desiredPosition"]);
    const tree = await mountWizard();

    await click(tree, "Создать резюме");
    expect(fakeWindow.data[DRAFT_KEY]).toBeUndefined();

    // Navigation unmounts the wizard and the unload handler fires on reload:
    // neither may resurrect the draft of an already finalized resume.
    act(() => tree.unmount());
    fireBeforeUnload();

    expect(fakeWindow.data[DRAFT_KEY]).toBeUndefined();

    const reopened = await mountWizard();
    expect(stepHeading(reopened)).toBe("Шаг 1 из 8: Основная информация");
    expect(controlValue(reopened, "firstName")).toBe("");
    expect(renderedText(reopened)).not.toContain("Восстановлен сохранённый черновик");
    act(() => reopened.unmount());
  });
});

// =========================================================================
// P32-FIX-CORRECTION — F-01: a pending autosave timer must not resurrect
// rp:resume-draft:new after a successful finalize.
//
// Finalize does NOT unmount the page (router.push resolves asynchronously and
// the preview route may render slowly), so the debounce scheduled by the last
// edit is still pending. markDraftSettled() only settled the fingerprint —
// without cancelling that timer it fired AFTER draftStore.remove() and wrote
// the draft back, leaving a phantom "черновик" for an already created resume.
// =========================================================================

describe("finalize cancels the pending autosave (P32-FIX-CORRECTION F-01)", () => {
  const resumeIds = () => {
    const raw = fakeWindow.data[RESUME_LIST_KEY];
    return raw ? (JSON.parse(raw) as string[]) : [];
  };
  const recordCount = () =>
    Object.keys(fakeWindow.data).filter((k) => k.startsWith("rp:rr:")).length;
  const readDraftKey = () => fakeWindow.data[DRAFT_KEY];

  /** Clicks the wizard's forward button whatever its current label is. */
  async function goForward(tree: ReactTestRenderer) {
    const button = [...tree.root.findAll(
      (n) => n.type === "button",
      { deep: true },
    )].find((n) => /Далее →|Перейти к просмотру →/.test(collectText(n)));
    if (!button) throw new Error(`no forward button. Rendered: ${collectText(tree.root).slice(0, 300)}`);
    await act(async () => {
      button.props.onClick();
    });
  }

  it("keeps rp:resume-draft:new absent when finalize happens inside the debounce window", async () => {
    await withTimers(async () => {
      // step 7: valid data + all three gated fields already confirmed.
      seedDraft(7, baseData(), ["phone", "email", "desiredPosition"]);
      const tree = await mountWizard();
      expect(stepHeading(tree)).toBe("Шаг 7 из 8: Предварительный просмотр");

      // A state change that SCHEDULES the autosave. Advancing to step 8 is
      // itself such a change (step is part of the draft fingerprint).
      await goForward(tree);
      await advance(DEBOUNCE - 1);
      expect(stepHeading(tree)).toBe("Шаг 8 из 8: Подтверждение фактов");
      // The debounce has NOT fired yet — the timer is provably pending and the
      // stored draft is still the seeded one (step 7, not step 8).
      expect(readDraft()?.step).toBe(7);

      await click(tree, "Создать резюме");

      // Finalize success invariants, immediately after the click.
      expect(recordCount()).toBe(1);
      expect(resumeIds()).toHaveLength(1);
      expect(routerPush).toHaveBeenCalledTimes(1);
      expect(fakeWindow.data[DRAFT_KEY]).toBeUndefined();

      // The page is deliberately NOT unmounted: navigation is still in flight,
      // exactly like a slow preview route in a real browser.
      await advance(DEBOUNCE * 3);

      // The queued debounce must not have written anything back.
      expect(fakeWindow.data[DRAFT_KEY]).toBeUndefined();
      expect(recordCount()).toBe(1);
      expect(resumeIds()).toHaveLength(1);
      expect(routerPush).toHaveBeenCalledTimes(1);

      // Even the navigation that finally lands cannot resurrect it.
      act(() => tree.unmount());
      fireBeforeUnload();
      expect(fakeWindow.data[DRAFT_KEY]).toBeUndefined();

      // And a freshly opened wizard is blank — no phantom draft for the user.
      const reopened = await mountWizard();
      expect(stepHeading(reopened)).toBe("Шаг 1 из 8: Основная информация");
      expect(controlValue(reopened, "firstName")).toBe("");
      expect(renderedText(reopened)).not.toContain("Восстановлен сохранённый черновик");
      act(() => reopened.unmount());
    });
  });

  it("keeps the edit-context draft absent after finalizing a new version inside the window", async () => {
    await withTimers(async () => {
      const { finalizeResume } = await import("../../features/resume-wizard");
      const { record } = finalizeResume(
        baseData(),
        new Set(["phone", "email", "desiredPosition"]),
      );
      const editKey = `rp:resume-draft:${record.id}`;
      fakeWindow.data[editKey] = JSON.stringify({
        data: baseData({ firstName: "Правка" }),
        step: 7,
        confirmedFields: ["phone", "email", "desiredPosition"],
      });
      currentSearchParams = new URLSearchParams(`resumeId=${record.id}`);
      const tree = await mountWizard();

      await goForward(tree);
      await advance(DEBOUNCE - 1);
      expect(stepHeading(tree)).toBe("Шаг 8 из 8: Подтверждение фактов");
      expect(readDraftKey()).toBeUndefined();
      expect(JSON.parse(fakeWindow.data[editKey] as string).step).toBe(7);

      await click(tree, "Создать резюме");

      expect(routerPush).toHaveBeenCalledTimes(1);
      expect(fakeWindow.data[editKey]).toBeUndefined();

      await advance(DEBOUNCE * 3);

      expect(fakeWindow.data[editKey]).toBeUndefined();
      // exactly one resume, now with two versions — no duplicate finalize
      const stored = JSON.parse(fakeWindow.data[`rp:rr:${record.id}`] as string);
      expect(stored.versions).toHaveLength(2);
      expect(resumeIds()).toHaveLength(1);
      act(() => tree.unmount());
    });
  });

  it("a stale debounce that was already queued cannot write after finalize", async () => {
    await withTimers(async () => {
      seedDraft(7, baseData(), ["phone", "email", "desiredPosition"]);
      const tree = await mountWizard();

      await goForward(tree);
      // A timer is genuinely pending at this point.
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      await advance(DEBOUNCE - 1);

      await click(tree, "Создать резюме");
      expect(fakeWindow.data[DRAFT_KEY]).toBeUndefined();

      // Even a callback that had already been queued cannot write.
      await advance(DEBOUNCE * 3);
      expect(fakeWindow.data[DRAFT_KEY]).toBeUndefined();
      act(() => tree.unmount());

      // Autosave is NOT globally disabled: a fresh wizard still saves.
      await withTimers(async () => {
        const fresh = await mountWizard();
        await typeInto(fresh, "firstName", "Правка");
        await advance(DEBOUNCE + 10);
        expect(readDraft()?.data.firstName).toBe("Правка");
        act(() => fresh.unmount());
      });
    });
  });

  it("a debounce callback handed to the queue before finalize still refuses to write", async () => {
    // clearTimeout cannot un-queue a callback the browser has already handed
    // to the task queue, so the callback itself must re-validate. Fake timers
    // always honour clearTimeout, therefore the queued callback is captured
    // from setTimeout and invoked directly AFTER the finalize settled the
    // wizard — exactly the ordering a slow navigation produces in a browser.
    const queued: Array<() => void> = [];
    const realSetTimeout = globalThis.setTimeout;

    await withTimers(async () => {
      const spy = vi
        .spyOn(globalThis, "setTimeout")
        .mockImplementation(((
          handler: TimerHandler,
          timeout?: number,
          ...rest: unknown[]
        ) => {
          if (timeout === DEBOUNCE && typeof handler === "function") {
            queued.push(handler as () => void);
          }
          return (realSetTimeout as (...a: unknown[]) => unknown)(
            handler,
            timeout,
            ...rest,
          );
        }) as unknown as typeof globalThis.setTimeout);

      try {
        seedDraft(7, baseData(), ["phone", "email", "desiredPosition"]);
        const tree = await mountWizard();

        await goForward(tree);
        await advance(DEBOUNCE - 1);
        expect(queued).toHaveLength(1);

        await click(tree, "Создать резюме");
        expect(fakeWindow.data[DRAFT_KEY]).toBeUndefined();

        // The callback now runs even though it was queued before the finalize.
        await act(async () => {
          queued[0]();
        });

        expect(fakeWindow.data[DRAFT_KEY]).toBeUndefined();
        expect(resumeIds()).toHaveLength(1);
        act(() => tree.unmount());
      } finally {
        spy.mockRestore();
      }
    });
  });

  it("a failed finalize inside the window keeps the draft so the retry loses nothing", async () => {
    await withTimers(async () => {
      seedDraft(7, baseData(), ["phone", "email", "desiredPosition"]);
      const tree = await mountWizard();

      await goForward(tree);
      await advance(DEBOUNCE - 1);

      const realSetItem = fakeWindow.localStorage.setItem;
      fakeWindow.localStorage.setItem = vi.fn((key: string, value: string) => {
        if (key === "rp:resume-list") throw new Error("QuotaExceededError");
        fakeWindow.data[key] = value;
      });
      await click(tree, "Создать резюме");
      expect(renderedText(tree)).toContain("Не удалось сохранить резюме");
      // Nothing reached the resume LIST, and the seeded draft is still there.
      // (A record key may linger: saveResumeRecord writes it before the list —
      // pre-existing P14-F2 partial-write semantics, deliberately unchanged.)
      expect(resumeIds()).toHaveLength(0);
      expect(readDraft()?.step).toBe(7);

      // The pending autosave must still fire — the data must not be lost.
      await advance(DEBOUNCE + 10);
      expect(readDraft()?.step).toBe(8);

      fakeWindow.localStorage.setItem = realSetItem;
      await click(tree, "Создать резюме");
      expect(routerPush).toHaveBeenCalledTimes(1);
      expect(resumeIds()).toHaveLength(1);

      await advance(DEBOUNCE * 2);
      expect(fakeWindow.data[DRAFT_KEY]).toBeUndefined();
      act(() => tree.unmount());
    });
  });
});

// =========================================================================
// P32-6 — draft discard / start over
// =========================================================================

describe("creation draft can be discarded (P32-6)", () => {
  it("a restored draft is announced with its step", async () => {
    seedDraft(3, baseData());
    const tree = await mountWizard();

    // collectText joins JSX children with a space, so "(шаг 3 из 8 )" arrives
    // with a space before the bracket — assert the two halves separately.
    expect(renderedText(tree)).toContain("Восстановлен сохранённый черновик");
    expect(renderedText(tree)).toContain("шаг 3 из 8");
    act(() => tree.unmount());
  });

  it("'Начать заново' removes the draft and returns a blank wizard", async () => {
    seedDraft(3, baseData());
    const tree = await mountWizard();
    await click(tree, "← Назад");
    await click(tree, "← Назад");
    expect(stepHeading(tree)).toBe("Шаг 1 из 8: Основная информация");
    expect(controlValue(tree, "firstName")).toBe("Иван");

    await click(tree, "Начать заново");

    expect(fakeWindow.data[DRAFT_KEY]).toBeUndefined();
    expect(stepHeading(tree)).toBe("Шаг 1 из 8: Основная информация");
    expect(controlValue(tree, "firstName")).toBe("");
    expect(controlValue(tree, "email")).toBe("");
    expect(controlValue(tree, "phone")).toBe("");
    expect(renderedText(tree)).not.toContain("Восстановлен сохранённый черновик");
    act(() => tree.unmount());
  });

  it("the discarded draft does not come back after a debounce or unmount", async () => {
    await withTimers(async () => {
      seedDraft(3, baseData());
      const tree = await mountWizard();

      await click(tree, "Начать заново");
      await advance(DEBOUNCE + 10);
      expect(fakeWindow.data[DRAFT_KEY]).toBeUndefined();

      act(() => tree.unmount());
      fireBeforeUnload();
      expect(fakeWindow.data[DRAFT_KEY]).toBeUndefined();
    });
  });

  it("a cancelled confirmation keeps both the draft and the data", async () => {
    seedDraft(3, baseData());
    const tree = await mountWizard();
    fakeWindow.win.confirm.mockReturnValue(false);

    await click(tree, "Начать заново");

    expect(readDraft().step).toBe(3);
    expect(stepHeading(tree)).toBe("Шаг 3 из 8: Опыт работы");
    expect(renderedText(tree)).toContain("Восстановлен сохранённый черновик");
    act(() => tree.unmount());
  });

  it("discarding the creation draft leaves an edit draft of another resume intact", async () => {
    const { finalizeResume } = await import("../../features/resume-wizard");
    const confirmed = new Set(["phone", "email", "desiredPosition"]);
    const { record } = finalizeResume(baseData(), confirmed);

    const editDraftKey = `rp:resume-draft:${record.id}`;
    fakeWindow.data[editDraftKey] = JSON.stringify({
      data: baseData({ firstName: "Из черновика правки" }),
      step: 2,
      confirmedFields: [],
    });
    seedDraft(3, baseData());

    const tree = await mountWizard();
    await click(tree, "Начать заново");

    expect(fakeWindow.data[DRAFT_KEY]).toBeUndefined();
    expect(fakeWindow.data[editDraftKey]).toBeTruthy();
    expect(JSON.parse(fakeWindow.data[editDraftKey]).data.firstName).toBe("Из черновика правки");
    act(() => tree.unmount());
  });

  it("edit mode offers no 'Начать заново' for the creation draft", async () => {
    const { finalizeResume } = await import("../../features/resume-wizard");
    const { record } = finalizeResume(baseData(), new Set(["phone", "email", "desiredPosition"]));
    seedDraft(3, baseData());

    currentSearchParams = new URLSearchParams(`resumeId=${record.id}`);
    const tree = await mountWizard();

    expect(renderedText(tree)).toContain("Редактирование существующего резюме");
    expect(findAllByText(tree.root, "button", "Начать заново")).toHaveLength(0);
    expect(stepHeading(tree)).toBe("Шаг 1 из 8: Основная информация");
    act(() => tree.unmount());
  });
});

// =========================================================================
// P32-6 — /resume list page must not silently continue a draft
// =========================================================================

describe("/resume explains an existing creation draft (P32-6)", () => {
  it("offers 'Продолжить черновик' + 'Начать заново' when a draft exists", async () => {
    seedDraft(4, baseData());
    const tree = await mountResumeList();

    const text = renderedText(tree);
    expect(text).toContain("Есть сохранённый черновик");
    expect(text).toContain("шаг 4 из 8");
    expect(text).toContain("Продолжить черновик");
    expect(text).not.toContain("+ Создать с нуля");

    await click(tree, "Начать заново");

    expect(fakeWindow.data[DRAFT_KEY]).toBeUndefined();
    expect(renderedText(tree)).not.toContain("Есть сохранённый черновик");
    expect(renderedText(tree)).toContain("+ Создать с нуля");
    act(() => tree.unmount());
  });

  it("keeps the plain '+ Создать с нуля' action when there is no draft", async () => {
    const tree = await mountResumeList();

    expect(renderedText(tree)).toContain("+ Создать с нуля");
    expect(renderedText(tree)).not.toContain("Есть сохранённый черновик");
    act(() => tree.unmount());
  });

  it("a cancelled discard keeps the draft", async () => {
    seedDraft(2, baseData());
    const tree = await mountResumeList();
    fakeWindow.win.confirm.mockReturnValue(false);

    await click(tree, "Начать заново");

    expect(readDraft().step).toBe(2);
    expect(renderedText(tree)).toContain("Есть сохранённый черновик");
    act(() => tree.unmount());
  });
});