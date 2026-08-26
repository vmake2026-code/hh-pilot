interface ResumeSectionAnalysis {
  section: string;
  score: number;
  feedback: string;
  suggestions: string[];
}

interface ResumeAnalysis {
  id: string;
  resumeId: string;
  /** ResumeVersion this analysis was produced for (stale detection). */
  versionId: string;
  overallScore: number;
  sections: ResumeSectionAnalysis[];
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations?: string[];
  /** Which gateway produced the analysis ("mock", future real providers). */
  provider: string;
  createdAt: string;
}

export type { ResumeSectionAnalysis, ResumeAnalysis };
