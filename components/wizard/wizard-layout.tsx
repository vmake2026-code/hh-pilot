"use client";

import type { ReactNode } from "react";

interface WizardLayoutProps {
  title: string;
  stepNumber: number;
  totalSteps: number;
  children: ReactNode;
  onBack: () => void;
  onNext: () => void;
  onSaveDraft: () => void;
  canGoBack: boolean;
  canGoNext: boolean;
  nextLabel?: string;
  isLastStep?: boolean;
  onFinalize?: () => void;
}

export default function WizardLayout({
  title,
  stepNumber,
  totalSteps,
  children,
  onBack,
  onNext,
  onSaveDraft,
  canGoBack,
  canGoNext,
  nextLabel,
  isLastStep,
  onFinalize,
}: WizardLayoutProps) {
  return (
    <div className="wizard-container">
      <h2 className="wizard-title">
        Шаг {stepNumber} из {totalSteps}: {title}
      </h2>

      <div className="wizard-content">{children}</div>

      <div className="wizard-nav">
        <div className="wizard-nav-left">
          {canGoBack && (
            <button
              type="button"
              className="btn btn-secondary btn-md"
              onClick={onBack}
            >
              ← Назад
            </button>
          )}
        </div>

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onSaveDraft}
        >
          Сохранить черновик
        </button>

        <div className="wizard-nav-right">
          {isLastStep && onFinalize ? (
            <button
              type="button"
              className="btn btn-primary btn-md"
              onClick={onFinalize}
              disabled={!canGoNext}
            >
              Создать резюме
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-md"
              onClick={onNext}
              disabled={!canGoNext}
            >
              {nextLabel ?? "Далее →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
