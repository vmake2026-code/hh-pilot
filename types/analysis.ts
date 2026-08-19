interface ResumeSectionAnalysis {
  section: string;
  score: number;
  feedback: string;
  suggestions: string[];
}

interface ResumeAnalysis {
  id: string;
  resumeId: string;
  overallScore: number;
  sections: ResumeSectionAnalysis[];
  summary: string;
  strengths: string[];
  weaknesses: string[];
  createdAt: string;
}

export type { ResumeSectionAnalysis, ResumeAnalysis };
