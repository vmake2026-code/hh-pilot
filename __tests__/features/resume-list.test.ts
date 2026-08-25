import { describe, it, expect } from "vitest";
import { buildResumeListItems } from "../../features/resume-list";
import type { ResumeRecord } from "../../types/resume";
import { confirmField, missingField } from "../../types/confirmation";

const NOW = "2026-01-01T00:00:00Z";

function makeRecord(
  id: string,
  overrides: Partial<ResumeRecord> = {},
): ResumeRecord {
  const base: ResumeRecord = {
    id,
    resume: {
      id,
      candidateId: `cand-${id}`,
      title: `Resume ${id}`,
      desiredPosition: confirmField("Dev"),
      summary: missingField(),
      salaryExpectation: missingField(),
      location: confirmField("Moscow"),
      workExperience: [],
      education: [],
      skills: [],
      languages: [],
      currentVersionId: `v1-${id}`,
      createdAt: NOW,
      updatedAt: NOW,
    },
    versions: [
      {
        id: `v1-${id}`,
        resumeId: id,
        versionNumber: 1,
        data: {
          desiredPosition: confirmField("Dev"),
          summary: missingField(),
          salaryExpectation: missingField(),
          location: confirmField("Moscow"),
          workExperience: [],
          education: [],
          skills: [],
          languages: [],
          workFormat: "remote",
          employmentType: "full_time",
        },
        createdAt: NOW,
      },
    ],
    candidateInfo: {
      firstName: "Ivan",
      lastName: "Ivanov",
      middleName: "",
      email: "ivan@test.com",
      phone: "+79001234567",
      city: "Moscow",
    },
    workFormat: "remote",
    employmentType: "full_time",
    confirmedFields: ["firstName"],
    createdAt: NOW,
    updatedAt: NOW,
  };

  return {
    ...base,
    ...overrides,
    resume: { ...base.resume, ...(overrides.resume ?? {}) },
  };
}

describe("buildResumeListItems", () => {
  it("empty store produces an empty list", () => {
    expect(buildResumeListItems([])).toEqual([]);
  });

  it("maps records preserving resume IDs in order", () => {
    const items = buildResumeListItems([
      makeRecord("id-a"),
      makeRecord("id-b"),
    ]);
    expect(items.map((i) => i.id)).toEqual(["id-a", "id-b"]);
  });

  it("uses the record title", () => {
    const items = buildResumeListItems([makeRecord("id-a")]);
    expect(items[0].title).toBe("Resume id-a");
  });

  it("takes versionNumber from the current version", () => {
    const record = makeRecord("id-a");
    record.versions.push({
      id: "v2-id-a",
      resumeId: "id-a",
      versionNumber: 2,
      data: record.versions[0].data,
      createdAt: NOW,
    });
    record.resume.currentVersionId = "v2-id-a";

    const items = buildResumeListItems([record]);
    expect(items[0].versionNumber).toBe(2);
  });

  it("falls back to the last version when currentVersionId is not found", () => {
    const record = makeRecord("id-a");
    record.resume.currentVersionId = "missing-version";

    const items = buildResumeListItems([record]);
    expect(items[0].versionNumber).toBe(1);
  });

  it("returns null versionNumber when no versions exist", () => {
    const record = makeRecord("id-a", { versions: [] });
    const items = buildResumeListItems([record]);
    expect(items[0].versionNumber).toBeNull();
  });
});
