import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { create, act } from "react-test-renderer";
import { useState, useEffect, useMemo, useRef, useCallback, createElement } from "react";
import { InMemoryStore } from "../../lib/persistence";
import type { PersistenceStore } from "../../lib/persistence";
import { confirmField } from "../../types/confirmation";
import type { ResumeRecord, ResumeVersion } from "../../types/resume";
import type { HHFieldInstruction } from "../../types/hh-wizard";

// P26-F1 regression: the HH wizard page previously passed a
// selectedResumeId-dependent loader to useClientData, whose loader runs only
// once at mount (for selectedResumeId=""). Every valid resume then rendered
// "Резюме не найдено" and the whole checklist was unreachable. This test
// drives the page's ACTUAL data flow — the real listResumeRecords persistence
// service, the P26 record-derivation fix (record from the records list), and
// the instructions/progress-restore effect — through the verbatim
// useClientData contract, for selection, deep-link, switch, and stale flows.
//
// Persistence services create module-level stores on first import, so
// window.localStorage is stubbed BEFORE the dynamic import
// (vi.resetModules + await import — the persistence-hardening pattern).

// ---- Fixtures ----

function makeVersion(number: number, id: string, resumeId: string): ResumeVersion {
  return {
    id,
    resumeId,
    versionNumber: number,
    data: {
      desiredPosition: { value: "Frontend Developer", level: "confirmed" },
      summary: { value: "Опытный разработчик интерфейсов.", level: "confirmed" },
      salaryExpectation: { value: "250000 руб.", level: "confirmed" },
      location: { value: "Москва", level: "confirmed" },
      workExperience: [],
      education: [],
      skills: [{ name: "React", level: "advanced" }],
      languages: [],
      workFormat: "remote",
      employmentType: "full_time",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeRecord(id: string, title: string, currentVersionId: string): ResumeRecord {
  return {
    id,
    resume: {
      id,
      candidateId: "c1",
      title,
      desiredPosition: confirmField(title),
      summary: confirmField("Сводка."),
      salaryExpectation: confirmField("100"),
      location: confirmField("Москва"),
      workExperience: [],
      education: [],
      skills: [],
      languages: [],
      currentVersionId,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
    versions: [
      makeVersion(1, `v-${id}-1`, id),
      makeVersion(2, currentVersionId, id),
    ],
    candidateInfo: {
      firstName: "Иван",
      lastName: "Иванов",
      middleName: "",
      email: "a@b.c",
      phone: "+7 900 000 00 00",
      city: "Москва",
    },
    workFormat: "remote",
    employmentType: "full_time",
    confirmedFields: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
}

const RECORD_A = makeRecord("resume-A", "Resume A", "v-A-cur");
const RECORD_B = makeRecord("resume-B", "Resume B", "v-B-cur");

function makeFakeStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem(key: string): string | null {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      data.set(key, value);
    },
    removeItem(key: string): void {
      data.delete(key);
    },
  };
}

let storage: ReturnType<typeof makeFakeStorage>;

function seedStorage(records: ResumeRecord[]): void {
  for (const r of records) {
    storage.data.set("rp:rr:" + r.id, JSON.stringify(r));
  }
  storage.data.set("rp:resume-list", JSON.stringify(records.map((r) => r.id)));
}

beforeEach(() => {
  storage = makeFakeStorage();
  (globalThis as unknown as { window?: unknown }).window = { localStorage: storage };
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
  vi.resetModules();
});

// ---- Verbatim useClientData contract (features/use-client-data.ts) ----

function useClientData<T>(loader: () => T): { data: T | null; ready: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [ready, setReady] = useState(false);
  const [, setNonce] = useState(0);
  const loaderRef = useRef(loader);

  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    setData(loaderRef.current());
    setReady(true);
  }, [setNonce]);

  return { data, ready };
}

// ---- The page's P26-fixed data flow (verbatim structure of page.tsx) ----
// Services are injected post-import so the singleton stores bind to the
// stubbed localStorage exactly like in the running app.

interface FlowServices {
  listResumeRecords: () => ResumeRecord[];
  createHHWizard: () => {
    generateInstructions(
      source: ResumeVersion["data"],
    ): HHFieldInstruction[];
    markCompleted(i: HHFieldInstruction): HHFieldInstruction;
  };
  loadHHWizardProgress: (
    store: PersistenceStore<unknown>,
    resumeId: string,
  ) => string[] | null;
  saveHHWizardProgress: (
    store: PersistenceStore<unknown>,
    resumeId: string,
    ids: Iterable<string>,
  ) => boolean;
}

function WizardFlow({
  resumeIdParam,
  progressStore,
  services,
}: {
  resumeIdParam: string;
  progressStore: PersistenceStore<unknown>;
  services: FlowServices;
}) {
  const wizardRef = useRef(services.createHHWizard());
  const wizard = wizardRef.current;

  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [deepLinkApplied, setDeepLinkApplied] = useState(false);
  const recordsState = useClientData(services.listResumeRecords);

  // page.tsx:48-52 — deep-link applied once, after records are ready
  useEffect(() => {
    if (deepLinkApplied || !recordsState.ready) return;
    setDeepLinkApplied(true);
    if (resumeIdParam) setSelectedResumeId(resumeIdParam);
  }, [deepLinkApplied, recordsState.ready, resumeIdParam]);

  const [instructions, setInstructions] = useState<HHFieldInstruction[]>([]);

  const records: ResumeRecord[] = useMemo(
    () => recordsState.data ?? [],
    [recordsState.data],
  );

  // P26-F1 fix under test: record DERIVED from the loaded records list
  const record: ResumeRecord | null = selectedResumeId
    ? records.find((r) => r.id === selectedResumeId) ?? null
    : null;

  useEffect(() => {
    if (!record) {
      setInstructions([]);
      return;
    }
    const version =
      record.versions.find((v) => v.id === record.resume.currentVersionId) ??
      record.versions[record.versions.length - 1];
    if (!version) {
      setInstructions([]);
      return;
    }
    const base = wizard.generateInstructions(version.data);
    const completedIds = services.loadHHWizardProgress(progressStore, record.id);
    setInstructions(
      completedIds
        ? base.map((instruction) =>
            completedIds.includes(instruction.hhFieldKey)
              ? wizard.markCompleted(instruction)
              : instruction,
          )
        : base,
    );
  }, [record, progressStore, wizard, services]);

  const toggleCompleted = useCallback(
    (fieldKey: string) => {
      setInstructions((prev) => {
        const next = prev.map((instruction) =>
          instruction.hhFieldKey === fieldKey
            ? { ...instruction, isCompleted: !instruction.isCompleted }
            : instruction,
        );
        if (record) {
          services.saveHHWizardProgress(
            progressStore,
            record.id,
            next.filter((i) => i.isCompleted).map((i) => i.hhFieldKey),
          );
        }
        return next;
      });
    },
    [record, progressStore, services],
  );

  return {
    selectedResumeId,
    setSelectedResumeId,
    toggleCompleted,
    records,
    record,
    instructions,
    recordsState,
  };
}

function FlowDriver(props: {
  resumeIdParam: string;
  progressStore: PersistenceStore<unknown>;
  services: FlowServices;
}) {
  const flow = WizardFlow(props);
  const checklist = flow.record
    ? "checklist"
    : flow.recordsState.ready
      ? "not-found"
      : "loading";
  return createElement("div", {
    "data-checklist": checklist,
    "data-selected": flow.selectedResumeId,
    "data-fields": String(flow.instructions.length),
    "data-completed": String(flow.instructions.filter((i) => i.isCompleted).length),
    "data-title": flow.record ? flow.record.resume.title : "",
    "data-record-count": String(flow.records.length),
    flow,
  });
}

function readFlow(tree: { root: ReturnType<typeof create>["root"] }) {
  const div = tree.root.findByType("div");
  return { props: div.props, flow: div.props.flow as ReturnType<typeof WizardFlow> };
}

async function importServices(): Promise<FlowServices> {
  const resume = await import("../../services/resume-persistence");
  const wizard = await import("../../features/hh-wizard");
  return {
    listResumeRecords: resume.listResumeRecords,
    createHHWizard: wizard.createHHWizard,
    loadHHWizardProgress: wizard.loadHHWizardProgress,
    saveHHWizardProgress: wizard.saveHHWizardProgress,
  };
}

// ---- Tests ----

describe("HH wizard page flow (P26-F1 regression)", () => {
  it("deep link ?resumeId=valid renders the 7-field checklist", async () => {
    seedStorage([RECORD_A, RECORD_B]);
    const services = await importServices();
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(
        createElement(FlowDriver, {
          resumeIdParam: "resume-A",
          progressStore: new InMemoryStore<unknown>(),
          services,
        }),
      );
    });
    const { props, flow } = readFlow(tree);
    expect(props["data-checklist"]).toBe("checklist");
    expect(props["data-fields"]).toBe("7");
    expect(props["data-selected"]).toBe("resume-A");
    expect(props["data-title"]).toBe("Resume A");
    expect(flow.instructions.map((i) => i.hhFieldKey)).toEqual([
      "title",
      "salary",
      "employment_type",
      "experience",
      "education",
      "skills",
      "about",
    ]);
  });

  it("selection flow: /hh-wizard → user selects a valid resume → 7 fields", async () => {
    seedStorage([RECORD_A, RECORD_B]);
    const services = await importServices();
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(
        createElement(FlowDriver, {
          resumeIdParam: "",
          progressStore: new InMemoryStore<unknown>(),
          services,
        }),
      );
    });
    let { props } = readFlow(tree);
    // Selection screen state: no selection, records listed, no checklist
    expect(props["data-selected"]).toBe("");
    expect(props["data-record-count"]).toBe("2");
    expect(props["data-fields"]).toBe("0");

    // User picks Resume B (the radio onChange path: setSelectedResumeId(id))
    const selection = readFlow(tree);
    await act(async () => {
      selection.flow.setSelectedResumeId("resume-B");
    });
    ({ props } = readFlow(tree));
    expect(props["data-checklist"]).toBe("checklist");
    expect(props["data-fields"]).toBe("7");
    expect(props["data-title"]).toBe("Resume B");
    expect(props["data-completed"]).toBe("0");
  });

  it("switch A → B → A: each checklist correct and per-resume progress isolated", async () => {
    seedStorage([RECORD_A, RECORD_B]);
    const services = await importServices();
    const progressStore = new InMemoryStore<unknown>();
    services.saveHHWizardProgress(progressStore, "resume-A", ["title", "salary"]);

    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(
        createElement(FlowDriver, { resumeIdParam: "resume-A", progressStore, services }),
      );
    });
    const { props, flow } = readFlow(tree);
    expect(props["data-checklist"]).toBe("checklist");
    expect(props["data-completed"]).toBe("2"); // persisted progress restored

    // Switch to B (in-component selection change — the previous BLOCKER path)
    await act(async () => {
      flow.setSelectedResumeId("resume-B");
    });
    const bState = readFlow(tree);
    expect(bState.props["data-checklist"]).toBe("checklist");
    expect(bState.props["data-title"]).toBe("Resume B");
    expect(bState.props["data-completed"]).toBe("0"); // B sees no A progress

    // Complete one field on B, then switch back to A
    await act(async () => {
      bState.flow.toggleCompleted("about");
    });
    const bDone = readFlow(tree);
    expect(bDone.props["data-completed"]).toBe("1");
    await act(async () => {
      bDone.flow.setSelectedResumeId("resume-A");
    });
    const backToA = readFlow(tree);
    expect(backToA.props["data-title"]).toBe("Resume A");
    expect(backToA.props["data-completed"]).toBe("2"); // A intact — isolation
    expect(
      services.loadHHWizardProgress(progressStore, "resume-B"),
    ).toEqual(["about"]);
  });

  it("stale/deleted resumeId → graceful not-found, no crash", async () => {
    seedStorage([RECORD_A]);
    const services = await importServices();
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(
        createElement(FlowDriver, {
          resumeIdParam: "resume-DELETED",
          progressStore: new InMemoryStore<unknown>(),
          services,
        }),
      );
    });
    const { props } = readFlow(tree);
    expect(props["data-checklist"]).toBe("not-found");
    expect(props["data-fields"]).toBe("0");
  });

  it("dangling currentVersionId falls back to the last version (canonical resolution)", async () => {
    const record = makeRecord("resume-A", "Resume A", "v-DOES-NOT-EXIST");
    seedStorage([record]);
    const services = await importServices();
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(
        createElement(FlowDriver, {
          resumeIdParam: "resume-A",
          progressStore: new InMemoryStore<unknown>(),
          services,
        }),
      );
    });
    const { props } = readFlow(tree);
    expect(props["data-checklist"]).toBe("checklist");
    expect(props["data-fields"]).toBe("7");
  });
});
