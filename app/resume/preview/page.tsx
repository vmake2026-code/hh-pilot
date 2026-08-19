import Link from "next/link";

export default function ResumePreviewPage() {
  return (
    <main className="page-wide">
      <div className="stub-section">
        <h1>Резюме создано</h1>
        <p>
          Ваше резюме готово. На следующем этапе здесь будет полный preview
          с возможностью редактирования и версионирования.
        </p>
        <Link href="/resume/create" className="btn btn-primary btn-md">
          Создать новое резюме
        </Link>
        <span style={{ margin: "0 8px" }} />
        <Link href="/" className="btn btn-secondary btn-md">
          На главную
        </Link>
      </div>
    </main>
  );
}
