import type { ResumeAnalysis } from "../types/analysis";
import type { PersistenceStore } from "../lib/persistence";
import { createPersistenceStore } from "../lib/persistence";

const ANALYSIS_PREFIX = "analysis:";
const LIST_KEY = "analysis-list";

const store: PersistenceStore<ResumeAnalysis> = createPersistenceStore<ResumeAnalysis>();
const listStore: PersistenceStore<string[]> = createPersistenceStore<string[]>();

function saveAnalysis(analysis: ResumeAnalysis): void {
  store.set(ANALYSIS_PREFIX + analysis.id, analysis);
  const ids = listStore.get(LIST_KEY) ?? [];
  if (!ids.includes(analysis.id)) {
    listStore.set(LIST_KEY, [...ids, analysis.id]);
  }
}

function getAnalysis(id: string): ResumeAnalysis | null {
  return store.get(ANALYSIS_PREFIX + id);
}

function listAnalyses(): ResumeAnalysis[] {
  const ids = listStore.get(LIST_KEY) ?? [];
  return ids
    .map((id) => store.get(ANALYSIS_PREFIX + id))
    .filter((a): a is ResumeAnalysis => a !== null);
}

function listAnalysesForResume(resumeId: string): ResumeAnalysis[] {
  return listAnalyses().filter((a) => a.resumeId === resumeId);
}

export { saveAnalysis, getAnalysis, listAnalyses, listAnalysesForResume };
