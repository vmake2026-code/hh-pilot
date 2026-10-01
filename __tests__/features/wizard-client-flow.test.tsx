import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { create, act } from "react-test-renderer";
import type { ReactTestRenderer, ReactTestInstance } from "react-test-renderer";
import { createElement } from "react";
import type React from "react";

// P30: первый исполняемый тест app/resume/create/wizard-client.tsx (948 строк).
// До P30 модуль покрывался ТОЛЬКО source-text assert'ами
// (__tests__/features/step5-skill-level-feedback.test.ts читает файл через
// readFileSync и ищет подстроку). При этом именно здесь, а не в
// features/resume-wizard.ts, живёт оркестрация визарда:
//   goNext / goBack / handleFinalize / saveDraft / updateSkillLevel
//   (wizard-client.tsx:111-188, 270-288) — то есть Phase 2B «переход
//   next/back», «ошибки попадают в state», «финальный шаг».
//
// Новых зависимостей не добавлено: react-test-renderer уже стоит в
// devDependencies и уже используется в use-client-data.test.tsx.
// Окружение остаётся `node` (jsdom/RTL в проекте нет и не добавлялись).

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

// ---------- window / localStorage double ----------
// wizard-client.tsx:39 создаёт draftStore на уровне модуля, поэтому window
// должен существовать ДО динамического импорта. Тот же приём используют
// persistence-hardening.test.ts и остальные файлы набора.

const DRAFT_KEY = "rp:resume-draft:new";

interface StoreMap {
  [key: string]: string;
}

function makeFakeWindow(initial: StoreMap = {}, failOnSet = false) {
  const data: StoreMap = { ...initial };
  const scrollTo = vi.fn();
  const win = {
    localStorage: {
      getItem: (key: string) => (key in data ? data[key] : null),
      setItem: (key: string, value: string) => {
        if (failOnSet) throw new Error("QuotaExceededError");
        data[key] = value;
      },
      removeItem: (key: string) => {
        delete data[key];
      },
      clear: () => {
        for (const k of Object.keys(data)) delete data[k];
      },
      key: () => null,
      length: 0,
    },
    scrollTo,
  };
  return { win, data, localStorage: win.localStorage, scrollTo };
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
  vi.restoreAllMocks();
});

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

/** Writes a draft envelope the component's normalizeDraft() must accept. */
function seedDraft(step: number, data: Record<string, unknown>, confirmedFields: string[] = []) {
  fakeWindow.data[DRAFT_KEY] = JSON.stringify({ data, step, confirmedFields });
}

// ---------- mounting ----------

async function mountWizard(): Promise<ReactTestRenderer> {
  const WizardClient = (await import("../../app/resume/create/wizard-client")).default;
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(createElement(WizardClient));
  });
  return tree;
}

async function click(tree: ReactTestRenderer, label: string) {
  const button = findByText(tree.root, "button", label);
  await act(async () => {
    button.props.onClick();
  });
}

function findAllByText(root: ReactTestInstance, type: string, text: string): ReactTestInstance[] {
  return root.findAll(
    (node) => node.type === type && collectText(node).includes(text),
    { deep: true },
  );
}

function findByText(root: ReactTestInstance, type: string, text: string): ReactTestInstance {
  const found = findAllByText(root, type, text);
  if (found.length === 0) {
    throw new Error(
      `no <${type}> containing "${text}". Rendered text: ${collectText(root).slice(0, 600)}`,
    );
  }
  return found[0];
}

/**
 * Flattens the rendered tree into a single searchable string.
 * Element boundaries are joined with a space (so words from sibling elements
 * never merge) and every whitespace run is collapsed, because JSX splits text
 * into children like ["Шаг ", 5, " из ", 8] which would otherwise render as
 * "Шаг  5  из  8" and break literal assertions.
 */
function collectText(node: ReactTestInstance | string): string {
  if (typeof node === "string") return node;
  if (node.children.length === 0) return "";
  const joined = node.children.map((child) => collectText(child as never)).join(" ");
  return joined.replace(/\s+/g, " ");
}

function renderedText(tree: ReactTestRenderer): string {
  return collectText(tree.root).trim();
}

/**
 * Reads the exact "Шаг N из 8: <title>" heading produced by WizardLayout.
 * Its JSX children are ["Шаг ", n, " из ", total, ": ", title], so they must be
 * concatenated with "" (not " ") to reproduce the real DOM text.
 */
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

// =========================================================================
// A. Boot / hydration
// =========================================================================

