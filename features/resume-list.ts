import type { ResumeRecord, ResumeVersion } from "../types/resume";

interface ResumeListItem {
  id: string;
  title: string;
  versionNumber: number | null;
  updatedAt: string;
}

function getCurrentVersion(record: ResumeRecord): ResumeVersion | undefined {
  return (
    record.versions.find((v) => v.id === record.resume.currentVersionId) ??
    record.versions[record.versions.length - 1]
  );
}

/**
 * Shape persisted resume records for the /resume list view.
 * Pure mapping — keeps the page component free of data-resolution logic.
 */
function buildResumeListItems(records: ResumeRecord[]): ResumeListItem[] {
  return records.map((record) => ({
    id: record.id,
    title: record.resume.title,
    versionNumber: getCurrentVersion(record)?.versionNumber ?? null,
    updatedAt: record.updatedAt || record.resume.updatedAt,
  }));
}

export type { ResumeListItem };
export { buildResumeListItems };
