import type { ResumeRecord } from "../types/resume";
import type { PersistenceStore } from "../lib/persistence";
import { createPersistenceStore } from "../lib/persistence";

const RECORD_PREFIX = "rr:";
const LIST_KEY = "resume-list";

const store: PersistenceStore<ResumeRecord> = createPersistenceStore<ResumeRecord>();
const listStore: PersistenceStore<string[]> = createPersistenceStore<string[]>();

// P10.6 F2: resume record читается слепым cast — повреждённая/легаси запись
// без versions или resume.currentVersionId ломала render на /resume/[id],
// preview и match-страницах. Shape-guard проверяет поля, которые реально
// рендерятся; валидные записи проходят без изменений (no rewriting),
// повреждённые — null/пропуск в списке вместо TypeError.
function isValidResumeRecord(value: unknown): value is ResumeRecord {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  if (
    typeof r.id !== "string" ||
    typeof r.createdAt !== "string" ||
    typeof r.updatedAt !== "string" ||
    !Array.isArray(r.versions)
  ) {
    return false;
  }
  const resume = r.resume;
  if (typeof resume !== "object" || resume === null) return false;
  const res = resume as Record<string, unknown>;
  if (
    typeof res.id !== "string" ||
    typeof res.title !== "string" ||
    typeof res.currentVersionId !== "string" ||
    typeof res.createdAt !== "string" ||
    typeof res.updatedAt !== "string" ||
    !Array.isArray(res.workExperience) ||
    !Array.isArray(res.education) ||
    !Array.isArray(res.skills) ||
    !Array.isArray(res.languages)
  ) {
    return false;
  }
  const candidateInfo = r.candidateInfo;
  if (typeof candidateInfo !== "object" || candidateInfo === null) return false;
  const cand = candidateInfo as Record<string, unknown>;
  return (
    typeof cand.firstName === "string" &&
    typeof cand.lastName === "string" &&
    typeof cand.middleName === "string" &&
    typeof cand.email === "string" &&
    typeof cand.phone === "string" &&
    typeof cand.city === "string"
  );
}

function readResumeRecord(key: string): ResumeRecord | null {
  const raw = store.get(key);
  return isValidResumeRecord(raw) ? raw : null;
}

function saveResumeRecord(record: ResumeRecord): void {
  store.set(RECORD_PREFIX + record.id, record);
  const ids = listStore.get(LIST_KEY) ?? [];
  if (!ids.includes(record.id)) {
    listStore.set(LIST_KEY, [...ids, record.id]);
  }
}

function getResumeRecord(id: string): ResumeRecord | null {
  return readResumeRecord(RECORD_PREFIX + id);
}

function listResumeRecords(): ResumeRecord[] {
  const ids = listStore.get(LIST_KEY) ?? [];
  // P10.6 F2: одна повреждённая запись не должна ломать весь список резюме.
  return ids
    .map((id) => readResumeRecord(RECORD_PREFIX + id))
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
