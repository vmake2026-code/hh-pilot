import { describe, it, expect, vi } from "vitest";
import {
  createDefaultWizardData,
  finalizeResume,
  resumeRecordToWizardData,
  createNewVersion,
  canFinalize,
  type WizardData,
} from "../../features/resume-wizard";

function makeValidWizardData(): WizardData {
  return {
    firstName: "Иван",
    lastName: "Иванов",
    middleName: "Иванович",
    city: "Москва",
    phone: "+79001234567",
    email: "ivan@test.com",
    desiredPosition: "Frontend Developer",
    desiredSalary: "от 200 000 ₽",
    workFormat: "remote",
    employmentType: "full_time",
    workExperience: [
      {
        id: "we-1",
        company: "Яндекс",
        position: "Developer",
        startDate: "2020-01",
        endDate: null,
        isCurrent: true,
        description: "Разработка",
        achievements: [],
      },
    ],
    education: [
      {
        id: "edu-1",
        institution: "МГУ",
        degree: "Бакалавр",
        field: "Информатика",
        startDate: "2016-09",
        endDate: "2020-06",
        description: "",
      },
    ],
    skills: [{ name: "React" }, { name: "TypeScript" }],
    summary: "Опытный разработчик",
    languages: ["Русский", "Английский"],
  };
}

function makeAllConfirmed(): Set<string> {
  return new Set([
    "firstName",
    "lastName",
    "city",
    "phone",
    "email",
    "desiredPosition",
  ]);
}

describe("finalizeResume", () => {
  it("creates ResumeRecord with valid data", () => {
    const data = makeValidWizardData();
    const confirmed = makeAllConfirmed();
    const { record } = finalizeResume(data, confirmed);

    expect(record.id).toBeTruthy();
    expect(record.resume.id).toBe(record.id);
    expect(record.candidateInfo.firstName).toBe("Иван");
    expect(record.candidateInfo.lastName).toBe("Иванов");
    expect(record.candidateInfo.middleName).toBe("Иванович");
    expect(record.candidateInfo.email).toBe("ivan@test.com");
    expect(record.candidateInfo.phone).toBe("+79001234567");
    expect(record.candidateInfo.city).toBe("Москва");
    expect(record.workFormat).toBe("remote");
    expect(record.employmentType).toBe("full_time");
    expect(record.confirmedFields).toEqual(
      expect.arrayContaining([
        "firstName",
        "lastName",
        "city",
        "phone",
        "email",
        "desiredPosition",
      ]),
    );
  });

  it("creates ResumeVersion with versionNumber 1", () => {
    const data = makeValidWizardData();
    const confirmed = makeAllConfirmed();
    const { version } = finalizeResume(data, confirmed);

    expect(version.versionNumber).toBe(1);
    expect(version.resumeId).toBeTruthy();
    expect(version.data.workExperience.length).toBe(1);
    expect(version.data.education.length).toBe(1);
    expect(version.data.skills.length).toBe(2);
    expect(version.data.languages).toEqual(["Русский", "Английский"]);
  });

  it("links version to resume", () => {
    const data = makeValidWizardData();
    const confirmed = makeAllConfirmed();
    const { record, version } = finalizeResume(data, confirmed);

    expect(record.resume.currentVersionId).toBe(version.id);
    expect(record.versions[0].id).toBe(version.id);
  });

  it("sets resume title from desiredPosition", () => {
    const data = makeValidWizardData();
    const confirmed = makeAllConfirmed();
    const { record } = finalizeResume(data, confirmed);

    expect(record.resume.title).toBe("Frontend Developer");
  });

  it("converts wizard data to Confident types", () => {
    const data = makeValidWizardData();
    const confirmed = makeAllConfirmed();
    const { record } = finalizeResume(data, confirmed);

    expect(record.resume.desiredPosition.level).toBe("confirmed");
    expect(record.resume.desiredPosition.value).toBe("Frontend Developer");
  });

  it("includes workFormat and employmentType in ResumeVersion.data", () => {
    const data = makeValidWizardData();
    const confirmed = makeAllConfirmed();
    const { version } = finalizeResume(data, confirmed);

    expect(version.data.workFormat).toBe("remote");
    expect(version.data.employmentType).toBe("full_time");
  });

  it("preserves workFormat/employmentType in ResumeRecord", () => {
    const data = makeValidWizardData();
    const confirmed = makeAllConfirmed();
    const { record } = finalizeResume(data, confirmed);

    expect(record.workFormat).toBe("remote");
    expect(record.employmentType).toBe("full_time");
  });
});

