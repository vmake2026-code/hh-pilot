import type { Resume, ResumeVersion } from "../types/resume";
import type { CandidateProfile } from "../types/candidate";
import type { Vacancy } from "../types/vacancy";
import type { ResumeAnalysis } from "../types/analysis";
import { confirmField, missingField } from "../types/confirmation";
import { generateId } from "../lib/ids";

interface ResumeEngine {
  createBlank(candidateProfile: CandidateProfile): Resume;
  importResume(content: string, format: "text" | "pdf" | "docx"): Promise<Resume>;
  normalizeResume(resume: Resume): Resume;
  createVersion(resume: Resume, changes: Partial<ResumeVersion["data"]>, versionNumber?: number): ResumeVersion;
  analyzeResume(resume: Resume, vacancy?: Vacancy): Promise<ResumeAnalysis>;
  adaptToVacancy(resume: Resume, vacancy: Vacancy): Promise<Resume>;
}

function getFieldValue<T>(v: { value: T } | undefined): T | undefined {
  return v?.value;
}

class MockResumeEngine implements ResumeEngine {
  createBlank(candidate: CandidateProfile): Resume {
    const now = new Date().toISOString();
    return {
      id: generateId(),
      candidateId: candidate.id,
      title: getFieldValue(candidate.desiredPosition) ?? "Новое резюме",
      desiredPosition: candidate.desiredPosition,
      summary: missingField(),
      salaryExpectation: candidate.salaryExpectation,
      location: candidate.city,
      workExperience: [],
      education: [],
      skills: [],
      languages: [],
      currentVersionId: "",
      createdAt: now,
      updatedAt: now,
    };
  }

  async importResume(content: string, format: "text" | "pdf" | "docx"): Promise<Resume> {
    void format;
    const now = new Date().toISOString();
    return {
      id: generateId(),
      candidateId: generateId(),
      title: "Импортированное резюме",
      desiredPosition: confirmField("Не указано"),
      summary: confirmField(content.slice(0, 300)),
      salaryExpectation: missingField(),
      location: missingField(),
      workExperience: [],
      education: [],
      skills: [],
      languages: [],
      currentVersionId: "",
      createdAt: now,
      updatedAt: now,
    };
  }

  normalizeResume(resume: Resume): Resume {
    return { ...resume, updatedAt: new Date().toISOString() };
  }

  createVersion(
    resume: Resume,
    changes: Partial<ResumeVersion["data"]>,
    versionNumber: number = 1,
  ): ResumeVersion {
    return {
      id: generateId(),
      resumeId: resume.id,
      versionNumber,
      data: {
        desiredPosition: resume.desiredPosition,
        summary: resume.summary,
        salaryExpectation: resume.salaryExpectation,
        location: resume.location,
        workExperience: resume.workExperience,
        education: resume.education,
        skills: resume.skills,
        languages: resume.languages,
        workFormat: resume.workFormat ?? "",
        employmentType: resume.employmentType ?? "",
        ...changes,
      },
      createdAt: new Date().toISOString(),
    };
  }

  async analyzeResume(
    resume: Resume,
    _vacancy?: Vacancy,
  ): Promise<ResumeAnalysis> {
    return {
      id: generateId(),
      resumeId: resume.id,
      overallScore: 70,
      sections: [],
      summary: "Mock-анализ: резюме требует доработки",
      strengths: [],
      weaknesses: [],
      createdAt: new Date().toISOString(),
    };
  }

  async adaptToVacancy(resume: Resume, _vacancy: Vacancy): Promise<Resume> {
    return { ...resume, updatedAt: new Date().toISOString() };
  }
}

function createResumeEngine(): ResumeEngine {
  return new MockResumeEngine();
}

export type { ResumeEngine };
export { MockResumeEngine, createResumeEngine };
