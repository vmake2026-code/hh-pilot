import type { MatchRecord } from "../types/match";
import type { PersistenceStore } from "../lib/persistence";
import { createPersistenceStore } from "../lib/persistence";

const MATCH_PREFIX = "mr:";
const LIST_KEY = "match-list";

const store: PersistenceStore<MatchRecord> = createPersistenceStore<MatchRecord>();
const listStore: PersistenceStore<string[]> = createPersistenceStore<string[]>();

// P10.6 F2: persisted match snapshot может быть повреждён/устаревшей формы —
// слепой cast ломал /matches и /matches/[matchId] render. Пропускаем только
// записи с полями, которые реально рендерятся; повреждённые — null/пропуск.
function isValidMatchRecord(value: unknown): value is MatchRecord {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === "string" &&
    typeof m.vacancyId === "string" &&
    typeof m.resumeId === "string" &&
    typeof m.overallScore === "number" &&
    Number.isFinite(m.overallScore) &&
    typeof m.level === "string" &&
    Array.isArray(m.matchedSkills) &&
    Array.isArray(m.missingSkills) &&
    Array.isArray(m.matchedRequirements) &&
    Array.isArray(m.missingRequirements) &&
    Array.isArray(m.risks) &&
    Array.isArray(m.recommendations) &&
    typeof m.vacancyTitle === "string" &&
    typeof m.vacancyCompany === "string" &&
    typeof m.resumeTitle === "string" &&
    typeof m.resumeVersionNumber === "number" &&
    typeof m.createdAt === "string"
  );
}

function readMatchRecord(key: string): MatchRecord | null {
  const raw = store.get(key);
  return isValidMatchRecord(raw) ? raw : null;
}

function saveMatchRecord(record: MatchRecord): void {
  store.set(MATCH_PREFIX + record.id, record);
  const ids = listStore.get(LIST_KEY) ?? [];
  if (!ids.includes(record.id)) {
    listStore.set(LIST_KEY, [...ids, record.id]);
  }
}

function getMatchRecord(id: string): MatchRecord | null {
  return readMatchRecord(MATCH_PREFIX + id);
}

function listMatchRecords(): MatchRecord[] {
  const ids = listStore.get(LIST_KEY) ?? [];
  // P10.6 F2: повреждённая запись не ломает историю сопоставлений целиком.
  return ids
    .map((id) => readMatchRecord(MATCH_PREFIX + id))
    .filter((r): r is MatchRecord => r !== null);
}

function deleteMatchRecord(id: string): void {
  store.remove(MATCH_PREFIX + id);
  const ids = listStore.get(LIST_KEY) ?? [];
  listStore.set(
    LIST_KEY,
    ids.filter((i) => i !== id),
  );
}

export { saveMatchRecord, getMatchRecord, listMatchRecords, deleteMatchRecord };
