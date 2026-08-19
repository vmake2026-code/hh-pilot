import type { Vacancy } from "../types/vacancy";
import type { PersistenceStore } from "../lib/persistence";
import { createPersistenceStore } from "../lib/persistence";

const VACANCY_PREFIX = "vac:";
const LIST_KEY = "vacancy-list";

const store: PersistenceStore<Vacancy> = createPersistenceStore<Vacancy>();
const listStore: PersistenceStore<string[]> = createPersistenceStore<string[]>();

function saveVacancy(vacancy: Vacancy): void {
  store.set(VACANCY_PREFIX + vacancy.id, vacancy);
  const ids = listStore.get(LIST_KEY) ?? [];
  if (!ids.includes(vacancy.id)) {
    listStore.set(LIST_KEY, [...ids, vacancy.id]);
  }
}

function getVacancy(id: string): Vacancy | null {
  return store.get(VACANCY_PREFIX + id);
}

function listVacancies(): Vacancy[] {
  const ids = listStore.get(LIST_KEY) ?? [];
  return ids
    .map((id) => store.get(VACANCY_PREFIX + id))
    .filter((v): v is Vacancy => v !== null);
}

function deleteVacancy(id: string): void {
  store.remove(VACANCY_PREFIX + id);
  const ids = listStore.get(LIST_KEY) ?? [];
  listStore.set(
    LIST_KEY,
    ids.filter((i) => i !== id),
  );
}

export { saveVacancy, getVacancy, listVacancies, deleteVacancy };
