import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { create, act } from "react-test-renderer";
import type { ReactTestRenderer, ReactTestInstance } from "react-test-renderer";
import { createElement } from "react";
import type React from "react";

// P32-FIX regression: input integrity of the resume wizard.
//
//   P32-4  typing a space must not merge words ("Frontend Developer")
//   P32-5  editing a confirmed field must drop its confirmation
//   P32-3  repeated finalize clicks must create exactly one resume
//   P32-2  step 7 must be passable; the fact-check gate lives on step 8
//
// Harness: the same one wizard-client-flow.test.tsx uses — react-test-renderer
// in the `node` environment (no jsdom/RTL in this project). Controlled-input
// browser semantics are reproduced as closely as the harness allows: each
// keystroke calls the input's real onChange with the accumulated value and the
// rendered `value` prop is read back after the re-render, which is exactly what
// a browser does with a controlled <input>.

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

interface FakeWindow {
  localStorage: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
  };
  scrollTo: ReturnType<typeof vi.fn>;
  confirm: ReturnType<typeof vi.fn>;
  onbeforeunload: ((event: { preventDefault: () => void; returnValue: unknown }) => void) | null;
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
    onbeforeunload: null as FakeWindow["onbeforeunload"],
  };
  return { win, data, localStorage: win.localStorage, scrollTo: win.scrollTo };
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

// ---------- tree helpers ----------

async function mountWizard(): Promise<ReactTestRenderer> {
  const WizardClient = (await import("../../app/resume/create/wizard-client")).default;
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(createElement(WizardClient));
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
  return root.findAll(
    (node) => node.type === type && collectText(node).includes(text),
    { deep: true },
  );
}

function findByText(root: ReactTestInstance, type: string, text: string): ReactTestInstance {
  const found = findAllByText(root, type, text);
  if (found.length === 0) {
    throw new Error(`no <${type}> containing "${text}". Rendered: ${renderedText2(root).slice(0, 600)}`);
  }
  return found[0];
}

function renderedText2(root: ReactTestInstance): string {
  return collectText(root).trim();
}

async function click(tree: ReactTestRenderer, label: string) {
  const button = findByText(tree.root, "button", label);
  await act(async () => {
    button.props.onClick();
  });
}

