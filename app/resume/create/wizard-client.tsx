"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  WIZARD_STEPS,
  DRAFT_CONTEXT_NEW,
  DRAFT_AUTOSAVE_DEBOUNCE_MS,
  createDefaultWizardData,
  createEmptyWorkExperience,
  createEmptyEducation,
  validateWizardStep,
  buildFactChecks,
  canFinalize,
  finalizeResume,
  loadForEdit,
  createNewVersion,
  draftKeyFor,
  normalizeDraft,
  discardDraft,
  draftFingerprint,
  invalidateConfirmation,
  parseAchievements,
  achievementsToText,
  canGoBackFrom,
  canProceedFrom,
  persistDraft,
  type WizardData,
  type WizardStep,
} from "@/features/resume-wizard";
import { WORK_FORMAT_LABELS, EMPLOYMENT_TYPE_LABELS } from "@/types/candidate";
import { EDUCATION_LEVEL_LABELS, educationLevelLabel, SKILL_LEVEL_LABELS, normalizeSkillLevel, skillLevelLabel } from "@/types/resume";
import type { WorkExperience, Education } from "@/types/resume";
import WizardProgress from "@/components/wizard/progress";
import WizardLayout from "@/components/wizard/wizard-layout";
import FormField from "@/components/ui/form-field";
import Loading from "@/components/ui/loading";
import { createPersistenceStore } from "@/lib/persistence";
import { getResumeRecord } from "@/services/resume-persistence";
import { sanitizeText, sanitizeTextInput } from "@/lib/security";

const draftStore = createPersistenceStore<unknown>();

const TOTAL_STEPS = WIZARD_STEPS.length;

const WORK_FORMAT_OPTIONS = Object.entries(WORK_FORMAT_LABELS).map(
  ([value, label]) => ({ value, label }),
);

