"use client";

interface ProgressStep {
  number: number;
  title: string;
  short: string;
}

interface WizardProgressProps {
  steps: readonly ProgressStep[];
  current: number;
}

export default function WizardProgress({ steps, current }: WizardProgressProps) {
  const total = steps.length;
  const percent = Math.round((current / total) * 100);

  return (
    <div className="wizard-progress">
      <div className="wizard-progress-bar">
        <div
          className="wizard-progress-fill"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="wizard-progress-steps">
        {steps.map((step) => (
          <div
            key={step.number}
            className={`wizard-step ${
              step.number === current
                ? "wizard-step-active"
                : step.number < current
                  ? "wizard-step-done"
                  : "wizard-step-pending"
            }`}
          >
            <span className="wizard-step-num">{step.number}</span>
            <span className="wizard-step-label">{step.short}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
