"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  WIZARD_STEPS,
  createDefaultWizardData,
  createEmptyWorkExperience,
  createEmptyEducation,
  validateWizardStep,
  buildFactChecks,
  canFinalize,
  finalizeResume,
  loadForEdit,
  createNewVersion,
  type WizardData,
  type WizardStep,
} from "@/features/resume-wizard";
import { WORK_FORMAT_LABELS, EMPLOYMENT_TYPE_LABELS } from "@/types/candidate";
import type { WorkExperience, Education } from "@/types/resume";
import WizardProgress from "@/components/wizard/progress";
import WizardLayout from "@/components/wizard/wizard-layout";
import FormField from "@/components/ui/form-field";
import { createPersistenceStore } from "@/lib/persistence";
import { getResumeRecord } from "@/services/resume-persistence";
import { sanitizeText } from "@/lib/security";

const PERSISTENCE_KEY = "resume-draft";
const store = createPersistenceStore<WizardData>();

const TOTAL_STEPS = WIZARD_STEPS.length;

const WORK_FORMAT_OPTIONS = Object.entries(WORK_FORMAT_LABELS).map(
  ([value, label]) => ({ value, label }),
);

const EMPLOYMENT_OPTIONS = Object.entries(EMPLOYMENT_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

export default function WizardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editResumeId = searchParams.get("resumeId");

  const [step, setStep] = useState<WizardStep>(1);
  const [data, setData] = useState<WizardData>(createDefaultWizardData);
  const [confirmedFields, setConfirmedFields] = useState<Set<string>>(
    new Set(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [draftSaved, setDraftSaved] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentResumeId, setCurrentResumeId] = useState<string | null>(null);

  // Load draft or existing resume on mount
  useEffect(() => {
    if (editResumeId) {
      const loaded = loadForEdit(editResumeId);
      if (loaded) {
        setData(loaded.wizardData);
        setConfirmedFields(new Set(loaded.record.confirmedFields));
        setEditMode(true);
        setCurrentResumeId(editResumeId);
        return;
      }
    }
    const saved = store.get(PERSISTENCE_KEY);
    if (saved) {
      setData(saved);
      setStep(1);
    }
  }, [editResumeId]);

  const saveDraft = useCallback(() => {
    store.set(PERSISTENCE_KEY, data);
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 2000);
  }, [data]);

  const updateField = useCallback(
    (field: keyof WizardData, value: string) => {
      setData((prev) => ({ ...prev, [field]: sanitizeText(value) }));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    },
    [],
  );

  const goNext = useCallback(() => {
    const result = validateWizardStep(step, data);
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    if (step < TOTAL_STEPS) {
      setStep((step + 1) as WizardStep);
      window.scrollTo(0, 0);
    }
  }, [step, data]);

  const goBack = useCallback(() => {
    if (step > 1) {
      setErrors({});
      setStep((step - 1) as WizardStep);
      window.scrollTo(0, 0);
    }
  }, [step]);

  const confirmField = useCallback((path: string) => {
    setConfirmedFields((prev) => new Set(prev).add(path));
  }, []);

  const handleFinalize = useCallback(() => {
    const check = canFinalize(data, confirmedFields);
    if (!check.allowed) return;

    if (editMode && currentResumeId) {
      const existing = getResumeRecord(currentResumeId);
      if (existing) {
        createNewVersion(data, existing, confirmedFields);
        store.remove(PERSISTENCE_KEY);
        router.push(`/resume/${currentResumeId}/preview`);
        return;
      }
    }

    const { record } = finalizeResume(data, confirmedFields);
    store.remove(PERSISTENCE_KEY);
    router.push(`/resume/${record.id}/preview`);
  }, [data, confirmedFields, router, editMode, currentResumeId]);

  // ---------- Work experience helpers ----------
  const addWork = useCallback(() => {
    setData((prev) => ({
      ...prev,
      workExperience: [...prev.workExperience, createEmptyWorkExperience()],
    }));
  }, []);

  const updateWork = useCallback(
    (id: string, field: keyof WorkExperience, value: string | boolean | null) => {
      setData((prev) => ({
        ...prev,
        workExperience: prev.workExperience.map((w) =>
          w.id === id ? { ...w, [field]: value } : w,
        ),
      }));
    },
    [],
  );

  const removeWork = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      workExperience: prev.workExperience.filter((w) => w.id !== id),
    }));
  }, []);

  // ---------- Education helpers ----------
  const addEdu = useCallback(() => {
    setData((prev) => ({
      ...prev,
      education: [...prev.education, createEmptyEducation()],
    }));
  }, []);

  const updateEdu = useCallback(
    (id: string, field: keyof Education, value: string | boolean | null) => {
      setData((prev) => ({
        ...prev,
        education: prev.education.map((e) =>
          e.id === id ? { ...e, [field]: value } : e,
        ),
      }));
    },
    [],
  );

  const removeEdu = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      education: prev.education.filter((e) => e.id !== id),
    }));
  }, []);

  // ---------- Skill helpers ----------
  const [skillInput, setSkillInput] = useState("");

  const addSkill = useCallback(() => {
    const name = sanitizeText(skillInput).trim();
    if (!name) return;
    const exists = data.skills.some(
      (s) => s.name.toLowerCase() === name.toLowerCase(),
    );
    if (exists) return;
    setData((prev) => ({
      ...prev,
      skills: [...prev.skills, { name }],
    }));
    setSkillInput("");
  }, [skillInput, data.skills]);

  const removeSkill = useCallback((name: string) => {
    setData((prev) => ({
      ...prev,
      skills: prev.skills.filter((s) => s.name !== name),
    }));
  }, []);

  const stepTitle = WIZARD_STEPS[step - 1]?.title ?? "";
  const factChecks = buildFactChecks(data, confirmedFields);
  const finalizeCheck = canFinalize(data, confirmedFields);

  return (
    <main className="page-wide">
      <WizardProgress steps={WIZARD_STEPS} current={step} />

      {draftSaved && (
        <div className="wizard-toast">Черновик сохранён</div>
      )}

      {editMode && (
        <div className="wizard-toast" style={{ background: "#e0f2fe", color: "#0369a1" }}>
          Редактирование существующего резюме
        </div>
      )}

      <WizardLayout
        title={stepTitle}
        stepNumber={step}
        totalSteps={TOTAL_STEPS}
        onBack={goBack}
        onNext={goNext}
        onSaveDraft={saveDraft}
        canGoBack={step > 1 && step < 7}
        canGoNext={step < 7 ? true : !isLastStepBlocking()}
        nextLabel={step === 6 ? "Перейти к просмотру →" : undefined}
        isLastStep={step === 8}
        onFinalize={handleFinalize}
      >
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        {step === 5 && renderStep5()}
        {step === 6 && renderStep6()}
        {step === 7 && renderStep7()}
        {step === 8 && renderStep8()}
      </WizardLayout>
    </main>
  );

  function isLastStepBlocking() {
    return !finalizeCheck.allowed;
  }

  function renderStep1() {
    return (
      <div className="wizard-fields">
        <p className="wizard-hint">
          Заполните основную информацию о себе. Поля будут отмечены как
          «Подтверждено» после вашего подтверждения.
        </p>
        <FormField
          label="Имя"
          name="firstName"
          value={data.firstName}
          error={errors.firstName}
          required
          placeholder="Иван"
          onChange={(v) => updateField("firstName", v)}
          onConfirm={() => confirmField("firstName")}
          confirmationLevel={
            confirmedFields.has("firstName")
              ? "confirmed"
              : data.firstName.trim()
                ? "inferred"
                : "missing"
          }
        />
        <FormField
          label="Фамилия"
          name="lastName"
          value={data.lastName}
          error={errors.lastName}
          required
          placeholder="Иванов"
          onChange={(v) => updateField("lastName", v)}
          onConfirm={() => confirmField("lastName")}
          confirmationLevel={
            confirmedFields.has("lastName")
              ? "confirmed"
              : data.lastName.trim()
                ? "inferred"
                : "missing"
          }
        />
        <FormField
          label="Отчество"
          name="middleName"
          value={data.middleName}
          placeholder="Иванович (необязательно)"
          onChange={(v) => updateField("middleName", v)}
        />
        <FormField
          label="Город"
          name="city"
          value={data.city}
          error={errors.city}
          required
          placeholder="Москва"
          onChange={(v) => updateField("city", v)}
          onConfirm={() => confirmField("city")}
          confirmationLevel={
            confirmedFields.has("city")
              ? "confirmed"
              : data.city.trim()
                ? "inferred"
                : "missing"
          }
        />
        <FormField
          label="Телефон"
          name="phone"
          type="tel"
          value={data.phone}
          error={errors.phone}
          required
          placeholder="+7 (999) 123-45-67"
          onChange={(v) => updateField("phone", v)}
          onConfirm={() => confirmField("phone")}
          confirmationLevel={
            confirmedFields.has("phone")
              ? "confirmed"
              : data.phone.trim()
                ? "inferred"
                : "missing"
          }
        />
        <FormField
          label="Email"
          name="email"
          type="email"
          value={data.email}
          error={errors.email}
          required
          placeholder="ivan@example.com"
          onChange={(v) => updateField("email", v)}
          onConfirm={() => confirmField("email")}
          confirmationLevel={
            confirmedFields.has("email")
              ? "confirmed"
              : data.email.trim()
                ? "inferred"
                : "missing"
          }
        />
      </div>
    );
  }

  function renderStep2() {
    return (
      <div className="wizard-fields">
        <p className="wizard-hint">
          Укажите должность, на которую вы претендуете.
        </p>
        <FormField
          label="Желаемая должность"
          name="desiredPosition"
          value={data.desiredPosition}
          error={errors.desiredPosition}
          required
          placeholder="Frontend Developer"
          onChange={(v) => updateField("desiredPosition", v)}
          onConfirm={() => confirmField("desiredPosition")}
          confirmationLevel={
            confirmedFields.has("desiredPosition")
              ? "confirmed"
              : data.desiredPosition.trim()
                ? "inferred"
                : "missing"
          }
        />
        <FormField
          label="Ожидаемая зарплата"
          name="desiredSalary"
          value={data.desiredSalary}
          placeholder="от 150 000 ₽ (необязательно)"
          onChange={(v) => updateField("desiredSalary", v)}
        />
        <FormField
          label="Формат работы"
          name="workFormat"
          type="select"
          value={data.workFormat}
          options={WORK_FORMAT_OPTIONS}
          onChange={(v) => updateField("workFormat", v)}
        />
        <FormField
          label="Тип занятости"
          name="employmentType"
          type="select"
          value={data.employmentType}
          options={EMPLOYMENT_OPTIONS}
          onChange={(v) => updateField("employmentType", v)}
        />
      </div>
    );
  }

  function renderStep3() {
    return (
      <div className="wizard-fields">
        <p className="wizard-hint">
          Добавьте места работы. Если achievement пока не заполнены — не
          страшно, мы поможем позже.
        </p>
        {data.workExperience.map((work, index) => (
          <div key={work.id} className="wizard-card">
            <div className="wizard-card-header">
              <strong>Место работы #{index + 1}</strong>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => removeWork(work.id)}
              >
                Удалить
              </button>
            </div>
            <FormField
              label="Компания"
              name={`work-${work.id}-company`}
              value={work.company}
              error={errors[`work[${index}].company`]}
              required
              placeholder="ООО Рога и Копыта"
              onChange={(v) => updateWork(work.id, "company", v)}
            />
            <FormField
              label="Должность"
              name={`work-${work.id}-position`}
              value={work.position}
              error={errors[`work[${index}].position`]}
              required
              placeholder="Developer"
              onChange={(v) => updateWork(work.id, "position", v)}
            />
            <div className="wizard-row">
              <FormField
                label="Дата начала"
                name={`work-${work.id}-start`}
                type="text"
                value={work.startDate}
                error={errors[`work[${index}].dates`]}
                required
                placeholder="MM/YYYY"
                onChange={(v) => updateWork(work.id, "startDate", v)}
              />
              <FormField
                label="Дата окончания"
                name={`work-${work.id}-end`}
                type="text"
                value={work.endDate ?? ""}
                placeholder={work.isCurrent ? "По настоящее время" : "MM/YYYY"}
                disabled={work.isCurrent}
                onChange={(v) =>
                  updateWork(work.id, "endDate", v || null)
                }
              />
            </div>
            <label className="wizard-checkbox">
              <input
                type="checkbox"
                checked={work.isCurrent}
                onChange={(e) => {
                  updateWork(work.id, "isCurrent", e.target.checked);
                  if (e.target.checked) updateWork(work.id, "endDate", null);
                }}
              />
              Работаю здесь сейчас
            </label>
            <FormField
              label="Обязанности"
              name={`work-${work.id}-desc`}
              type="textarea"
              value={work.description}
              placeholder="Что вы делали на этой позиции"
              onChange={(v) => updateWork(work.id, "description", v)}
            />
            <div className="wizard-hint-box">
              <p className="wizard-hint-small">
                Достижения — необязательно. Мы поможем сформулировать их
                позже, когда подключим AI-анализ.
              </p>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary btn-md"
          onClick={addWork}
        >
          + Добавить место работы
        </button>
      </div>
    );
  }

  function renderStep4() {
    return (
      <div className="wizard-fields">
        <p className="wizard-hint">
          Добавьте записи об образовании.
        </p>
        {data.education.map((edu, index) => (
          <div key={edu.id} className="wizard-card">
            <div className="wizard-card-header">
              <strong>Образование #{index + 1}</strong>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => removeEdu(edu.id)}
              >
                Удалить
              </button>
            </div>
            <FormField
              label="Учебное заведение"
              name={`edu-${edu.id}-institution`}
              value={edu.institution}
              error={errors[`edu[${index}].institution`]}
              required
              placeholder="МГУ"
              onChange={(v) => updateEdu(edu.id, "institution", v)}
            />
            <FormField
              label="Степень / уровень"
              name={`edu-${edu.id}-degree`}
              value={edu.degree}
              error={errors[`edu[${index}].degree`]}
              required
              placeholder="Бакалавр"
              onChange={(v) => updateEdu(edu.id, "degree", v)}
            />
            <FormField
              label="Специальность"
              name={`edu-${edu.id}-field`}
              value={edu.field}
              placeholder="Информатика"
              onChange={(v) => updateEdu(edu.id, "field", v)}
            />
            <div className="wizard-row">
              <FormField
                label="Дата начала"
                name={`edu-${edu.id}-start`}
                type="text"
                value={edu.startDate}
                error={errors[`edu[${index}].dates`]}
                required
                placeholder="MM/YYYY"
                onChange={(v) => updateEdu(edu.id, "startDate", v)}
              />
              <FormField
                label="Дата окончания"
                name={`edu-${edu.id}-end`}
                type="text"
                value={edu.endDate ?? ""}
                placeholder={edu.description ? "По настоящее время" : "MM/YYYY"}
                onChange={(v) => updateEdu(edu.id, "endDate", v || null)}
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary btn-md"
          onClick={addEdu}
        >
          + Добавить образование
        </button>
      </div>
    );
  }

  function renderStep5() {
    return (
      <div className="wizard-fields">
        <p className="wizard-hint">
          Добавьте навыки через запятую или по одному.
        </p>
        <div className="skill-input-row">
          <input
            type="text"
            className="form-input"
            placeholder="Введите навык"
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSkill();
              }
            }}
          />
          <button
            type="button"
            className="btn btn-primary btn-md"
            onClick={addSkill}
          >
            Добавить
          </button>
        </div>
        {data.skills.length > 0 && (
          <div className="skill-list">
            {data.skills.map((skill) => (
              <span key={skill.name} className="skill-tag">
                {skill.name}
                <button
                  type="button"
                  className="skill-remove"
                  onClick={() => removeSkill(skill.name)}
                  aria-label={`Удалить ${skill.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderStep6() {
    return (
      <div className="wizard-fields">
        <p className="wizard-hint">
          Дополнительная информация: кратко о себе и языки.
        </p>
        <FormField
          label="О себе"
          name="summary"
          type="textarea"
          value={data.summary}
          placeholder="Кратко расскажите о вашем опыте и целях (необязательно)"
          rows={4}
          onChange={(v) => updateField("summary", v)}
        />
        <FormField
          label="Языки"
          name="languages"
          value={data.languages.join(", ")}
          placeholder="Русский, Английский (через запятую)"
          onChange={(v) =>
            setData((prev) => ({
              ...prev,
              languages: v
                .split(",")
                .map((l) => l.trim())
                .filter(Boolean),
            }))
          }
        />
      </div>
    );
  }

  function renderStep7() {
    return (
      <div className="preview-section">
        <h3>Предварительный просмотр резюме</h3>

        <div className="preview-block">
          <h4>Личные данные</h4>
          <p>
            <strong>{data.firstName} {data.lastName}</strong>
            {data.middleName && ` ${data.middleName}`}
          </p>
          <p>
            {data.city && `${data.city}`}
            {data.phone && ` · ${data.phone}`}
            {data.email && ` · ${data.email}`}
          </p>
        </div>

        {data.desiredPosition && (
          <div className="preview-block">
            <h4>Желаемая должность</h4>
            <p>{data.desiredPosition}</p>
            {data.desiredSalary && <p>Ожидаемая зарплата: {data.desiredSalary}</p>}
          </div>
        )}

        {data.workExperience.length > 0 && (
          <div className="preview-block">
            <h4>Опыт работы</h4>
            {data.workExperience.map((w) => (
              <div key={w.id} className="preview-item">
                <p>
                  <strong>{w.position || "(должность не указана)"}</strong>
                  {" — "}
                  {w.company || "(компания не указана)"}
                </p>
                <p className="preview-dates">
                  {w.startDate}
                  {w.endDate ? ` — ${w.endDate}` : w.isCurrent ? " — по настоящее время" : ""}
                </p>
                {w.description && <p>{w.description}</p>}
              </div>
            ))}
          </div>
        )}

        {data.education.length > 0 && (
          <div className="preview-block">
            <h4>Образование</h4>
            {data.education.map((e) => (
              <div key={e.id} className="preview-item">
                <p>
                  <strong>{e.degree || "(степень не указана)"}</strong>
                  {e.field ? `, ${e.field}` : ""}
                </p>
                <p>{e.institution || "(учреждение не указано)"}</p>
                <p className="preview-dates">
                  {e.startDate}
                  {e.endDate ? ` — ${e.endDate}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}

        {data.skills.length > 0 && (
          <div className="preview-block">
            <h4>Навыки</h4>
            <div className="skill-list">
              {data.skills.map((s) => (
                <span key={s.name} className="skill-tag">{s.name}</span>
              ))}
            </div>
          </div>
        )}

        {data.summary && (
          <div className="preview-block">
            <h4>О себе</h4>
            <p>{data.summary}</p>
          </div>
        )}

        {data.languages.length > 0 && (
          <div className="preview-block">
            <h4>Языки</h4>
            <p>{data.languages.join(", ")}</p>
          </div>
        )}
      </div>
    );
  }

  function renderStep8() {
    return (
      <div className="factcheck-section">
        <h3>Проверьте факты</h3>
        <p className="wizard-hint">
          Перед созданием резюме убедитесь, что обязательные данные
          подтверждены. Вернитесь к нужному шагу, чтобы исправить.
        </p>

        <div className="factcheck-list">
          {factChecks.map((check) => (
            <div
              key={check.fieldPath}
              className={`factcheck-item factcheck-${check.level}`}
            >
              <span className="factcheck-icon">
                {check.level === "confirmed" && "✓"}
                {check.level === "missing" && "○"}
              </span>
              <span className="factcheck-label">
                {check.label}
                {check.isRequired && (
                  <span className="form-required"> *</span>
                )}
              </span>
              <span className="factcheck-value">
                {check.value || "(пусто)"}
              </span>
              <span className={`factcheck-status status-${check.level}`}>
                {check.level === "confirmed" && "Подтверждено"}
                {check.level === "missing" && "Требует подтверждения"}
              </span>
            </div>
          ))}
        </div>

        {!finalizeCheck.allowed && (
          <div className="factcheck-warning">
            <p>
              Для создания резюме необходимо подтвердить обязательные поля:
            </p>
            <ul>
              {finalizeCheck.blockingFields.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }
}