describe("createNewVersion", () => {
  it("creates version 2 from existing record", () => {
    const data = makeValidWizardData();
    const confirmed = makeAllConfirmed();
    const { record } = finalizeResume(data, confirmed);

    const updatedData = { ...data, desiredPosition: "Backend Developer" };
    const newVersion = createNewVersion(updatedData, record, confirmed);

    expect(newVersion.versionNumber).toBe(2);
    expect(record.versions.length).toBe(2);
    expect(record.resume.currentVersionId).toBe(newVersion.id);
  });

  it("preserves old version", () => {
    const data = makeValidWizardData();
    const confirmed = makeAllConfirmed();
    const { record } = finalizeResume(data, confirmed);
    const oldVersionId = record.versions[0].id;

    createNewVersion({ ...data, desiredPosition: "New" }, record, confirmed);

    expect(record.versions[0].id).toBe(oldVersionId);
    expect(record.versions[0].versionNumber).toBe(1);
  });

  it("updates updatedAt", () => {
    const data = makeValidWizardData();
    const confirmed = makeAllConfirmed();
    const { record } = finalizeResume(data, confirmed);
    const oldUpdatedAt = record.updatedAt;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 1000));
    createNewVersion(data, record, confirmed);
    vi.useRealTimers();

    expect(record.updatedAt).not.toBe(oldUpdatedAt);
  });

  it("preserves workFormat/employmentType in new version", () => {
    const data = makeValidWizardData();
    const confirmed = makeAllConfirmed();
    const { record } = finalizeResume(data, confirmed);

    const updatedData = { ...data, desiredPosition: "Backend Developer" };
    const newVersion = createNewVersion(updatedData, record, confirmed);

    expect(newVersion.data.workFormat).toBe("remote");
    expect(newVersion.data.employmentType).toBe("full_time");
    expect(newVersion.data.desiredPosition.value).toBe("Backend Developer");
  });
});

describe("resumeRecordToWizardData", () => {
  it("restores WizardData from ResumeRecord", () => {
    const data = makeValidWizardData();
    const confirmed = makeAllConfirmed();
    const { record } = finalizeResume(data, confirmed);

    const restored = resumeRecordToWizardData(record);

    expect(restored.firstName).toBe("Иван");
    expect(restored.lastName).toBe("Иванов");
    expect(restored.middleName).toBe("Иванович");
    expect(restored.city).toBe("Москва");
    expect(restored.phone).toBe("+79001234567");
    expect(restored.email).toBe("ivan@test.com");
    expect(restored.desiredPosition).toBe("Frontend Developer");
    expect(restored.desiredSalary).toBe("от 200 000 ₽");
    expect(restored.workExperience.length).toBe(1);
    expect(restored.education.length).toBe(1);
    expect(restored.skills.length).toBe(2);
    expect(restored.summary).toBe("Опытный разработчик");
    expect(restored.languages).toEqual(["Русский", "Английский"]);
  });

  it("restores workFormat and employmentType from ResumeRecord", () => {
    const data = makeValidWizardData();
    const confirmed = makeAllConfirmed();
    const { record } = finalizeResume(data, confirmed);

    const restored = resumeRecordToWizardData(record);

    expect(restored.workFormat).toBe("remote");
    expect(restored.employmentType).toBe("full_time");
  });

  it("edit roundtrip preserves workFormat/employmentType", () => {
    const data = makeValidWizardData();
    const confirmed = makeAllConfirmed();
    const { record } = finalizeResume(data, confirmed);

    const restored = resumeRecordToWizardData(record);
    expect(restored.workFormat).toBe("remote");
    expect(restored.employmentType).toBe("full_time");

    const newVersion = createNewVersion(restored, record, confirmed);
    expect(newVersion.data.workFormat).toBe("remote");
    expect(newVersion.data.employmentType).toBe("full_time");
  });
});

describe("canFinalize", () => {
  it("blocks when required fields missing", () => {
    const data = createDefaultWizardData();
    const result = canFinalize(data, new Set());
    expect(result.allowed).toBe(false);
  });

  it("allows when all required confirmed", () => {
    const data = makeValidWizardData();
    const result = canFinalize(data, makeAllConfirmed());
    expect(result.allowed).toBe(true);
    expect(result.blockingFields.length).toBe(0);
  });
});
