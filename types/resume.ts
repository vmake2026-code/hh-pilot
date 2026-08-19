import type { Confident } from "./confirmation";

interface WorkExperience {
  id: string;
  company: string;
  position: string;
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
  description: string;
  achievements: string[];
}

interface Education {
  id: string;
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string | null;
  description: string;
}

interface Skill {
  name: string;
  level?: "beginner" | "intermediate" | "advanced" | "expert";
  category?: string;
}

interface Resume {
  id: string;
  candidateId: string;
  title: string;
  desiredPosition: Confident<string>;
  summary: Confident<string>;
  salaryExpectation: Confident<string>;
  location: Confident<string>;
  workExperience: WorkExperience[];
  education: Education[];
  skills: Skill[];
  languages: string[];
  workFormat?: string;
  employmentType?: string;
  currentVersionId: string;
  createdAt: string;
  updatedAt: string;
}

interface ResumeVersion {
  id: string;
  resumeId: string;
  versionNumber: number;
  data: {
    desiredPosition: Confident<string>;
    summary: Confident<string>;
    salaryExpectation: Confident<string>;
    location: Confident<string>;
    workExperience: WorkExperience[];
    education: Education[];
    skills: Skill[];
    languages: string[];
    workFormat: string;
    employmentType: string;
  };
  label?: string;
  createdAt: string;
}

/** Plain-string candidate info (no Confident wrappers) for persistence. */
interface CandidateInfo {
  firstName: string;
  lastName: string;
  middleName: string;
  email: string;
  phone: string;
  city: string;
}

/** Full resume record stored in persistence — wraps Resume + candidate data + versions. */
interface ResumeRecord {
  id: string;
  resume: Resume;
  versions: ResumeVersion[];
  candidateInfo: CandidateInfo;
  workFormat: string;
  employmentType: string;
  confirmedFields: string[];
  createdAt: string;
  updatedAt: string;
}

export type {
  WorkExperience,
  Education,
  Skill,
  Resume,
  ResumeVersion,
  CandidateInfo,
  ResumeRecord,
};
