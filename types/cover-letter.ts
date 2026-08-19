interface CoverLetter {
  id: string;
  resumeId: string;
  vacancyId: string;
  subject: string;
  body: string;
  tone: "formal" | "semi_formal" | "friendly";
  language: string;
  createdAt: string;
}

export type { CoverLetter };
