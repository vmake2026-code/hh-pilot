import type { Confident } from "./confirmation";
import type { WorkExperience, Education, Skill } from "./resume";

type WorkFormat = "remote" | "office" | "hybrid" | "any";
type EmploymentType = "full_time" | "part_time" | "contract" | "freelance";

const WORK_FORMAT_LABELS: Record<WorkFormat, string> = {
  remote: "Удалённо",
  office: "В офисе",
  hybrid: "Гибрид",
  any: "Любой",
};

const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "Полная занятость",
  part_time: "Частичная занятость",
  contract: "Контракт",
  freelance: "Фриланс",
};

interface CandidateProfile {
  id: string;
  firstName: Confident<string>;
  lastName: Confident<string>;
  middleName: Confident<string>;
  email: Confident<string>;
  phone: Confident<string>;
  city: Confident<string>;
  desiredPosition: Confident<string>;
  salaryExpectation: Confident<string>;
  workFormat: Confident<WorkFormat | null>;
  employmentType: Confident<EmploymentType | null>;
  summary: Confident<string>;
  workExperience: WorkExperience[];
  education: Education[];
  skills: Skill[];
  createdAt: string;
  updatedAt: string;
}

export type { WorkFormat, EmploymentType, CandidateProfile };
export { WORK_FORMAT_LABELS, EMPLOYMENT_TYPE_LABELS };