/** Clicks the forward button whatever its current label is ("Далее →" / "Перейти к просмотру →"). */
async function advance(tree: ReactTestRenderer) {
  const labels = ["Далее →", "Перейти к просмотру →"];
  for (const label of labels) {
    const found = findAllByText(tree.root, "button", label);
    if (found.length > 0) {
      await act(async () => {
        found[0].props.onClick();
      });
      return;
    }
  }
  throw new Error(`no forward button. Rendered: ${renderedText2(tree.root).slice(0, 400)}`);
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

function findControl(tree: ReactTestRenderer, fieldId: string): ReactTestInstance {
  return tree.root.find(
    (n) =>
      (n.type === "input" || n.type === "textarea" || n.type === "select") &&
      n.props.id === `field-${fieldId}`,
  );
}

/** Current value of a rendered controlled control. */
function controlValue(tree: ReactTestRenderer, fieldId: string): string {
  return findControl(tree, fieldId).props.value;
}

/**
 * Types `text` one character at a time through the real onChange handler and
 * asserts after EVERY keystroke that the rendered value is exactly what has
 * been typed so far. This is the closest deterministic reproduction of the
 * controlled-input loop that used to swallow spaces.
 */
async function typeInto(tree: ReactTestRenderer, fieldId: string, text: string): Promise<void> {
  let typed = "";
  for (const char of text) {
    typed += char;
    await act(async () => {
      findControl(tree, fieldId).props.onChange({ target: { value: typed } });
    });
    expect(controlValue(tree, fieldId)).toBe(typed);
  }
}

async function blurField(tree: ReactTestRenderer, fieldId: string): Promise<void> {
  await act(async () => {
    findControl(tree, fieldId).props.onBlur?.();
  });
}

/** The .form-field wrapper of one labelled field. */
function fieldBlock(tree: ReactTestRenderer, label: string): ReactTestInstance {
  return tree.root.find(
    (n) =>
      typeof n.props.className === "string" &&
      n.props.className === "form-field" &&
      collectText(n).includes(label),
  );
}

function confirmButton(tree: ReactTestRenderer, label: string): ReactTestInstance {
  return fieldBlock(tree, label).find(
    (n) => n.type === "button" && collectText(n).includes("Подтвердить"),
  );
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

function readDraft() {
  const raw = fakeWindow.data[DRAFT_KEY];
  return raw ? JSON.parse(raw) : null;
}

// =========================================================================
// P32-4 — typing must preserve user input, including spaces
// =========================================================================

describe("wizard typing preserves user input (P32-4)", () => {
  it("firstName keeps 'Иван Петров' key by key", async () => {
    seedDraft(1, baseData({ firstName: "" }));
    const tree = await mountWizard();

    await typeInto(tree, "firstName", "Иван Петров");

    expect(controlValue(tree, "firstName")).toBe("Иван Петров");
    expect(controlValue(tree, "firstName")).not.toContain("ИванПетров");
    act(() => tree.unmount());
  });

  it("desiredPosition keeps 'Frontend Developer'", async () => {
    seedDraft(2, baseData({ desiredPosition: "" }));
    const tree = await mountWizard();

    await typeInto(tree, "desiredPosition", "Frontend Developer");

    expect(controlValue(tree, "desiredPosition")).toBe("Frontend Developer");
    act(() => tree.unmount());
  });

  it("summary keeps 'Опыт в frontend разработке'", async () => {
    seedDraft(6, baseData({ summary: "" }));
    const tree = await mountWizard();

    await typeInto(tree, "summary", "Опыт в frontend разработке");

    expect(controlValue(tree, "summary")).toBe("Опыт в frontend разработке");
    act(() => tree.unmount());
  });

  it("city keeps a multi-word value ('Нижний Новгород')", async () => {
    seedDraft(1, baseData({ city: "" }));
    const tree = await mountWizard();

    await typeInto(tree, "city", "Нижний Новгород");

    expect(controlValue(tree, "city")).toBe("Нижний Новгород");
    act(() => tree.unmount());
  });

  it("work company keeps 'ООО Рога и Копыта' (same wizard path)", async () => {
    seedDraft(3, baseData({ workExperience: [] }));
    const tree = await mountWizard();

    await click(tree, "+ Добавить место работы");

    const companyField = tree.root.find(
      (n) => n.type === "input" && n.props.placeholder === "ООО Рога и Копыта",
    );
    const fieldId = String(companyField.props.id).replace(/^field-/, "");
    await typeInto(tree, fieldId, "ООО Рога и Копыта");

    expect(controlValue(tree, fieldId)).toBe("ООО Рога и Копыта");
    act(() => tree.unmount());
  });

  it("preview step shows the multi-word values, not merged ones", async () => {
    seedDraft(7, baseData({ firstName: "Иван Петров", desiredPosition: "Frontend Developer" }));
    const tree = await mountWizard();

    const text = renderedText(tree);
    expect(text).toContain("Иван Петров");
    expect(text).toContain("Frontend Developer");
    expect(text).not.toContain("ИванПетров");
    expect(text).not.toContain("FrontendDeveloper");
    act(() => tree.unmount());
  });

  it("blur canonicalizes the value (leading/trailing spaces trimmed once)", async () => {
    seedDraft(1, baseData({ firstName: "" }));
    const tree = await mountWizard();

    await typeInto(tree, "firstName", " Иван Петров ");
    expect(controlValue(tree, "firstName")).toBe(" Иван Петров ");

    await blurField(tree, "firstName");

    expect(controlValue(tree, "firstName")).toBe("Иван Петров");
    act(() => tree.unmount());
  });

  it("control characters are still stripped while typing (security unchanged)", async () => {
    seedDraft(1, baseData({ firstName: "" }));
    const tree = await mountWizard();

    await act(async () => {
      findControl(tree, "firstName").props.onChange({ target: { value: "Ива\x00н\x02" } });
    });

    expect(controlValue(tree, "firstName")).toBe("Иван");
    act(() => tree.unmount());
  });

  it("the finalized resume keeps the spaces (preview/title/candidateInfo)", async () => {
    seedDraft(
      8,
      baseData({ firstName: "Иван Петров", desiredPosition: "Frontend Developer", summary: "Опыт в frontend" }),
      ["phone", "email", "desiredPosition"],
    );
    const tree = await mountWizard();

    await click(tree, "Создать резюме");

    expect(routerPush).toHaveBeenCalledTimes(1);
    const id = (routerPush.mock.calls[0][0] as string).split("/")[2];
    const record = JSON.parse(fakeWindow.data[`rp:rr:${id}`] as string);
    expect(record.candidateInfo.firstName).toBe("Иван Петров");
    expect(record.resume.title).toBe("Frontend Developer");
    expect(record.versions[0].data.summary.value).toBe("Опыт в frontend");
    act(() => tree.unmount());
  });
});

// =========================================================================
// P32-5 — editing a confirmed field drops its confirmation
// =========================================================================

describe("confirmation is invalidated on edit (P32-5)", () => {
  it("phone: confirm -> edit -> 'Подтверждено' disappears", async () => {
    seedDraft(1, baseData());
    const tree = await mountWizard();

    await act(async () => {
      confirmButton(tree, "Телефон").props.onClick();
    });
    expect(collectText(fieldBlock(tree, "Телефон"))).toContain("Подтверждено");

    await typeInto(tree, "phone", "+79007654321");

    const text = collectText(fieldBlock(tree, "Телефон"));
    expect(text).not.toContain("✓ Подтверждено");
    expect(text).toContain("Требует подтверждения");
    act(() => tree.unmount());
  });

  it("email: confirm -> edit -> 'Подтверждено' disappears", async () => {
    seedDraft(1, baseData());
    const tree = await mountWizard();

    await act(async () => {
      confirmButton(tree, "Email").props.onClick();
    });
    expect(collectText(fieldBlock(tree, "Email"))).toContain("Подтверждено");

    await typeInto(tree, "email", "ivan.petrov@test.com");

    const text = collectText(fieldBlock(tree, "Email"));
    expect(text).not.toContain("✓ Подтверждено");
    expect(text).toContain("Требует подтверждения");
    act(() => tree.unmount());
  });

  it("desiredPosition: confirm -> edit -> 'Подтверждено' disappears", async () => {
    seedDraft(2, baseData());
    const tree = await mountWizard();

    await act(async () => {
      confirmButton(tree, "Желаемая должность").props.onClick();
    });
    expect(collectText(fieldBlock(tree, "Желаемая должность"))).toContain("Подтверждено");

    await typeInto(tree, "desiredPosition", "Frontend Developer");

    const text = collectText(fieldBlock(tree, "Желаемая должность"));
    expect(text).not.toContain("✓ Подтверждено");
    expect(text).toContain("Требует подтверждения");
    act(() => tree.unmount());
  });

  it("re-entering the SAME value keeps the confirmation", async () => {
    seedDraft(1, baseData());
    const tree = await mountWizard();

    await act(async () => {
      confirmButton(tree, "Телефон").props.onClick();
    });
    // A change event carrying the identical value must not reset the gate.
    await act(async () => {
      findControl(tree, "phone").props.onChange({ target: { value: "+79001234567" } });
    });

    expect(collectText(fieldBlock(tree, "Телефон"))).toContain("Подтверждено");
    act(() => tree.unmount());
  });

  it("editing an unrelated field keeps existing confirmations", async () => {
    seedDraft(1, baseData());
    const tree = await mountWizard();

    await act(async () => {
      confirmButton(tree, "Телефон").props.onClick();
    });
    expect(collectText(fieldBlock(tree, "Телефон"))).toContain("Подтверждено");

    await typeInto(tree, "firstName", "Иван Петров");

    expect(collectText(fieldBlock(tree, "Телефон"))).toContain("Подтверждено");
    expect(controlValue(tree, "firstName")).toBe("Иван Петров");
    act(() => tree.unmount());
  });

  it("an invalidated confirmation blocks finalize again", async () => {
    seedDraft(8, baseData(), ["phone", "email", "desiredPosition"]);
    const tree = await mountWizard();
    expect(findByText(tree.root, "button", "Создать резюме").props.disabled).toBe(false);

    // Go back, change the phone, return: the fact-check gate must be closed.
    await click(tree, "← Назад");
    await click(tree, "← Назад");
    await click(tree, "← Назад");
    await click(tree, "← Назад");
    await click(tree, "← Назад");
    await click(tree, "← Назад");
    await click(tree, "← Назад");
    expect(stepHeading(tree)).toBe("Шаг 1 из 8: Основная информация");

    await typeInto(tree, "phone", "+79007654321");
    await advance(tree);

    for (let i = 0; i < 6; i++) {
      await advance(tree);
    }
    expect(stepHeading(tree)).toBe("Шаг 8 из 8: Подтверждение фактов");
    expect(renderedText(tree)).toContain("необходимо подтвердить обязательные поля");
    expect(findByText(tree.root, "button", "Создать резюме").props.disabled).toBe(true);
    act(() => tree.unmount());
  });
});

// =========================================================================
// P32-3 — repeated finalize must create exactly one resume
// =========================================================================

describe("duplicate finalize is impossible (P32-3)", () => {
  function resumeIds(): string[] {
    const raw = fakeWindow.data[RESUME_LIST_KEY];
    return raw ? (JSON.parse(raw) as string[]) : [];
  }

  it("triple invocation inside one tick creates exactly one resume", async () => {
    seedDraft(8, baseData(), ["phone", "email", "desiredPosition"]);
    const tree = await mountWizard();

    const button = findByText(tree.root, "button", "Создать резюме");
    await act(async () => {
      button.props.onClick();
      button.props.onClick();
      button.props.onClick();
    });

    expect(resumeIds()).toHaveLength(1);
    expect(Object.keys(fakeWindow.data).filter((k) => k.startsWith("rp:rr:"))).toHaveLength(1);
    expect(routerPush).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it("a second finalize attempt after re-render is ignored too", async () => {
    seedDraft(8, baseData(), ["phone", "email", "desiredPosition"]);
    const tree = await mountWizard();

    // Capture the handler of the first render, then click twice: the second
    // invocation carries the same closure, so only the state-level guard can
    // stop it.
    const firstRender = findByText(tree.root, "button", "Создать резюме");
    await act(async () => {
      firstRender.props.onClick();
      firstRender.props.onClick();
    });

    expect(resumeIds()).toHaveLength(1);
    expect(routerPush).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it("exactly one persistence write per finalize click", async () => {
    seedDraft(8, baseData(), ["phone", "email", "desiredPosition"]);
    const tree = await mountWizard();

    await act(async () => {
      findByText(tree.root, "button", "Создать резюме").props.onClick();
      findByText(tree.root, "button", "Создать резюме").props.onClick();
    });

    // finalizeResume -> saveResumeRecord writes the record + the list key; the
    // draft removal is a removeItem. Any second resume would add more writes.
    const writes = fakeWindow.localStorage.setItem.mock.calls.filter(([key]) =>
      key.startsWith("rp:rr:") || key === RESUME_LIST_KEY,
    );
    expect(writes).toHaveLength(2);
    act(() => tree.unmount());
  });

  it("the button shows a pending state immediately after the first click", async () => {
    seedDraft(8, baseData(), ["phone", "email", "desiredPosition"]);
    const tree = await mountWizard();

    await click(tree, "Создать резюме");

    const pending = findByText(tree.root, "button", "Создаём резюме");
    expect(pending.props.disabled).toBe(true);
    act(() => tree.unmount());
  });

  it("a failed finalize releases the guard so the user can retry", async () => {
    seedDraft(8, baseData(), ["phone", "email", "desiredPosition"]);
    const tree = await mountWizard();

    fakeWindow.localStorage.setItem = vi.fn((key: string, value: string) => {
      if (key === "rp:resume-list") throw new Error("QuotaExceededError");
      fakeWindow.data[key] = value;
    });
    await click(tree, "Создать резюме");
    expect(renderedText(tree)).toContain("Не удалось сохранить резюме");

    // Storage healthy again: the guard must have been released by the failure.
    fakeWindow.localStorage.setItem = vi.fn((key: string, value: string) => {
      fakeWindow.data[key] = value;
    });
    await click(tree, "Создать резюме");

    expect(routerPush).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });
});

// =========================================================================
// P32-2 — step 7 must be passable, the gate lives on step 8
// =========================================================================

describe("step 7 is not a dead end (P32-2)", () => {
  it("valid steps 1-7 without confirmations reach step 8", async () => {
    // No confirmedFields at all — exactly the P32-2 scenario.
    seedDraft(7, baseData(), []);
    const tree = await mountWizard();

    expect(stepHeading(tree)).toBe("Шаг 7 из 8: Предварительный просмотр");
    expect(findByText(tree.root, "button", "Далее →").props.disabled).toBe(false);

    await click(tree, "Далее →");

    expect(stepHeading(tree)).toBe("Шаг 8 из 8: Подтверждение фактов");
    act(() => tree.unmount());
  });

  it("step 8 explains the missing confirmations and keeps finalize blocked", async () => {
    seedDraft(8, baseData(), []);
    const tree = await mountWizard();

    expect(findByText(tree.root, "button", "Создать резюме").props.disabled).toBe(true);
    const text = renderedText(tree);
    expect(text).toContain("необходимо подтвердить обязательные поля");
    expect(text).toContain("Телефон");
    expect(text).toContain("Email");
    expect(text).toContain("Желаемая должность");
    act(() => tree.unmount());
  });

  it("step 7 keeps a way back to the steps that own the gated fields", async () => {
    seedDraft(7, baseData(), []);
    const tree = await mountWizard();

    expect(findByText(tree.root, "button", "← Назад").props.disabled).toBeFalsy();

    await click(tree, "← Назад");
    expect(stepHeading(tree)).toBe("Шаг 6 из 8: Дополнительная информация");
    act(() => tree.unmount());
  });

  it("the finalize gate is NOT weakened: unfilled required field still blocks", async () => {
    seedDraft(8, baseData({ phone: "" }), ["email", "desiredPosition"]);
    const tree = await mountWizard();

    expect(findByText(tree.root, "button", "Создать резюме").props.disabled).toBe(true);
    expect(renderedText(tree)).toContain("Телефон");
    act(() => tree.unmount());
  });
});

// =========================================================================
// Draft envelope stays intact (guarding the autosave contract)
// =========================================================================

describe("explicit 'Сохранить черновик' contract unchanged", () => {
  it("writes the envelope with data, step and confirmedFields", async () => {
    seedDraft(2, baseData(), ["phone"]);
    const tree = await mountWizard();

    await click(tree, "Сохранить черновик");

    expect(renderedText(tree)).toContain("Черновик сохранён");
    const saved = readDraft();
    expect(saved.step).toBe(2);
    expect(saved.data.firstName).toBe("Иван");
    expect(saved.confirmedFields).toEqual(["phone"]);
    act(() => tree.unmount());
  });
});

// =========================================================================
// P33-F-01 — multi-value fields must not destroy typed characters
//
// The two remaining controlled inputs that derived their value from the PARSED
// array destroyed everything a parse normalizes away:
//
//   value={data.languages.join(", ")}   onChange={v.split(",")…}   (step 6)
//   value={achievementsToText(…)}      onChange={parseAchievements(v)} (step 3)
//
// so "Русский, Английский" came back as "РусскийАнглийский" (the comma and the
// space are gone) and "Growth up 30%" as "Growthup30%" (every space is gone).
//
// Invariant under test: every character the user types survives the controlled
// input round-trip. The raw editing text is the source of truth for the
// displayed value; the canonical string[] is written on blur only. The tests
// below are the negative regression guard for the old pattern — restoring
// `value={array.join(…)}` + `onChange={parse(…)}` makes them fail, because
// `typeInto` re-reads the rendered `value` after EVERY keystroke and the
// blur-independent "nothing is committed before blur" assertions stop holding.
// =========================================================================

const ACHIEVEMENTS_FIELD = "work-w1-achievements";

function workEntry(achievements: string[] = [], overrides: Record<string, unknown> = {}) {
  return [
    {
      id: "w1",
      company: "Acme",
      position: "Frontend Developer",
      startDate: "01/2022",
      endDate: null,
      isCurrent: true,
      description: "React",
      achievements,
      ...overrides,
    },
  ];
}

describe("languages keep every typed character (P33-F-01)", () => {
  it("'Русский, Английский' survives the controlled round-trip key by key", async () => {
    seedDraft(6, baseData({ languages: [] }));
    const tree = await mountWizard();

    // typeInto asserts after EVERY keystroke that the rendered value is exactly
    // what has been typed so far — the comma and the space included.
    await typeInto(tree, "languages", "Русский, Английский");

    const value = controlValue(tree, "languages");
    expect(value).toBe("Русский, Английский");
    expect(value).toContain(",");
    expect(value).toContain(" ");
    expect(value).not.toBe("РусскийАнглийский");
    act(() => tree.unmount());
  });

  it("blur parses the text into the canonical string[]", async () => {
    seedDraft(6, baseData({ languages: [] }));
    const tree = await mountWizard();

    await typeInto(tree, "languages", "Русский, Английский");
    await blurField(tree, "languages");
    await click(tree, "Сохранить черновик");

    expect(readDraft().data.languages).toEqual(["Русский", "Английский"]);
    act(() => tree.unmount());
  });

  it("negative guard: the value is not re-serialized from the array while typing", async () => {
    seedDraft(6, baseData({ languages: [] }));
    const tree = await mountWizard();

    // "Русский , Английский" is the cheapest possible probe: a value
    // serialized back from the parsed array collapses it to
    // "Русский, Английский" on the very next render.
    await typeInto(tree, "languages", "Русский , Английский");
    expect(controlValue(tree, "languages")).toBe("Русский , Английский");

    // P33-F-14 changed what this assertion may look at: the draft is now a
    // PROJECTION of the raw buffers, so it holds the semantic snapshot even
    // though canonical `data` is still untouched. The draft can therefore no
    // longer proxy for "canonical data not updated" — the rendered value is the
    // direct proof, because re-serializing from the array would have collapsed
    // it to "Русский, Английский" on the very next render.
    await click(tree, "Сохранить черновик");
    expect(readDraft().data.languages).toEqual(["Русский", "Английский"]);
    expect(controlValue(tree, "languages")).toBe("Русский , Английский");
    expect(controlValue(tree, "languages")).not.toBe(
      ["Русский", "Английский"].join(", "),
    );

    // Blur canonicalizes the displayed text AND the array.
    await blurField(tree, "languages");
    expect(controlValue(tree, "languages")).toBe("Русский, Английский");
    await click(tree, "Сохранить черновик");
    expect(readDraft().data.languages).toEqual(["Русский", "Английский"]);
    act(() => tree.unmount());
  });

  it("the preview format is unchanged ('Русский, Английский')", async () => {
    seedDraft(6, baseData({ languages: [] }));
    const tree = await mountWizard();

    await typeInto(tree, "languages", "Русский, Английский");
    await blurField(tree, "languages");
    await click(tree, "Перейти к просмотру →");

    expect(stepHeading(tree)).toBe("Шаг 7 из 8: Предварительный просмотр");
    expect(renderedText(tree)).toContain("Русский, Английский");
    act(() => tree.unmount());
  });

  it("a restored draft still renders its canonical array", async () => {
    seedDraft(6, baseData({ languages: ["Русский", "Английский"] }));
    const tree = await mountWizard();

    expect(controlValue(tree, "languages")).toBe("Русский, Английский");
    act(() => tree.unmount());
  });

  it("the finalized version keeps the normalized string[]", async () => {
    seedDraft(
      8,
      baseData({ languages: [] }),
      ["phone", "email", "desiredPosition"],
    );
    const tree = await mountWizard();

    // Go to step 6, type, blur, then return to the fact-check step.
    for (let i = 0; i < 2; i++) {
      await click(tree, "← Назад");
    }
    expect(stepHeading(tree)).toBe("Шаг 6 из 8: Дополнительная информация");

    await typeInto(tree, "languages", "Русский, Английский");
    await blurField(tree, "languages");
    await click(tree, "Перейти к просмотру →");
    await click(tree, "Далее →");
    await click(tree, "Создать резюме");

    expect(routerPush).toHaveBeenCalledTimes(1);
    const id = (routerPush.mock.calls[0][0] as string).split("/")[2];
    const record = JSON.parse(fakeWindow.data[`rp:rr:${id}`] as string);
    expect(record.versions[0].data.languages).toEqual(["Русский", "Английский"]);
    act(() => tree.unmount());
  });
});

describe("achievements keep every typed character (P33-F-01)", () => {
  const TYPED = "Growth up 30%\nRetention +40%\nNPS up";

  it("spaces and newlines survive the controlled round-trip key by key", async () => {
    seedDraft(3, baseData({ workExperience: workEntry() }));
    const tree = await mountWizard();

    await typeInto(tree, ACHIEVEMENTS_FIELD, TYPED);

    const value = controlValue(tree, ACHIEVEMENTS_FIELD);
    expect(value).toBe(TYPED);
    expect(value).toContain(" ");
    expect(value).toContain("\n");
    expect(value).not.toBe("Growthup30%Retention+40%NPSup");
    act(() => tree.unmount());
  });

  it("blur parses the textarea into the canonical string[]", async () => {
    seedDraft(3, baseData({ workExperience: workEntry() }));
    const tree = await mountWizard();

    await typeInto(tree, ACHIEVEMENTS_FIELD, TYPED);
    await blurField(tree, ACHIEVEMENTS_FIELD);
    await click(tree, "Сохранить черновик");

    expect(readDraft().data.workExperience[0].achievements).toEqual([
      "Growth up 30%",
      "Retention +40%",
      "NPS up",
    ]);
    act(() => tree.unmount());
  });

  it("negative guard: the textarea is not re-serialized from the array while typing", async () => {
    seedDraft(3, baseData({ workExperience: workEntry() }));
    const tree = await mountWizard();

    // A trailing newline is the cheapest possible probe: parseAchievements
    // drops it, so a value serialized back from the array would erase it on
    // the very next render.
    await typeInto(tree, ACHIEVEMENTS_FIELD, "Growth up 30%\n");
    expect(controlValue(tree, ACHIEVEMENTS_FIELD)).toBe("Growth up 30%\n");

    // P33-F-14: the draft now carries the semantic snapshot of the raw buffer,
    // so it is no longer a valid proxy for "canonical data untouched". The
    // retained trailing newline in the rendered value IS that proof: a
    // canonical array written per keystroke would have re-derived the buffer
    // through parseAchievements and dropped it.
    await click(tree, "Сохранить черновик");
    expect(readDraft().data.workExperience[0].achievements).toEqual([
      "Growth up 30%",
    ]);
    expect(controlValue(tree, ACHIEVEMENTS_FIELD)).toBe("Growth up 30%\n");

    // Blur canonicalizes the displayed text AND the array.
    await blurField(tree, ACHIEVEMENTS_FIELD);
    expect(controlValue(tree, ACHIEVEMENTS_FIELD)).toBe("Growth up 30%");
    await click(tree, "Сохранить черновик");
    expect(readDraft().data.workExperience[0].achievements).toEqual([
      "Growth up 30%",
    ]);
    act(() => tree.unmount());
  });

  it("a restored draft still renders its achievements textarea", async () => {
    seedDraft(
      3,
      baseData({ workExperience: workEntry(["Growth up 30%", "Retention +40%"]) }),
    );
    const tree = await mountWizard();

    expect(controlValue(tree, ACHIEVEMENTS_FIELD)).toBe(
      "Growth up 30%\nRetention +40%",
    );
    act(() => tree.unmount());
  });

  it("typing into another field of the same job keeps the achievements text", async () => {
    seedDraft(3, baseData({ workExperience: workEntry() }));
    const tree = await mountWizard();

    await typeInto(tree, ACHIEVEMENTS_FIELD, "Growth up 30%,\nRetention +40%");
    await typeInto(tree, "work-w1-company", "Acme Corporation");

    expect(controlValue(tree, ACHIEVEMENTS_FIELD)).toBe("Growth up 30%,\nRetention +40%");
    act(() => tree.unmount());
  });

  it("two jobs keep independent achievement texts", async () => {
    seedDraft(
      3,
      baseData({
        workExperience: [
          ...workEntry(),
          {
            id: "w2",
            company: "Beta",
            position: "Lead",
            startDate: "01/2018",
            endDate: null,
            isCurrent: false,
            description: "",
            achievements: [],
          },
        ],
      }),
    );
    const tree = await mountWizard();

    await typeInto(tree, ACHIEVEMENTS_FIELD, "Growth up 30%");
    await typeInto(tree, "work-w2-achievements", "Retention +40%");

    expect(controlValue(tree, ACHIEVEMENTS_FIELD)).toBe("Growth up 30%");
    expect(controlValue(tree, "work-w2-achievements")).toBe("Retention +40%");

    await blurField(tree, ACHIEVEMENTS_FIELD);
    await blurField(tree, "work-w2-achievements");
    await click(tree, "Сохранить черновик");

    const saved = readDraft().data.workExperience;
    expect(saved[0].achievements).toEqual(["Growth up 30%"]);
    expect(saved[1].achievements).toEqual(["Retention +40%"]);
    act(() => tree.unmount());
  });

  it("the preview lists the achievements one per line, unmerged", async () => {
    seedDraft(3, baseData({ workExperience: workEntry() }));
    const tree = await mountWizard();

    await typeInto(tree, ACHIEVEMENTS_FIELD, TYPED);
    await blurField(tree, ACHIEVEMENTS_FIELD);
    for (let i = 0; i < 4; i++) {
      await advance(tree);
    }

    expect(stepHeading(tree)).toBe("Шаг 7 из 8: Предварительный просмотр");
    const text = renderedText(tree);
    expect(text).toContain("Growth up 30%");
    expect(text).toContain("Retention +40%");
    expect(text).toContain("NPS up");
    expect(text).not.toContain("Growthup30%");
    act(() => tree.unmount());
  });
});

// =========================================================================
// P33-F-14 — the draft autosave must capture UNCOMMITTED raw multi-value text
//
// P33-F-01 moved the languages input and the achievements textarea to raw
// editing buffers, so typing no longer mutates `data` — which is exactly what
// the P32-1 debounced autosave watched. The effect therefore never re-ran while
// the user typed, and a reload lost everything typed since the last blur:
//
//   rp:resume-draft:new -> languages: []   (real browser reproduction)
//
// The fix is a derived, PERSISTENCE-ONLY snapshot (`persistedData`) that the
// autosave gate, the debounced write, the explicit save and both flush paths use
// instead of canonical `data`. The invariant these tests protect is the split:
//   - the DRAFT sees the typed text (semantically parsed), and
//   - the RENDERED input still shows the user's raw editing text, unnormalized.
// The second half is what stops P33-F-01 from coming back.
//
// Debounce is 600 ms; timers are faked narrowly (setTimeout/clearTimeout only,
// so Date/microtasks stay real) and advanced past it deterministically.
// =========================================================================

const ACH_MULTILINE = "Growth up 30%\nRetention +40%\nNPS up";

describe("draft autosave captures uncommitted raw text (P33-F-14)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Lets the 600 ms debounce elapse and flushes the scheduled write. */
  async function runAutosave() {
    await act(async () => {
      vi.advanceTimersByTime(700);
    });
  }

  it("languages: no blur -> autosave stores the parsed snapshot", async () => {
    seedDraft(6, baseData({ languages: [] }));
    const tree = await mountWizard();

    // typeInto re-reads the rendered value after every keystroke and never blurs.
    await typeInto(tree, "languages", "Русский, Английский");
    expect(controlValue(tree, "languages")).toBe("Русский, Английский");

    await runAutosave();

    expect(readDraft().data.languages).toEqual(["Русский", "Английский"]);
    act(() => tree.unmount());
  });

  it("languages: autosave then remount restores exactly what was typed", async () => {
    seedDraft(6, baseData({ languages: [] }));
    const tree = await mountWizard();

    await typeInto(tree, "languages", "Русский, Английский");
    await runAutosave();
    act(() => tree.unmount());

    // A fresh mount reads the persisted draft back — the "reload" case.
    const restored = await mountWizard();
    expect(controlValue(restored, "languages")).toBe("Русский, Английский");
    act(() => restored.unmount());
  });

  it("achievements: no blur -> autosave stores the parsed snapshot", async () => {
    seedDraft(3, baseData({ workExperience: workEntry() }));
    const tree = await mountWizard();

    await typeInto(tree, ACHIEVEMENTS_FIELD, ACH_MULTILINE);
    expect(controlValue(tree, ACHIEVEMENTS_FIELD)).toBe(ACH_MULTILINE);

    await runAutosave();

    expect(readDraft().data.workExperience[0].achievements).toEqual([
      "Growth up 30%",
      "Retention +40%",
      "NPS up",
    ]);
    act(() => tree.unmount());
  });

  it("achievements: autosave then remount restores the textarea exactly", async () => {
    seedDraft(3, baseData({ workExperience: workEntry() }));
    const tree = await mountWizard();

    await typeInto(tree, ACHIEVEMENTS_FIELD, ACH_MULTILINE);
    await runAutosave();
    act(() => tree.unmount());

    const restored = await mountWizard();
    expect(controlValue(restored, ACHIEVEMENTS_FIELD)).toBe(ACH_MULTILINE);
    act(() => restored.unmount());
  });

  it("blur still commits the canonical arrays", async () => {
    seedDraft(6, baseData({ languages: [] }));
    const tree = await mountWizard();

    await typeInto(tree, "languages", "Русский, Английский");
    await blurField(tree, "languages");
    await runAutosave();

    expect(readDraft().data.languages).toEqual(["Русский", "Английский"]);
    expect(controlValue(tree, "languages")).toBe("Русский, Английский");
    act(() => tree.unmount());
  });

  it("blur commit still reaches achievements", async () => {
    seedDraft(3, baseData({ workExperience: workEntry() }));
    const tree = await mountWizard();

    await typeInto(tree, ACHIEVEMENTS_FIELD, ACH_MULTILINE);
    await blurField(tree, ACHIEVEMENTS_FIELD);
    await runAutosave();

    expect(readDraft().data.workExperience[0].achievements).toEqual([
      "Growth up 30%",
      "Retention +40%",
      "NPS up",
    ]);
    act(() => tree.unmount());
  });

  it("canonical stays blur-only: an un-normalized buffer is not canonicalized", async () => {
    seedDraft(6, baseData({ languages: [] }));
    const tree = await mountWizard();

    // The trailing space can only survive if `data.languages` was NOT written on
    // the keystroke: writing it would change the array identity and the sync
    // effect would re-derive the buffer from the trimmed array.
    await typeInto(tree, "languages", "Русский, Английский ");
    expect(controlValue(tree, "languages")).toBe("Русский, Английский ");

    await runAutosave();

    // The draft takes the SEMANTIC snapshot (documented limitation: restore is
    // semantic, not byte-exact) while the rendered raw text is untouched.
    expect(readDraft().data.languages).toEqual(["Русский", "Английский"]);
    expect(controlValue(tree, "languages")).toBe("Русский, Английский ");
    act(() => tree.unmount());
  });

  it("unrelated fields keep autosaving unblurred (P32-1 regression lock)", async () => {
    seedDraft(6, baseData({ summary: "" }));
    const tree = await mountWizard();

    await typeInto(tree, "summary", "Опыт в frontend");
    await runAutosave();

    expect(readDraft().data.summary).toBe("Опыт в frontend");
    act(() => tree.unmount());
  });

  it("negative guard: the autosave never rewrites what the user sees", async () => {
    // A draft write happens in the middle of this test. If anyone ever routed
    // `persistedData` into a rendered value, the buffer would snap back to the
    // normalized serialization here.
    seedDraft(6, baseData({ languages: [] }));
    const tree = await mountWizard();

    await typeInto(tree, "languages", "Русский , Английский");
    await runAutosave();

    expect(controlValue(tree, "languages")).toBe("Русский , Английский");
    expect(controlValue(tree, "languages")).not.toBe(
      ["Русский", "Английский"].join(", "),
    );
    act(() => tree.unmount());
  });

  it("negative guard: newlines and spaces survive an autosave round-trip", async () => {
    seedDraft(3, baseData({ workExperience: workEntry() }));
    const tree = await mountWizard();

    await typeInto(tree, ACHIEVEMENTS_FIELD, "Growth up 30%\n");
    await runAutosave();

    expect(controlValue(tree, ACHIEVEMENTS_FIELD)).toBe("Growth up 30%\n");
    act(() => tree.unmount());
  });

  it("the rendered value is never derived from the canonical array", async () => {
    seedDraft(6, baseData({ languages: [] }));
    const tree = await mountWizard();

    await typeInto(tree, "languages", "Русский, Английский");
    await blurField(tree, "languages");
    await runAutosave();
    expect(readDraft().data.languages).toEqual(["Русский", "Английский"]);

    // Keep typing WITHOUT blurring. If the value were derived from the canonical
    // array, the buffer would snap back to the joined array on the next render
    // and ", Немецкий" would never be visible.
    await typeInto(tree, "languages", "Русский, Английский, Немецкий");
    expect(controlValue(tree, "languages")).toBe("Русский, Английский, Немецкий");

    // The decisive probe: a trailing space, which `join(", ")` can never emit.
    await act(async () => {
      findControl(tree, "languages").props.onChange({
        target: { value: "Русский, Английский, Немецкий " },
      });
    });
    expect(controlValue(tree, "languages")).toBe("Русский, Английский, Немецкий ");
    act(() => tree.unmount());
  });

  it("no spurious autosave on mount: restoring a draft rewrites nothing", async () => {
    seedDraft(6, baseData({ languages: ["Русский", "Английский"] }));
    const stored = fakeWindow.data[DRAFT_KEY];

    const tree = await mountWizard();
    await runAutosave();

    const writes = fakeWindow.localStorage.setItem.mock.calls.filter(
      ([key]) => key === DRAFT_KEY,
    );
    expect(writes).toHaveLength(0);
    expect(fakeWindow.data[DRAFT_KEY]).toBe(stored);
    act(() => tree.unmount());
  });

  it("the draft carries both fields at once after typing in each", async () => {
    seedDraft(3, baseData({ workExperience: workEntry() }));
    const tree = await mountWizard();

    await typeInto(tree, ACHIEVEMENTS_FIELD, ACH_MULTILINE);
    for (let i = 0; i < 3; i++) {
      await advance(tree);
    }
    await typeInto(tree, "languages", "Русский, Английский");
    await runAutosave();

    const saved = readDraft().data;
    expect(saved.languages).toEqual(["Русский", "Английский"]);
    expect(saved.workExperience[0].achievements).toEqual([
      "Growth up 30%",
      "Retention +40%",
      "NPS up",
    ]);
    act(() => tree.unmount());
  });
});