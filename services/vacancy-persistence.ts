import type { Vacancy } from "../types/vacancy";
import type { PersistenceStore } from "../lib/persistence";
import { createPersistenceStore } from "../lib/persistence";

const VACANCY_PREFIX = "vac:";
const LIST_KEY = "vacancy-list";

const store: PersistenceStore<Vacancy> = createPersistenceStore<Vacancy>();
const listStore: PersistenceStore<string[]> = createPersistenceStore<string[]>();

// P10.6 F2: persisted vacancy может прийти из localStorage повреждённым или
// со структурой старой версии — слепой cast приводил к render-crash на страницах
// (vacancies/[vacancyId] рендерит requirements/responsibilities/skills напрямую).
// Минимальный shape-guard: пропускаем только записи с критическими полями,
// повреждённые — null/пропуск в списке, валидные — без изменений (no rewriting).
function isValidVacancy(value: unknown): value is Vacancy {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    typeof v.company === "string" &&
    typeof v.description === "string" &&
    typeof v.location === "string" &&
    typeof v.source === "string" &&
    typeof v.fetchedAt === "string" &&
    Array.isArray(v.requirements) &&
    Array.isArray(v.skills) &&
    Array.isArray(v.responsibilities)
  );
}

function readVacancy(key: string): Vacancy | null {
  const raw = store.get(key);
  return isValidVacancy(raw) ? raw : null;
}

function saveVacancy(vacancy: Vacancy): void {
  store.set(VACANCY_PREFIX + vacancy.id, vacancy);
  const ids = listStore.get(LIST_KEY) ?? [];
  if (!ids.includes(vacancy.id)) {
    listStore.set(LIST_KEY, [...ids, vacancy.id]);
  }
}

function getVacancy(id: string): Vacancy | null {
  return readVacancy(VACANCY_PREFIX + id);
}

function listVacancies(): Vacancy[] {
  const ids = listStore.get(LIST_KEY) ?? [];
  // Одна повреждённая запись не должна ломать весь список (P10.6 F2):
  // валидные отображаются, повреждённые безопасно пропускаются.
  return ids
    .map((id) => readVacancy(VACANCY_PREFIX + id))
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
