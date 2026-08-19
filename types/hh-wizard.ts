interface HHFieldInstruction {
  hhFieldKey: string;
  hhFieldName: string;
  resumeFieldPath: string;
  resumeFieldValue: string;
  copyableText: string;
  isCompleted: boolean;
  stepNumber: number;
  notes?: string;
}

export type { HHFieldInstruction };
