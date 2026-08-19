import type { ResumeRecord } from "../types/resume";
import type { PersistenceStore } from "../lib/persistence";
import { createPersistenceStore } from "../lib/persistence";

const RECORD_PREFIX = "rr:";
const LIST_KEY = "resume-list";

const store: PersistenceStore<ResumeRecord> = createPersistenceStore<ResumeRecord>();
const listStore: PersistenceStore<string[]> = createPersistenceStore<string[]>();

function saveResumeRecord(record: ResumeRecord): void {
  store.set(RECORD_PREFIX + record.id, record);
  const ids = listStore.get(LIST_KEY) ?? [];
  if (!ids.includes(record.id)) {
    listStore.set(LIST_KEY, [...ids, record.id]);
  }
}

function getResumeRecord(id: string): ResumeRecord | null {
  return store.get(RECORD_PREFIX + id);
}

function listResumeRecords(): ResumeRecord[] {
  const ids = listStore.get(LIST_KEY) ?? [];
  return ids
    .map((id) => store.get(RECORD_PREFIX + id))
    .filter((r): r is ResumeRecord => r !== null);
}

function deleteResumeRecord(id: string): void {
  store.remove(RECORD_PREFIX + id);
  const ids = listStore.get(LIST_KEY) ?? [];
  listStore.set(
    LIST_KEY,
    ids.filter((i) => i !== id),
  );
}

export { saveResumeRecord, getResumeRecord, listResumeRecords, deleteResumeRecord };
