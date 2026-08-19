import type { MatchRecord } from "../types/match";
import type { PersistenceStore } from "../lib/persistence";
import { createPersistenceStore } from "../lib/persistence";

const MATCH_PREFIX = "mr:";
const LIST_KEY = "match-list";

const store: PersistenceStore<MatchRecord> = createPersistenceStore<MatchRecord>();
const listStore: PersistenceStore<string[]> = createPersistenceStore<string[]>();

function saveMatchRecord(record: MatchRecord): void {
  store.set(MATCH_PREFIX + record.id, record);
  const ids = listStore.get(LIST_KEY) ?? [];
  if (!ids.includes(record.id)) {
    listStore.set(LIST_KEY, [...ids, record.id]);
  }
}

function getMatchRecord(id: string): MatchRecord | null {
  return store.get(MATCH_PREFIX + id);
}

function listMatchRecords(): MatchRecord[] {
  const ids = listStore.get(LIST_KEY) ?? [];
  return ids
    .map((id) => store.get(MATCH_PREFIX + id))
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
