import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryStore } from "../../lib/persistence";
import type { ResumeRecord } from "../../types/resume";
import { confirmField, missingField } from "../../types/confirmation";
import {
  saveResumeRecord,
  getResumeRecord,
  listResumeRecords,
  deleteResumeRecord,
} from "../../services/resume-persistence";

// We test persistence through the exported InMemoryStore directly
// to verify the store contract without localStorage dependency.

function makeRecord(id: string): ResumeRecord {
  const now = "2026-01-01T00:00:00Z";
  return {
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
      createdAt: now,
      updatedAt: now,
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
        createdAt: now,
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
    confirmedFields: ["firstName", "lastName", "email", "phone", "city"],
    createdAt: now,
    updatedAt: now,
  };
}

describe("InMemoryStore resume persistence", () => {
  const store = new InMemoryStore<ResumeRecord>();

  beforeEach(() => {
    // Clear all entries
    for (const key of ["rr:r1", "rr:r2", "resume-list"]) {
      store.remove(key);
    }
  });

  it("saves and retrieves a resume record", () => {
    const record = makeRecord("r1");
    store.set("rr:r1", record);
    const retrieved = store.get("rr:r1");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe("r1");
    expect(retrieved!.resume.title).toBe("Resume r1");
    expect(retrieved!.candidateInfo.firstName).toBe("Ivan");
  });

  it("returns null for non-existent record", () => {
    expect(store.get("rr:nonexistent")).toBeNull();
  });

  it("handles multiple records", () => {
    store.set("rr:r1", makeRecord("r1"));
    store.set("rr:r2", makeRecord("r2"));
    expect(store.get("rr:r1")!.id).toBe("r1");
    expect(store.get("rr:r2")!.id).toBe("r2");
  });

  it("removes a record", () => {
    store.set("rr:r1", makeRecord("r1"));
    store.remove("rr:r1");
    expect(store.get("rr:r1")).toBeNull();
  });

  it("preserves version data in record", () => {
    const record = makeRecord("r1");
    store.set("rr:r1", record);
    const retrieved = store.get("rr:r1")!;
    expect(retrieved.versions.length).toBe(1);
    expect(retrieved.versions[0].versionNumber).toBe(1);
    expect(retrieved.versions[0].resumeId).toBe("r1");
  });
});

// ---------- Service API tests ----------

describe("resume-persistence service API", () => {
  beforeEach(() => {
    // Clean up via delete to keep list consistent
    for (const r of listResumeRecords()) {
      deleteResumeRecord(r.id);
    }
  });

  it("saveResumeRecord + getResumeRecord roundtrip", () => {
    const record = makeRecord("svc-1");
    saveResumeRecord(record);
    const found = getResumeRecord("svc-1");
    expect(found).not.toBeNull();
    expect(found!.id).toBe("svc-1");
    expect(found!.resume.title).toBe("Resume svc-1");
  });

  it("getResumeRecord returns null for unknown id", () => {
    expect(getResumeRecord("nonexistent-svc")).toBeNull();
  });

  it("listResumeRecords returns all saved records", () => {
    saveResumeRecord(makeRecord("list-1"));
    saveResumeRecord(makeRecord("list-2"));
    const list = listResumeRecords();
    const ids = list.map((r) => r.id);
    expect(ids).toContain("list-1");
    expect(ids).toContain("list-2");
  });

  it("deleteResumeRecord removes the record", () => {
    saveResumeRecord(makeRecord("del-1"));
    expect(getResumeRecord("del-1")).not.toBeNull();
    deleteResumeRecord("del-1");
    expect(getResumeRecord("del-1")).toBeNull();
  });

  it("deleteResumeRecord does not affect other records", () => {
    saveResumeRecord(makeRecord("del-a"));
    saveResumeRecord(makeRecord("del-b"));
    deleteResumeRecord("del-a");
    expect(getResumeRecord("del-b")).not.toBeNull();
    expect(getResumeRecord("del-a")).toBeNull();
  });

  it("listResumeRecords returns empty after deleting all", () => {
    saveResumeRecord(makeRecord("del-all-1"));
    saveResumeRecord(makeRecord("del-all-2"));
    deleteResumeRecord("del-all-1");
    deleteResumeRecord("del-all-2");
    expect(listResumeRecords().length).toBe(0);
  });

  it("saveResumeRecord is idempotent for list", () => {
    const record = makeRecord("idem-1");
    saveResumeRecord(record);
    saveResumeRecord(record); // save again
    const list = listResumeRecords();
    const matches = list.filter((r) => r.id === "idem-1");
    expect(matches.length).toBe(1);
  });
});
