/** Deterministic loading placeholder shown while client data loads. */
export default function Loading({ label = "Загрузка…" }: { label?: string }) {
  return (
    <main className="page-wide">
      <p className="wizard-hint">{label}</p>
    </main>
  );
}