describe("WizardClient — boot (P30)", () => {
  it("the boot loading placeholder is replaced by step 1 once the mount effect runs", async () => {
    const tree = await mountWizard();

    // `booted` is false on the very first commit, so <Loading/> ("Загрузка…")
    // is what the SSR pass emits; after the draft/restore effect it must be gone.
    // The pre-effect commit itself is not observable here: with React 19 a
    // create() outside act() leaves the renderer unmounted (root throws).
    expect(renderedText(tree)).not.toContain("Загрузка…");
    expect(stepHeading(tree)).toBe("Шаг 1 из 8: Основная информация");
    act(() => tree.unmount());
  });

  it("mounts at step 1 with default (empty) wizard data when no draft exists", async () => {
    const tree = await mountWizard();
    expect(renderedText(tree)).toContain("Шаг 1 из 8");
    expect(fakeWindow.data[DRAFT_KEY]).toBeUndefined();
    act(() => tree.unmount());
  });
});

// =========================================================================
// B. Draft restore (Phase 2B — «как восстанавливается wizard»)
// =========================================================================

describe("WizardClient — draft restore (P30)", () => {
  it("restores the saved step and data", async () => {
    seedDraft(5, baseData({ skills: [{ name: "React", level: "advanced" }] }));

    const tree = await mountWizard();

    expect(stepHeading(tree)).toBe("Шаг 5 из 8: Навыки");
    expect(renderedText(tree)).toContain("React");
    act(() => tree.unmount());
  });

  it("restores confirmed fields so the fact-check gate keeps its progress", async () => {
    seedDraft(8, baseData(), ["phone", "email", "desiredPosition"]);

    const tree = await mountWizard();

    const text = renderedText(tree);
    expect(text).toContain("Шаг 8 из 8");
    // All three required fields are confirmed -> finalize is allowed.
    expect(text).toContain("Подтверждено");
    expect(text).not.toContain("необходимо подтвердить обязательные поля");
    act(() => tree.unmount());
  });

  it("malformed draft is discarded and the wizard starts at step 1", async () => {
    fakeWindow.data[DRAFT_KEY] = JSON.stringify({ data: { nonsense: true }, step: 4 });

    const tree = await mountWizard();

    expect(renderedText(tree)).toContain("Шаг 1 из 8");
    act(() => tree.unmount());
  });

  it("draft step outside 1..8 is clamped to 1 by normalizeDraft", async () => {
    seedDraft(99, baseData());

    const tree = await mountWizard();

    expect(renderedText(tree)).toContain("Шаг 1 из 8");
    act(() => tree.unmount());
  });
});

// =========================================================================
// C. Navigation gate: next / back / validation errors (Phase 2B + 2C)
// =========================================================================

describe("WizardClient — next/back gate (P30)", () => {
  it("invalid step 1 does NOT advance and renders field errors", async () => {
    seedDraft(1, baseData({ firstName: "", email: "not-an-email", phone: "" }));

    const tree = await mountWizard();
    expect(renderedText(tree)).toContain("Шаг 1 из 8");

    await click(tree, "Далее →");

    const text = renderedText(tree);
    expect(text).toContain("Шаг 1 из 8"); // step unchanged
    expect(text).toContain("Имя");
    act(() => tree.unmount());
  });

  it("valid step 1 advances to step 2 and clears the previous errors", async () => {
    seedDraft(1, baseData({ firstName: "" }));

    const tree = await mountWizard();
    await click(tree, "Далее →");
    expect(renderedText(tree)).toContain("Шаг 1 из 8");

    // Fix the field through the real input, then advance.
    const firstNameInput = tree.root.find(
      (n) => n.type === "input" && n.props.id === "field-firstName",
    );
    await act(async () => {
      firstNameInput.props.onChange({ target: { value: "Пётр" } });
    });

    await click(tree, "Далее →");

    const text = renderedText(tree);
    expect(stepHeading(tree)).toBe("Шаг 2 из 8: Желаемая должность");
    expect(text).not.toContain("Укажите имя");
    act(() => tree.unmount());
  });

  it("goBack returns to the previous step and clears errors", async () => {
    seedDraft(3, baseData());

    const tree = await mountWizard();
    expect(renderedText(tree)).toContain("Шаг 3 из 8");

    await click(tree, "← Назад");

    expect(renderedText(tree)).toContain("Шаг 2 из 8");
    act(() => tree.unmount());
  });

  it("no back button exists on the first step", async () => {
    seedDraft(1, baseData());

    const tree = await mountWizard();

    expect(findAllByText(tree.root, "button", "← Назад")).toHaveLength(0);
    act(() => tree.unmount());
  });

  it("advancing scrolls the window back to the top", async () => {
    seedDraft(1, baseData());

    const tree = await mountWizard();
    await click(tree, "Далее →");

    expect(fakeWindow.scrollTo).toHaveBeenCalledWith(0, 0);
    act(() => tree.unmount());
  });
});

