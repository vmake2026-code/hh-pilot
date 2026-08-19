"use client";

interface FormFieldProps {
  label: string;
  name: string;
  type?: "text" | "email" | "tel" | "textarea" | "select";
  value: string;
  error?: string;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  options?: { value: string; label: string }[];
  rows?: number;
  onChange: (value: string) => void;
  onConfirm?: () => void;
  confirmationLevel?: "confirmed" | "inferred" | "missing";
}

export default function FormField({
  label,
  name,
  type = "text",
  value,
  error,
  required,
  placeholder,
  disabled,
  options,
  rows,
  onChange,
  onConfirm,
  confirmationLevel,
}: FormFieldProps) {
  const fieldId = `field-${name}`;

  return (
    <div className="form-field">
      <label htmlFor={fieldId} className="form-label">
        {label}
        {required && <span className="form-required">*</span>}
      </label>

      {type === "textarea" ? (
        <textarea
          id={fieldId}
          className={`form-input ${error ? "form-input-error" : ""}`}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows ?? 3}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : type === "select" && options ? (
        <select
          id={fieldId}
          className={`form-input ${error ? "form-input-error" : ""}`}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— Выберите —</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={fieldId}
          type={type}
          className={`form-input ${error ? "form-input-error" : ""}`}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {error && <p className="form-error">{error}</p>}

      {onConfirm && confirmationLevel && (
        <div className="form-confirm">
          <span className={`form-confirm-status status-${confirmationLevel}`}>
            {confirmationLevel === "confirmed" && "✓ Подтверждено"}
            {confirmationLevel === "inferred" && "⚠ Требует подтверждения"}
            {confirmationLevel === "missing" && "○ Не заполнено"}
          </span>
          {confirmationLevel !== "confirmed" && value.trim() && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onConfirm}
            >
              Подтвердить
            </button>
          )}
        </div>
      )}
    </div>
  );
}