const EMPLOYMENT_OPTIONS = Object.entries(EMPLOYMENT_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

/**
 * Comma-separated languages text -> canonical string[]: trim each item, drop
 * empties, keep order. The single definition used by BOTH the blur commit and
 * the P33-F-14 draft snapshot, so the two can never drift apart.
 */
function parseLanguagesText(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function WizardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editResumeId = searchParams.get("resumeId");

  const [step, setStep] = useState<WizardStep>(1);
  const [data, setData] = useState<WizardData>(createDefaultWizardData);
  const [confirmedFields, setConfirmedFields] = useState<Set<string>>(
    new Set(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [draftSaved, setDraftSaved] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentResumeId, setCurrentResumeId] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [saveError, setSaveError] = useState("");
  // P32-3: finalize is a state transition, not only a disabled button.
  const [finalizing, setFinalizing] = useState(false);
  // P32-6: a restored creation draft is announced and can be discarded.
  const [restoredDraft, setRestoredDraft] = useState<{ step: number } | null>(null);

  // P30-FOLLOWUP: handle for the "черновик сохранён" auto-hide timer. Without
  // it the timer survived unmount and fired setDraftSaved on a dead component.
  // Cleanup is unmount-only on purpose — repeated saves keep their existing
  // timing semantics (each save starts its own 2000 ms timer).
  const draftSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // P32-1: mirror of the current wizard state. Autosave, the unmount flush and
  // the P32-5 "did this field actually change?" check all need the LATEST value
  // from an effect cleanup / an event handler without re-subscribing on every
  // keystroke.
  //
  // P33-F-14: `data` stays CANONICAL on purpose — updateField/commitField read it
  // for P32-5 invalidation and blur canonicalization. `persistedData` is the
  // draft-only projection that also carries the P33-F-01 raw buffers.
  const latest = useRef({
    data,
    // Placeholder: `persistedData` is declared further down (the autosave effect
    // depends on it, so it must exist before that effect). On the first render
    // the two are structurally identical anyway, and the mirror effect below
    // overwrites this before any flush handler can read it.
    persistedData: data,
    step,
    confirmedFields,
    draftContext: DRAFT_CONTEXT_NEW,
  });

  // P32-1: identity of the last draft snapshot we decided is persisted.
  // Autosave runs only while the wizard state differs from it, which keeps
  // "nothing typed" / "just restored" / "just discarded" / "just finalized"
  // states write-free.
  const persistedFingerprint = useRef<string | null>(null);
  // P32-1: true while the current state is NOT in storage yet. Drives the
  // unload guard — no browser dialog appears once the draft is safe.
  const unsavedChanges = useRef(false);
  // P32-3: synchronous guard — a second/third click must be ignored even
  // inside one tick, before React re-renders the disabled button.
  const finalizeStarted = useRef(false);
  // P32-FIX-CORRECTION (F-01): handle of the pending debounced autosave.
  // Finalize does not unmount the page synchronously (router.push resolves
  // asynchronously and the preview route can render slowly), so a scheduled
  // write would fire AFTER draftStore.remove() and recreate the draft of an
  // already created resume. The timer is cancelled synchronously on success.
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic token of the newest scheduled autosave. The callback writes only
  // while it is still the current one — clearTimeout cannot un-queue a callback
  // that has already been handed to the task queue, so the generation is
  // re-checked inside the callback itself.
  const autosaveGeneration = useRef(0);

  useEffect(() => {
    return () => {
      if (draftSavedTimer.current) {
        clearTimeout(draftSavedTimer.current);
        draftSavedTimer.current = null;
      }
    };
  }, []);

  // Load draft or existing resume on mount
  useEffect(() => {
    if (editResumeId) {
      const loaded = loadForEdit(editResumeId);
      if (loaded) {
        setEditMode(true);
        setCurrentResumeId(editResumeId);
        // A draft saved for THIS resume wins over its persisted state.
        const savedDraft = normalizeDraft(
          draftStore.get(draftKeyFor(editResumeId)),
        );
        if (savedDraft) {
          const confirmed = new Set(savedDraft.confirmedFields);
          setData(savedDraft.data);
          setStep(savedDraft.step as WizardStep);
          setConfirmedFields(confirmed);
          persistedFingerprint.current = draftFingerprint(
            savedDraft.data,
            savedDraft.step,
            confirmed,
          );
        } else {
          const confirmed = new Set(loaded.record.confirmedFields);
          setData(loaded.wizardData);
          setStep(1);
          setConfirmedFields(confirmed);
          persistedFingerprint.current = draftFingerprint(
            loaded.wizardData,
            1,
            confirmed,
          );
        }
        setBooted(true);
        return;
      }
      // Unknown or deleted resume id: never fall back to create mode.
      setNotFound(true);
      setBooted(true);
      return;
    }
    const savedDraft = normalizeDraft(draftStore.get(draftKeyFor(DRAFT_CONTEXT_NEW)));
    if (savedDraft) {
      const confirmed = new Set(savedDraft.confirmedFields);
      setData(savedDraft.data);
      setStep(savedDraft.step as WizardStep);
      setConfirmedFields(confirmed);
      persistedFingerprint.current = draftFingerprint(
        savedDraft.data,
        savedDraft.step,
        confirmed,
      );
      // P32-6: a restored draft must be visible and discardable, otherwise
      // "+ Создать с нуля" silently continues a half-done resume.
      setRestoredDraft({ step: savedDraft.step });
    } else {
      persistedFingerprint.current = draftFingerprint(
        createDefaultWizardData(),
        1,
        new Set<string>(),
      );
    }
    setBooted(true);
  }, [editResumeId]);

  // ---------- P33-F-01: raw editing text for the multi-value fields ----------
  //
  // These two were the last controlled inputs whose value was re-serialized
  // from the PARSED array on every keystroke:
  //
  //   value={data.languages.join(", ")}  onChange={v.split(",")…}      (step 6)
  //   value={achievementsToText(…)}     onChange={parseAchievements(v)} (step 3)
  //
  // A parse drops exactly the characters the user is still typing — the comma
  // and the space after it in "Русский, Английский", every space in
  // "Growth up 30%" — so the controlled round-trip destroyed them and the field
  // merged the words ("РусскийАнглийский", "Growthup30%").
  //
  // The raw editing text is now the source of truth for the DISPLAYED value and
  // the canonical string[] is written on blur only. Nothing else changes: the
  // schema is still string[], the arrays are still normalized by the same
  // helpers, the preview format and the AI/matching contracts are untouched,
  // and a restored draft still renders from its canonical arrays.
  //
  // P33-F-14 NOTE: this block is declared ABOVE the draft machinery on purpose.
  // `persistedData` below feeds the autosave effect's dependency list, and a
  // `useMemo` must be initialized before the effects that read it — JavaScript
  // temporal-dead-zone rules make the reverse order a ReferenceError. The block
  // is self-contained (it only closes over `data`/`setData`), so moving it is
  // behavior-neutral.

  /** Comma-separated languages text the user is editing right now. */
  const [languagesText, setLanguagesText] = useState("");
  // Latest text, so the blur handler needs no per-keystroke re-subscription.
  const languagesTextRef = useRef("");
  // The array `languagesText` was derived from. A NEW reference means the
  // canonical value was replaced from outside this field (draft restore,
  // discarded draft, our own blur commit) and the text must be re-derived.
  const languagesSource = useRef<string[] | null>(null);

  useEffect(() => {
    if (languagesSource.current === data.languages) return;
    languagesSource.current = data.languages;
    const text = data.languages.join(", ");
    languagesTextRef.current = text;
    setLanguagesText(text);
  }, [data.languages]);

  const onLanguagesChange = useCallback((raw: string) => {
    // P32-4 contract: control characters are stripped, the user's spaces and
    // commas are not.
    const text = sanitizeTextInput(raw);
    languagesTextRef.current = text;
    setLanguagesText(text);
  }, []);

  // Canonical value on blur — same split/trim/drop-empties the field always
  // used, just no longer re-run on every keystroke.
  const commitLanguages = useCallback(() => {
    setData((prev) => ({
      ...prev,
      languages: parseLanguagesText(languagesTextRef.current),
    }));
  }, []);

  /** Raw achievements textarea text per work-entry id. */
  const [achievementsText, setAchievementsText] = useState<Record<string, string>>({});
  const achievementsTextRef = useRef<Record<string, string>>({});
  // Same contract as languagesSource, per work entry: the achievements array
  // the current text was derived from.
  const achievementsSource = useRef<Record<string, string[]>>({});

  useEffect(() => {
    const currentText = achievementsTextRef.current;
    const currentSource = achievementsSource.current;
    const nextText: Record<string, string> = {};
    const nextSource: Record<string, string[]> = {};
    let changed = false;
    for (const work of data.workExperience) {
      const sameSource = currentSource[work.id] === work.achievements;
      // Editing another field of the same job keeps the achievements ARRAY
      // identity, so only a replaced array re-derives the text.
      const text = sameSource
        ? (currentText[work.id] ?? "")
        : achievementsToText(work.achievements);
      if (!sameSource || currentText[work.id] !== text) changed = true;
      nextText[work.id] = text;
      nextSource[work.id] = work.achievements;
    }
    // A removed job must not leave its text behind.
    if (Object.keys(currentText).length !== Object.keys(nextText).length) {
      changed = true;
    }
    if (!changed) return;
    achievementsTextRef.current = nextText;
    achievementsSource.current = nextSource;
    setAchievementsText(nextText);
  }, [data.workExperience]);

  const onAchievementsChange = useCallback((workId: string, raw: string) => {
    // P32-4 contract: control characters are stripped; spaces and the newline
    // the user pressed are not (sanitizeTextInput keeps \t \n \r).
    const text = sanitizeTextInput(raw);
    const next = { ...achievementsTextRef.current, [workId]: text };
    achievementsTextRef.current = next;
    setAchievementsText(next);
  }, []);

  // Canonical value on blur — the unchanged P9.3 helper.
  const commitAchievements = useCallback((workId: string) => {
    const parsed = parseAchievements(achievementsTextRef.current[workId] ?? "");
    setData((prev) => ({
      ...prev,
      workExperience: prev.workExperience.map((w) =>
        w.id === workId ? { ...w, achievements: parsed } : w,
      ),
    }));
  }, []);

  // ---------- P33-F-14: derived DRAFT snapshot ----------
  //
  // P33-F-01 moved these two fields to raw editing buffers, so typing no longer
  // mutates `data` — which is exactly what the P32-1 autosave watches. The
  // debounced autosave therefore never re-ran, and a reload lost everything
  // typed since the last blur.
  //
  // This memo is a PERSISTENCE-ONLY projection of the raw buffers:
  //   - it NEVER becomes a rendered input value (the inputs read languagesText /
  //     achievementsText);
  //   - it NEVER replaces canonical `data`, which still changes only on blur;
  //   - it is NEVER read by finalize / preview / AI / HH, which keep using `data`.
  //
  // Restoring from the draft re-derives the buffers from these arrays, so the
  // round-trip is SEMANTIC: normalized text survives byte-for-byte
  // ("Русский, Английский", a well-formed multiline achievements block), while
  // deliberately un-normalized intermediate text is canonicalized on restore.
  // Storing the raw strings would need a draft-schema change, which is out of
  // scope by decision.
  const persistedData = useMemo<WizardData>(
    () => ({
      ...data,
      languages: parseLanguagesText(languagesText),
      workExperience: data.workExperience.map((work) => {
        const raw = achievementsText[work.id];
        // A work entry the sync effect has not seen yet keeps its canonical
        // array as-is (legacy drafts may carry `achievements: undefined`).
        return raw === undefined
          ? work
          : { ...work, achievements: parseAchievements(raw) };
      }),
    }),
    [data, languagesText, achievementsText],
  );

  // Mirrors both snapshots for the flush handlers / event callbacks that run
  // outside the render pass. Declared here because its dependency list reads
  // `persistedData` (P33-F-14).
  useEffect(() => {
    latest.current = {
      data,
      persistedData,
      step,
      confirmedFields,
      draftContext: editMode && currentResumeId ? currentResumeId : DRAFT_CONTEXT_NEW,
    };
  }, [data, persistedData, step, confirmedFields, editMode, currentResumeId]);

  const draftContext =
    editMode && currentResumeId ? currentResumeId : DRAFT_CONTEXT_NEW;

  // P32-1: one write path for every draft save (explicit button, autosave,
  // unmount flush) — keeps the failure contract of P14-F2 intact.
  const writeDraft = useCallback(
    (
      context: string,
      state: { data: WizardData; step: number; confirmedFields: Set<string> },
    ): boolean => {
      const saved = persistDraft(
        draftStore,
        context,
        state.data,
        state.step,
        state.confirmedFields,
      );
      if (saved) {
        persistedFingerprint.current = draftFingerprint(
          state.data,
          state.step,
          state.confirmedFields,
        );
        unsavedChanges.current = false;
      }
      return saved;
    },
    [],
  );

  // P32-FIX-CORRECTION (F-01): synchronously drop the pending debounced
  // autosave. Two layers, because clearTimeout alone is not enough:
  //   1. clearTimeout + drop the handle — the normal case;
  //   2. bump the generation — the callback re-checks it before writing, so a
  //      timer that was already handed to the task queue still cannot write.
  const cancelPendingAutosave = useCallback(() => {
    autosaveGeneration.current += 1;
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
  }, []);

  // P32-1 + P32-3: after a successful finalize the draft is intentionally gone.
  // Cancelling the pending autosave and marking the current state as settled
  // keeps both the debounce and the unmount flush from resurrecting a draft for
  // an already finalized resume, and keeps the unload guard silent during the
  // navigation to the preview.
  const markDraftSettled = useCallback(() => {
    cancelPendingAutosave();
    const state = latest.current;
    // P33-F-14: fingerprint the SAME snapshot the autosave gate uses, otherwise
    // a post-finalize comparison could still see a difference and re-fire a
    // write against a draft that was intentionally removed.
    persistedFingerprint.current = draftFingerprint(
      state.persistedData,
      state.step,
      state.confirmedFields,
    );
    unsavedChanges.current = false;
  }, [cancelPendingAutosave]);

  // P14-F2: persistence errors (QuotaExceeded/SecurityError) are visible —
  // draft is reported as saved only after a successful write (P10.6 F1).
  const saveDraft = useCallback(() => {
    // P33-F-14: the draft carries the raw editor buffers too, so the explicit
    // save cannot drop what the user has typed but not yet blurred.
    if (!writeDraft(draftContext, { data: persistedData, step, confirmedFields })) {
      setSaveError(
        "Не удалось сохранить черновик. Проверьте свободное место в браузере и попробуйте снова — данные формы не потеряны.",
      );
      return;
    }
    setSaveError("");
    setDraftSaved(true);
    draftSavedTimer.current = setTimeout(() => setDraftSaved(false), 2000);
  }, [writeDraft, draftContext, persistedData, step, confirmedFields]);

  // P32-1: debounced autosave. Writes the draft envelope (data + step +
  // confirmedFields) after the user stops typing, so navigating away or
  // reloading cannot lose the wizard. It never creates a resume, a version or
  // an analysis — only draft state.
useEffect(() => {
    if (!booted) return;
    // P33-F-14: gate on the derived draft snapshot, not on canonical `data`.
    // Typing in the P33-F-01 raw buffers changes `persistedData` (and nothing
    // else), so this is what makes the debounce restart while the user types —
    // the rendered inputs keep reading the raw buffers and stay untouched.
    const fingerprint = draftFingerprint(persistedData, step, confirmedFields);
    if (fingerprint === persistedFingerprint.current) {
      unsavedChanges.current = false;
      return;
    }
    unsavedChanges.current = true;
    // Every schedule is a new generation: an older queued callback sees a
    // mismatch and returns without writing.
    const generation = ++autosaveGeneration.current;
    const timer = setTimeout(() => {
      autosaveTimer.current = null;
      // P32-FIX-CORRECTION: the wizard may have been finalized (or discarded)
      // between scheduling and firing. A cleared timer cannot be un-queued, so the
      // state is re-validated here before touching storage.
      if (generation !== autosaveGeneration.current) return;
      // Failures stay silent here on purpose: the explicit "Сохранить
      // черновик" button and the unload guard keep P14-F2's visible-error
      // contract for the user-driven save.
      writeDraft(draftContext, { data: persistedData, step, confirmedFields });
    }, DRAFT_AUTOSAVE_DEBOUNCE_MS);
    autosaveTimer.current = timer;
    return () => {
      clearTimeout(timer);
      if (autosaveTimer.current === timer) autosaveTimer.current = null;
    };
  }, [booted, persistedData, step, confirmedFields, draftContext, writeDraft]);

  // P32-1: client-side navigation unmounts this page without firing
  // beforeunload — flush the pending draft there so the data is already safe.
  useEffect(() => {
    return () => {
      if (!unsavedChanges.current) return;
      const state = latest.current;
      // P33-F-14: pass the draft snapshot explicitly. `state` also carries the
      // canonical `data` key, which no longer holds the raw buffers — handing the
      // whole object over would silently persist the pre-blur canonical arrays
      // and lose the text typed inside the debounce window.
      writeDraft(state.draftContext, {
        data: state.persistedData,
        step: state.step,
        confirmedFields: state.confirmedFields,
      });
    };
  }, [writeDraft]);

  // P32-1: reload / tab close. A reload destroys the JS context WITHOUT running
  // React cleanup, so the debounced write can still be pending. The handler
  // flushes it synchronously and asks the user to confirm only when that write
  // actually fails — no intrusive dialog once the draft is safe, and none after
  // a successful finalize (nothing is pending then).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!unsavedChanges.current) return;
      const state = latest.current;
      // P33-F-14: same reason as the unmount flush — the draft snapshot, not the
      // canonical `data`, is what must survive a reload/tab close.
      const saved = writeDraft(state.draftContext, {
        data: state.persistedData,
        step: state.step,
        confirmedFields: state.confirmedFields,
      });
      if (saved) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.onbeforeunload = handleBeforeUnload;
    return () => {
      window.onbeforeunload = null;
    };
  }, [writeDraft]);

  const updateField = useCallback(
    (field: keyof WizardData, value: string) => {
      // P32-4: typing preserves the user's characters (including the space
      // they just typed); control characters are still stripped.
      const clean = sanitizeTextInput(value);
      const previous = latest.current.data[field];
      if (typeof previous === "string") {
        setConfirmedFields((prev) =>
          invalidateConfirmation(prev, field, previous, clean),
        );
      }
      setData((prev) => ({ ...prev, [field]: clean }));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    },
    [],
  );

  // P32-4: canonical value on blur — the trimming sanitizeText used to do on
  // every keystroke happens once, when the user leaves the field.
  const commitField = useCallback(
    (field: keyof WizardData) => {
      const current = latest.current.data[field];
      if (typeof current !== "string") return;
      const canonical = sanitizeText(current);
      if (canonical === current) return;
      updateField(field, canonical);
    },
    [updateField],
  );

  // P32-6: drop the creation draft and start from a blank wizard. Only the
  // DRAFT_CONTEXT_NEW key is touched — an edit draft of an existing resume
  // lives under resume-draft:<id> and must survive.
  const discardNewDraft = useCallback(() => {
    const confirmed = window.confirm(
      "Удалить сохранённый черновик?\n\nВведённые данные будут потеряны.",
    );
    if (!confirmed) return;
    discardDraft(draftStore, DRAFT_CONTEXT_NEW);
    const blank = createDefaultWizardData();
    setData(blank);
    setStep(1);
    setConfirmedFields(new Set<string>());
    setErrors({});
    setSaveError("");
    setRestoredDraft(null);
    persistedFingerprint.current = draftFingerprint(blank, 1, new Set<string>());
    unsavedChanges.current = false;
  }, []);

  const goNext = useCallback(() => {
    const result = validateWizardStep(step, data);
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSaveError("");
    if (step < TOTAL_STEPS) {
      setStep((step + 1) as WizardStep);
      window.scrollTo(0, 0);
    }
  }, [step, data]);

  const goBack = useCallback(() => {
    if (step > 1) {
      setErrors({});
      setStep((step - 1) as WizardStep);
      window.scrollTo(0, 0);
    }
  }, [step]);

  const confirmField = useCallback((path: string) => {
    setConfirmedFields((prev) => new Set(prev).add(path));
  }, []);

  const handleFinalize = useCallback(() => {
    // P32-3: the guard lives in the handler, not only in `disabled`. Two or
    // three fast clicks used to run the whole finalize twice/thrice and create
    // duplicate resumes; the ref flips synchronously, before React re-renders.
    if (finalizeStarted.current) return;
    const check = canFinalize(data, confirmedFields);
    if (!check.allowed) return;

    finalizeStarted.current = true;
    setFinalizing(true);

    // P10.6 F1: persistence errors (QuotaExceeded/SecurityError) обязаны быть
    // видимыми пользователю, а не молча обрывать flow. Navigation — только
    // после успешного сохранения; существующая семантика save* не меняется.
    try {
      if (editMode && currentResumeId) {
        const existing = getResumeRecord(currentResumeId);
        if (existing) {
          createNewVersion(data, existing, confirmedFields);
          // Settle FIRST (cancels the pending autosave), then drop the draft:
          // a timer firing between the two must not be able to recreate it.
          markDraftSettled();
          draftStore.remove(draftKeyFor(currentResumeId));
          router.push(`/resume/${currentResumeId}/preview`);
          return;
        }
      }

      const { record } = finalizeResume(data, confirmedFields);
      markDraftSettled();
      draftStore.remove(draftKeyFor(DRAFT_CONTEXT_NEW));
      router.push(`/resume/${record.id}/preview`);
    } catch {
      finalizeStarted.current = false;
      setFinalizing(false);
      setSaveError(
        "Не удалось сохранить резюме. Проверьте свободное место в браузере и попробуйте снова — данные формы не потеряны.",
      );
    }
  }, [data, confirmedFields, router, editMode, currentResumeId, markDraftSettled]);

  // ---------- Work experience helpers ----------
  const addWork = useCallback(() => {
    setData((prev) => ({
      ...prev,
      workExperience: [...prev.workExperience, createEmptyWorkExperience()],
    }));
  }, []);

  const updateWork = useCallback(
    (id: string, field: keyof WorkExperience, value: string | boolean | null | string[]) => {
      setData((prev) => ({
        ...prev,
        workExperience: prev.workExperience.map((w) =>
          w.id === id ? { ...w, [field]: value } : w,
        ),
      }));
    },
    [],
  );

  const removeWork = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      workExperience: prev.workExperience.filter((w) => w.id !== id),
    }));
  }, []);

  // ---------- Education helpers ----------
  const addEdu = useCallback(() => {
    setData((prev) => ({
      ...prev,
      education: [...prev.education, createEmptyEducation()],
    }));
  }, []);

  const updateEdu = useCallback(
    (id: string, field: keyof Education, value: string | boolean | null | undefined) => {
      setData((prev) => ({
        ...prev,
        education: prev.education.map((e) =>
          e.id === id ? { ...e, [field]: value } : e,
        ),
      }));
    },
    [],
  );

  const removeEdu = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      education: prev.education.filter((e) => e.id !== id),
    }));
  }, []);

  // ---------- Skill helpers ----------
  const [skillInput, setSkillInput] = useState("");

  const addSkill = useCallback(() => {
    const name = sanitizeText(skillInput).trim();
    if (!name) return;
    const exists = data.skills.some(
      (s) => s.name.toLowerCase() === name.toLowerCase(),
    );
    if (exists) return;
    setData((prev) => ({
      ...prev,
      skills: [...prev.skills, { name }],
    }));
    setSkillInput("");
  }, [skillInput, data.skills]);

  const removeSkill = useCallback((name: string) => {
    setData((prev) => ({
      ...prev,
      skills: prev.skills.filter((s) => s.name !== name),
    }));
  }, []);

  // P9.2: change the level of exactly one skill, preserving order/other fields.
  // P16-1: choosing a valid level clears that skill's validation error immediately.
  const updateSkillLevel = useCallback((name: string, level: string) => {
    const normalized = normalizeSkillLevel(level);
    setData((prev) => ({
      ...prev,
      skills: prev.skills.map((s) =>
        s.name === name
          ? { ...s, ...(normalized ? { level: normalized } : { level: undefined }) }
          : s,
      ),
    }));
    if (normalized) {
      setErrors((prev) => {
        const next = { ...prev };
        const index = data.skills.findIndex((s) => s.name === name);
        if (index !== -1) delete next[`skills[${index}].level`];
        return next;
      });
    }
  }, [data.skills]);

  const stepTitle = WIZARD_STEPS[step - 1]?.title ?? "";
  const factChecks = buildFactChecks(data, confirmedFields);
  const finalizeCheck = canFinalize(data, confirmedFields);

  if (!booted) {
    return <Loading />;
  }

  if (notFound) {
    return (
      <main className="page-wide">
        <div className="stub-section">
          <h1>Резюме не найдено</h1>
          <p>Запрашиваемое резюме не существует или было удалено.</p>
          <Link href="/resume" className="btn btn-primary btn-md">
            К списку резюме
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page-wide">
      <WizardProgress steps={WIZARD_STEPS} current={step} />

      {draftSaved && (
        <div className="wizard-toast">Черновик сохранён</div>
      )}

      {saveError && (
        <div className="wizard-toast" role="alert" style={{ background: "#fee2e2", color: "#b91c1c" }}>
          {saveError}
        </div>
      )}

      {editMode && (
        <div className="wizard-toast" style={{ background: "#e0f2fe", color: "#0369a1" }}>
          Редактирование существующего резюме
        </div>
      )}

      {restoredDraft && !editMode && (
        <div className="wizard-toast" style={{ background: "#fef3c7", color: "#92400e" }}>
          Восстановлен сохранённый черновик (шаг {restoredDraft.step} из {TOTAL_STEPS}).{" "}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={discardNewDraft}
          >
            Начать заново
          </button>
        </div>
      )}

      <WizardLayout
        title={stepTitle}
        stepNumber={step}
        totalSteps={TOTAL_STEPS}
        onBack={goBack}
        onNext={goNext}
        onSaveDraft={saveDraft}
        canGoBack={canGoBackFrom(step)}
        canGoNext={canProceedFrom(step, !isLastStepBlocking())}
        nextLabel={step === 6 ? "Перейти к просмотру →" : undefined}
        isLastStep={step === 8}
        finalizing={finalizing}
        onFinalize={handleFinalize}
      >
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        {step === 5 && renderStep5()}
        {step === 6 && renderStep6()}
        {step === 7 && renderStep7()}
        {step === 8 && renderStep8()}
      </WizardLayout>
    </main>
  );

  function isLastStepBlocking() {
    return !finalizeCheck.allowed;
  }

  function renderStep1() {
    return (
      <div className="wizard-fields">
        <p className="wizard-hint">
          Заполните основную информацию о себе. Поля будут отмечены как
          «Подтверждено» после вашего подтверждения.
        </p>
        <FormField
          label="Имя"
          name="firstName"
          value={data.firstName}
          error={errors.firstName}
          required
          placeholder="Иван"
          onChange={(v) => updateField("firstName", v)}
          onBlur={() => commitField("firstName")}
        />
        <FormField
          label="Фамилия"
          name="lastName"
          value={data.lastName}
          error={errors.lastName}
          required
          placeholder="Иванов"
          onChange={(v) => updateField("lastName", v)}
          onBlur={() => commitField("lastName")}
        />
        <FormField
          label="Отчество"
          name="middleName"
          value={data.middleName}
          placeholder="Иванович (необязательно)"
          onChange={(v) => updateField("middleName", v)}
          onBlur={() => commitField("middleName")}
        />
        <FormField
          label="Город"
          name="city"
          value={data.city}
          error={errors.city}
          required
          placeholder="Москва"
          onChange={(v) => updateField("city", v)}
          onBlur={() => commitField("city")}
        />
        <FormField
          label="Телефон"
          name="phone"
          type="tel"
          value={data.phone}
          error={errors.phone}
          required
          placeholder="+7 (999) 123-45-67"
          onChange={(v) => updateField("phone", v)}
          onBlur={() => commitField("phone")}
          onConfirm={() => confirmField("phone")}
          confirmationLevel={
            confirmedFields.has("phone")
              ? "confirmed"
              : data.phone.trim()
                ? "inferred"
                : "missing"
          }
        />
        <FormField
          label="Email"
          name="email"
          type="email"
          value={data.email}
          error={errors.email}
          required
          placeholder="ivan@example.com"
          onChange={(v) => updateField("email", v)}
          onBlur={() => commitField("email")}
          onConfirm={() => confirmField("email")}
          confirmationLevel={
            confirmedFields.has("email")
              ? "confirmed"
              : data.email.trim()
                ? "inferred"
                : "missing"
          }
        />
      </div>
    );
  }

  function renderStep2() {
    return (
      <div className="wizard-fields">
        <p className="wizard-hint">
          Укажите должность, на которую вы претендуете.
        </p>
        <FormField
          label="Желаемая должность"
          name="desiredPosition"
          value={data.desiredPosition}
          error={errors.desiredPosition}
          required
          placeholder="Frontend Developer"
          onChange={(v) => updateField("desiredPosition", v)}
          onBlur={() => commitField("desiredPosition")}
          onConfirm={() => confirmField("desiredPosition")}
          confirmationLevel={
            confirmedFields.has("desiredPosition")
              ? "confirmed"
              : data.desiredPosition.trim()
                ? "inferred"
                : "missing"
          }
        />
        <FormField
          label="Ожидаемая зарплата"
          name="desiredSalary"
          value={data.desiredSalary}
          placeholder="от 150 000 ₽ (необязательно)"
          onChange={(v) => updateField("desiredSalary", v)}
          onBlur={() => commitField("desiredSalary")}
        />
        <FormField
          label="Формат работы"
          name="workFormat"
          type="select"
          value={data.workFormat}
          options={WORK_FORMAT_OPTIONS}
          onChange={(v) => updateField("workFormat", v)}
        />
        <FormField
          label="Тип занятости"
          name="employmentType"
          type="select"
          value={data.employmentType}
          options={EMPLOYMENT_OPTIONS}
          onChange={(v) => updateField("employmentType", v)}
        />
      </div>
    );
  }

  function renderStep3() {
    return (
      <div className="wizard-fields">
        <p className="wizard-hint">
          Добавьте места работы. Если achievement пока не заполнены — не
          страшно, мы поможем позже.
        </p>
        {data.workExperience.map((work, index) => (
          <div key={work.id} className="wizard-card">
            <div className="wizard-card-header">
              <strong>Место работы #{index + 1}</strong>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => removeWork(work.id)}
              >
                Удалить
              </button>
            </div>
            <FormField
              label="Компания"
              name={`work-${work.id}-company`}
              value={work.company}
              error={errors[`work[${index}].company`]}
              required
              placeholder="ООО Рога и Копыта"
              onChange={(v) => updateWork(work.id, "company", v)}
            />
            <FormField
              label="Должность"
              name={`work-${work.id}-position`}
              value={work.position}
              error={errors[`work[${index}].position`]}
              required
              placeholder="Developer"
              onChange={(v) => updateWork(work.id, "position", v)}
            />
            <div className="wizard-row">
              <FormField
                label="Дата начала"
                name={`work-${work.id}-start`}
                type="text"
                value={work.startDate}
                error={errors[`work[${index}].dates`]}
                required
                placeholder="MM/YYYY"
                onChange={(v) => updateWork(work.id, "startDate", v)}
              />
              <FormField
                label="Дата окончания"
                name={`work-${work.id}-end`}
                type="text"
                value={work.endDate ?? ""}
                placeholder={work.isCurrent ? "По настоящее время" : "MM/YYYY"}
                disabled={work.isCurrent}
                onChange={(v) =>
                  updateWork(work.id, "endDate", v || null)
                }
              />
            </div>
            <label className="wizard-checkbox">
              <input
                type="checkbox"
                checked={work.isCurrent}
                onChange={(e) => {
                  updateWork(work.id, "isCurrent", e.target.checked);
                  if (e.target.checked) updateWork(work.id, "endDate", null);
                }}
              />
              Работаю здесь сейчас
            </label>
            <FormField
              label="Обязанности"
              name={`work-${work.id}-desc`}
              type="textarea"
              value={work.description}
              placeholder="Что вы делали на этой позиции"
              onChange={(v) => updateWork(work.id, "description", v)}
            />
            <FormField
              label="Достижения"
              name={`work-${work.id}-achievements`}
              type="textarea"
              value={achievementsText[work.id] ?? ""}
              placeholder={"По одному достижению на строку\nНапример: Увеличил продажи на 30%"}
              rows={3}
              onChange={(v) => onAchievementsChange(work.id, v)}
              onBlur={() => commitAchievements(work.id)}
            />
            <div className="wizard-hint-box">
              <p className="wizard-hint-small">
                Достижения — необязательно. Мы поможем сформулировать их
                позже, когда подключим AI-анализ.
              </p>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary btn-md"
          onClick={addWork}
        >
          + Добавить место работы
        </button>
      </div>
    );
  }

  function renderStep4() {
    return (
      <div className="wizard-fields">
        <p className="wizard-hint">
          Добавьте записи об образовании.
        </p>
        {data.education.map((edu, index) => (
          <div key={edu.id} className="wizard-card">
            <div className="wizard-card-header">
              <strong>Образование #{index + 1}</strong>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => removeEdu(edu.id)}
              >
                Удалить
              </button>
            </div>
            <FormField
              label="Учебное заведение"
              name={`edu-${edu.id}-institution`}
              value={edu.institution}
              error={errors[`edu[${index}].institution`]}
              required
              placeholder="МГУ"
              onChange={(v) => updateEdu(edu.id, "institution", v)}
            />
            <FormField
              label="Степень / уровень"
              name={`edu-${edu.id}-degree`}
              value={edu.degree}
              error={errors[`edu[${index}].degree`]}
              required
              placeholder="Бакалавр"
              onChange={(v) => updateEdu(edu.id, "degree", v)}
            />
            <FormField
              label="Уровень образования"
              name={`edu-${edu.id}-level`}
              type="select"
              value={edu.level ?? ""}
              error={errors[`edu[${index}].level`]}
              required
              options={Object.entries(EDUCATION_LEVEL_LABELS).map(([value, label]) => ({ value, label }))}
              onChange={(v) => updateEdu(edu.id, "level", v || undefined)}
            />
            <FormField
              label="Специальность"
              name={`edu-${edu.id}-field`}
              value={edu.field}
              placeholder="Информатика"
              onChange={(v) => updateEdu(edu.id, "field", v)}
            />
            <div className="wizard-row">
              <FormField
                label="Дата начала"
                name={`edu-${edu.id}-start`}
                type="text"
                value={edu.startDate}
                error={errors[`edu[${index}].dates`]}
                required
                placeholder="MM/YYYY"
                onChange={(v) => updateEdu(edu.id, "startDate", v)}
              />
              <FormField
                label="Дата окончания"
                name={`edu-${edu.id}-end`}
                type="text"
                value={edu.endDate ?? ""}
                placeholder={edu.description ? "По настоящее время" : "MM/YYYY"}
                onChange={(v) => updateEdu(edu.id, "endDate", v || null)}
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary btn-md"
          onClick={addEdu}
        >
          + Добавить образование
        </button>
      </div>
    );
  }

  function renderStep5() {
    return (
      <div className="wizard-fields">
        <p className="wizard-hint">
          Добавьте навыки через запятую или по одному.
        </p>
        <div className="skill-input-row">
          <input
            type="text"
            className="form-input"
            placeholder="Введите навык"
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSkill();
              }
            }}
          />
          <button
            type="button"
            className="btn btn-primary btn-md"
            onClick={addSkill}
          >
            Добавить
          </button>
        </div>
        {data.skills.length > 0 && (
          <div className="skill-list">
            {data.skills.map((skill, index) => (
              <span key={skill.name} className="skill-tag">
                {skill.name}
                <select
                  className={`form-input skill-level-select ${
                    errors[`skills[${index}].level`] ? "skill-level-error" : ""
                  }`}
                  value={normalizeSkillLevel(skill.level) ?? ""}
                  onChange={(e) => updateSkillLevel(skill.name, e.target.value)}
                  aria-label={`Уровень: ${skill.name}`}
                >
                  <option value="">— уровень —</option>
                  {Object.entries(SKILL_LEVEL_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="skill-remove"
                  onClick={() => removeSkill(skill.name)}
                  aria-label={`Удалить ${skill.name}`}
                >
                  ×
                </button>
                {errors[`skills[${index}].level`] && (
                  <span className="skill-level-error-text" role="alert">
                    {errors[`skills[${index}].level`]}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
        {Object.keys(errors).some((k) => k.startsWith("skills[")) && (
          <p className="form-error">
            У каждого навыка должен быть указан уровень — выберите его в списке рядом с навыком.
          </p>
        )}
      </div>
    );
  }

  function renderStep6() {
    return (
      <div className="wizard-fields">
        <p className="wizard-hint">
          Дополнительная информация: кратко о себе и языки.
        </p>
        <FormField
          label="О себе"
          name="summary"
          type="textarea"
          value={data.summary}
          placeholder="Кратко расскажите о вашем опыте и целях (необязательно)"
          rows={4}
          onChange={(v) => updateField("summary", v)}
          onBlur={() => commitField("summary")}
        />
        <FormField
          label="Языки"
          name="languages"
          value={languagesText}
          placeholder="Русский, Английский (через запятую)"
          onChange={onLanguagesChange}
          onBlur={commitLanguages}
        />
      </div>
    );
  }

  function renderStep7() {
    return (
      <div className="preview-section">
        <h3>Предварительный просмотр резюме</h3>

        {/* P32-2: the fact-check gate no longer stops the flow here — the next
            step is where unconfirmed fields are listed and explained. */}
        <p className="wizard-hint">
          Проверка фактов и создание резюме — на следующем шаге. Там будут
          перечислены поля, которые нужно подтвердить.
        </p>

        <div className="preview-block">
          <h4>Личные данные</h4>
          <p>
            <strong>{data.firstName} {data.lastName}</strong>
            {data.middleName && ` ${data.middleName}`}
          </p>
          <p>
            {data.city && `${data.city}`}
            {data.phone && ` · ${data.phone}`}
            {data.email && ` · ${data.email}`}
          </p>
        </div>

        {data.desiredPosition && (
          <div className="preview-block">
            <h4>Желаемая должность</h4>
            <p>{data.desiredPosition}</p>
            {data.desiredSalary && <p>Ожидаемая зарплата: {data.desiredSalary}</p>}
          </div>
        )}

        {data.workExperience.length > 0 && (
          <div className="preview-block">
            <h4>Опыт работы</h4>
            {data.workExperience.map((w) => (
              <div key={w.id} className="preview-item">
                <p>
                  <strong>{w.position || "(должность не указана)"}</strong>
                  {" — "}
                  {w.company || "(компания не указана)"}
                </p>
                <p className="preview-dates">
                  {w.startDate}
                  {w.endDate ? ` — ${w.endDate}` : w.isCurrent ? " — по настоящее время" : ""}
                </p>
                {w.description && <p>{w.description}</p>}
                {w.achievements.length > 0 && (
                  <div className="preview-achievements">
                    <p>Достижения:</p>
                    <ul className="resume-exp-achievements">
                      {w.achievements.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {data.education.length > 0 && (
          <div className="preview-block">
            <h4>Образование</h4>
            {data.education.map((e) => (
              <div key={e.id} className="preview-item">
                <p>
                  <strong>{e.degree || "(степень не указана)"}</strong>
                  {e.field ? `, ${e.field}` : ""}
                </p>
                {educationLevelLabel(e.level) && <p>{educationLevelLabel(e.level)}</p>}
                <p>{e.institution || "(учреждение не указано)"}</p>
                <p className="preview-dates">
                  {e.startDate}
                  {e.endDate ? ` — ${e.endDate}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}

        {data.skills.length > 0 && (
          <div className="preview-block">
            <h4>Навыки</h4>
            <div className="skill-list">
              {data.skills.map((s) => (
                <span key={s.name} className="skill-tag">
                {s.name}{skillLevelLabel(s.level) ? ` — ${skillLevelLabel(s.level)}` : ""}
              </span>
              ))}
            </div>
          </div>
        )}

        {data.summary && (
          <div className="preview-block">
            <h4>О себе</h4>
            <p>{data.summary}</p>
          </div>
        )}

        {data.languages.length > 0 && (
          <div className="preview-block">
            <h4>Языки</h4>
            <p>{data.languages.join(", ")}</p>
          </div>
        )}
      </div>
    );
  }

  function renderStep8() {
    return (
      <div className="factcheck-section">
        <h3>Проверьте факты</h3>
        <p className="wizard-hint">
          Перед созданием резюме убедитесь, что обязательные данные
          подтверждены. Вернитесь к нужному шагу, чтобы исправить.
        </p>

        <div className="factcheck-list">
          {factChecks.map((check) => (
            <div
              key={check.fieldPath}
              className={`factcheck-item factcheck-${check.level}`}
            >
              <span className="factcheck-icon">
                {check.level === "confirmed" && "✓"}
                {check.level === "missing" && "○"}
              </span>
              <span className="factcheck-label">
                {check.label}
                {check.isRequired && (
                  <span className="form-required"> *</span>
                )}
              </span>
              <span className="factcheck-value">
                {check.value || "(пусто)"}
              </span>
              <span className={`factcheck-status status-${check.level}`}>
                {check.level === "confirmed" && "Подтверждено"}
                {check.level === "missing" && "Требует подтверждения"}
              </span>
            </div>
          ))}
        </div>

        {!finalizeCheck.allowed && (
          <div className="factcheck-warning">
            <p>
              Для создания резюме необходимо подтвердить обязательные поля:
            </p>
            <ul>
              {finalizeCheck.blockingFields.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }
}