// =========================================================================
// D. validateStep5 propagation into component error state (already-fixed logic)
// =========================================================================

describe("WizardClient — step 5 skill level propagation (P30)", () => {
  it("a skill without a level blocks the advance and surfaces a per-skill error", async () => {
    seedDraft(5, baseData({ skills: [{ name: "React" }, { name: "SQL" }] }));

    const tree = await mountWizard();
    await click(tree, "Далее →");

    const text = renderedText(tree);
    expect(text).toContain("Шаг 5 из 8"); // did not advance
    expect(text).toContain("У каждого навыка должен быть указан уровень");
    expect(text).toContain("Укажите уровень для навыка \"React\"");
    expect(text).toContain("Укажите уровень для навыка \"SQL\"");
    act(() => tree.unmount());
  });

  it("choosing a level clears exactly that skill's error", async () => {
    seedDraft(5, baseData({ skills: [{ name: "React" }, { name: "SQL" }] }));

    const tree = await mountWizard();
    await click(tree, "Далее →");

    const reactSelect = tree.root.find(
      (n) => n.type === "select" && n.props["aria-label"] === "Уровень: React",
    );
    await act(async () => {
      reactSelect.props.onChange({ target: { value: "advanced" } });
    });

    const text = renderedText(tree);
    expect(text).not.toContain("Укажите уровень для навыка \"React\"");
    expect(text).toContain("Укажите уровень для навыка \"SQL\"");
    act(() => tree.unmount());
  });

  it("clearing every level error unblocks the advance to step 6", async () => {
    seedDraft(5, baseData({ skills: [{ name: "React" }] }));

    const tree = await mountWizard();
    await click(tree, "Далее →");
    expect(renderedText(tree)).toContain("Шаг 5 из 8");

    const reactSelect = tree.root.find(
      (n) => n.type === "select" && n.props["aria-label"] === "Уровень: React",
    );
    await act(async () => {
      reactSelect.props.onChange({ target: { value: "intermediate" } });
    });
    await click(tree, "Далее →");

    expect(renderedText(tree)).toContain("Шаг 6 из 8");
    act(() => tree.unmount());
  });

  it("a legacy 'expert' level does not block the advance", async () => {
    seedDraft(5, baseData({ skills: [{ name: "React", level: "expert" }] }));

    const tree = await mountWizard();
    await click(tree, "Далее →");

    expect(renderedText(tree)).toContain("Шаг 6 из 8");
    act(() => tree.unmount());
  });

  it("the skill input ignores blank and duplicate skills (case-insensitive)", async () => {
    seedDraft(5, baseData({ skills: [{ name: "React", level: "beginner" }] }));

    const tree = await mountWizard();
    const input = tree.root.find((n) => n.type === "input" && n.props.placeholder === "Введите навык");

    for (const value of ["   ", "react", "React"]) {
      await act(async () => {
        input.props.onChange({ target: { value } });
      });
      await click(tree, "Добавить");
    }

    const tags = tree.root.findAll((n) => n.type === "span" && n.props.className === "skill-tag");
    expect(tags).toHaveLength(1);
    act(() => tree.unmount());
  });
});

// =========================================================================
// E. Finalize gate (Phase 2B — «final step behavior»)
// =========================================================================

describe("WizardClient — finalize gate (P30)", () => {
  function finalizeButton(tree: ReactTestRenderer) {
    return findByText(tree.root, "button", "Создать резюме");
  }

  it("is disabled and lists blocking fields while confirmations are missing", async () => {
    seedDraft(8, baseData({ phone: "", email: "" }));

    const tree = await mountWizard();

    expect(finalizeButton(tree).props.disabled).toBe(true);
    const text = renderedText(tree);
    expect(text).toContain("необходимо подтвердить обязательные поля");
    expect(text).toContain("Телефон");
    expect(text).toContain("Email");
    act(() => tree.unmount());
  });

  it("is enabled once every required field is confirmed", async () => {
    seedDraft(8, baseData(), ["phone", "email", "desiredPosition"]);

    const tree = await mountWizard();

    expect(finalizeButton(tree).props.disabled).toBe(false);
    act(() => tree.unmount());
  });

  it("a filled-but-unconfirmed field still blocks finalize", async () => {
    seedDraft(8, baseData(), ["phone", "email"]); // desiredPosition unconfirmed

    const tree = await mountWizard();

    expect(finalizeButton(tree).props.disabled).toBe(true);
    expect(renderedText(tree)).toContain("Желаемая должность");
    act(() => tree.unmount());
  });

  it("finalize persists the resume, clears the draft and navigates to preview", async () => {
    seedDraft(8, baseData(), ["phone", "email", "desiredPosition"]);

    const tree = await mountWizard();
    await click(tree, "Создать резюме");

    expect(routerPush).toHaveBeenCalledTimes(1);
    const target = routerPush.mock.calls[0][0] as string;
    expect(target).toMatch(/^\/resume\/[^/]+\/preview$/);
    expect(fakeWindow.data[DRAFT_KEY]).toBeUndefined();
    act(() => tree.unmount());
  });
});

