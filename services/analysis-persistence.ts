import type { ResumeAnalysis } from "../types/analysis";
import type { PersistenceStore } from "../lib/persistence";
import { createPersistenceStore } from "../lib/persistence";

const ANALYSIS_PREFIX = "analysis:";
const LIST_KEY = "analysis-list";

const store: PersistenceStore<ResumeAnalysis> = createPersistenceStore<ResumeAnalysis>();
const listStore: PersistenceStore<string[]> = createPersistenceStore<string[]>();

// P10.6 F2: analysis records читаются слепым cast — повреждённая запись ломала
// preview-страницу (overallScore/sections рендерятся сразу). Shape-guard по
// критическим полям; повреждённые — null/пропуск, валидные — без изменений.
function isValidAnalysis(value: unknown): value is ResumeAnalysis {
  if (typeof value !== "object" || value === null) return false;
  const a = value as Record<string, unknown>;
  return (
    typeof a.id === "string" &&
    typeof a.resumeId === "string" &&
    typeof a.versionId === "string" &&
    typeof a.provider === "string" &&
    typeof a.createdAt === "string" &&
    typeof a.summary === "string" &&
    typeof a.overallScore === "number" &&
    Number.isFinite(a.overallScore) &&
    Array.isArray(a.sections) &&
    Array.isArray(a.strengths) &&
    Array.isArray(a.weaknesses)
  );
}

function readAnalysis(key: string): ResumeAnalysis | null {
  const raw = store.get(key);
  return isValidAnalysis(raw) ? raw : null;
}

function saveAnalysis(analysis: ResumeAnalysis): void {
  store.set(ANALYSIS_PREFIX + analysis.id, analysis);
  const ids = listStore.get(LIST_KEY) ?? [];
  if (!ids.includes(analysis.id)) {
    listStore.set(LIST_KEY, [...ids, analysis.id]);
  }
}

function getAnalysis(id: string): ResumeAnalysis | null {
  return readAnalysis(ANALYSIS_PREFIX + id);
}

function listAnalyses(): ResumeAnalysis[] {
  const ids = listStore.get(LIST_KEY) ?? [];
  // P10.6 F2: повреждённая analysis-запись не ломает список на preview.
  return ids
    .map((id) => readAnalysis(ANALYSIS_PREFIX + id))
    .filter((a): a is ResumeAnalysis => a !== null);
}

function listAnalysesForResume(resumeId: string): ResumeAnalysis[] {
  return listAnalyses().filter((a) => a.resumeId === resumeId);
}

/**
 * P14-F3: cascade cleanup when a resume is deleted. Removes exactly the
 * analyses bound to this resumeId — both the records and their list
 * entries. Analyses of other resumes are untouched. Returns the ids of
 * removed analyses so the caller can report or verify the cleanup.
 */
function deleteAnalysesForResume(resumeId: string): string[] {
  const ids = listStore.get(LIST_KEY) ?? [];
  const removed: string[] = [];
  const keptIds: string[] = [];
  for (const id of ids) {
    const raw = store.get(ANALYSIS_PREFIX + id);
    if (isValidAnalysis(raw) && raw.resumeId === resumeId) {
      store.remove(ANALYSIS_PREFIX + id);
      removed.push(id);
    } else {
      keptIds.push(id);
    }
  }
  if (removed.length > 0) {
    listStore.set(LIST_KEY, keptIds);
  }
  return removed;
}

export { saveAnalysis, getAnalysis, listAnalyses, listAnalysesForResume, deleteAnalysesForResume };
