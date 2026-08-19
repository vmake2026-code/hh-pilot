import { Suspense } from "react";
import WizardClient from "./wizard-client";

export default function ResumeCreatePage() {
  return (
    <Suspense
      fallback={
        <main className="page-wide">
          <div className="stub-section">
            <p>Загрузка...</p>
          </div>
        </main>
      }
    >
      <WizardClient />
    </Suspense>
  );
}