// =========================================================================
// F. Draft save visibility (P10.6 F1 / P14-F2)
// =========================================================================

describe("WizardClient — draft save contract (P30)", () => {
  it("reports success and writes the draft", async () => {
    seedDraft(2, baseData());

    const tree = await mountWizard();
    await click(tree, "Сохранить черновик");

    expect(renderedText(tree)).toContain("Черновик сохранён");
    expect(fakeWindow.data[DRAFT_KEY]).toBeTruthy();
    const saved = JSON.parse(fakeWindow.data[DRAFT_KEY]);
    expect(saved.step).toBe(2);
    expect(saved.data.firstName).toBe("Иван");
    act(() => tree.unmount());
  });

  it("surfaces a visible error when the draft write fails and keeps no success toast", async () => {
    seedDraft(2, baseData());
    fakeWindow.localStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };

    const tree = await mountWizard();
    await click(tree, "Сохранить черновик");

    const text = renderedText(tree);
    expect(text).not.toContain("Черновик сохранён");
    expect(text).toContain("Не удалось сохранить черновик");
    act(() => tree.unmount());
  });

  it("the failure alert is exposed with role=alert for assistive tech", async () => {
    seedDraft(2, baseData());
    fakeWindow.localStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };

    const tree = await mountWizard();
    await click(tree, "Сохранить черновик");

    const alerts = tree.root.findAll((n) => n.props.role === "alert");
    expect(alerts.length).toBeGreaterThan(0);
    expect(collectText(alerts[0])).toContain("Не удалось сохранить черновик");
    act(() => tree.unmount());
  });
});

// =========================================================================
// F2. Auto-hide timer lifecycle (P30-FOLLOWUP)
// =========================================================================

describe("WizardClient — draft toast timer cleanup (P30-FOLLOWUP)", () => {
  // Only setTimeout/clearTimeout are faked: faking setImmediate/Date as well
  // can stall React's scheduler inside act().
  it("the auto-hide timer is cleared on unmount", async () => {
    seedDraft(2, baseData());
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const tree = await mountWizard();
      // Mounting alone must not schedule any timer.
      expect(vi.getTimerCount()).toBe(0);

      await click(tree, "Сохранить черновик");
      expect(renderedText(tree)).toContain("Черновик сохранён");
      // The 2000 ms auto-hide timer now exists and is tracked.
      expect(vi.getTimerCount()).toBe(1);

      act(() => tree.unmount());

      // Unmount cleanup dropped the handle: nothing can fire setDraftSaved on
      // the unmounted component any more.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a failed draft write schedules no timer", async () => {
    seedDraft(2, baseData());
    fakeWindow.localStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const tree = await mountWizard();
      await click(tree, "Сохранить черновик");

      // saveDraft returns early on the persistDraft failure, so no toast and
      // no auto-hide timer may be created.
      expect(renderedText(tree)).not.toContain("Черновик сохранён");
      expect(vi.getTimerCount()).toBe(0);

      act(() => tree.unmount());
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("the toast is still hidden after 2000 ms while mounted", async () => {
    seedDraft(2, baseData());
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const tree = await mountWizard();
      await click(tree, "Сохранить черновик");
      expect(renderedText(tree)).toContain("Черновик сохранён");

      await act(async () => {
        vi.advanceTimersByTime(1999);
      });
      expect(renderedText(tree)).toContain("Черновик сохранён");

      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(renderedText(tree)).not.toContain("Черновик сохранён");

      act(() => tree.unmount());
    } finally {
      vi.useRealTimers();
    }
  });
});

// =========================================================================
// G. Unknown resume id (edit mode guard)
// =========================================================================

describe("WizardClient — edit mode guard (P30)", () => {
  it("shows 'not found' instead of silently falling back to create mode", async () => {
    currentSearchParams = new URLSearchParams("resumeId=missing-id");

    const tree = await mountWizard();

    const text = renderedText(tree);
    expect(text).toContain("Резюме не найдено");
    expect(text).not.toContain("Шаг 1 из 8");
    act(() => tree.unmount());
  });
});