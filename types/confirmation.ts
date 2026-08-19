/**
 * Confirmation level for any piece of candidate information.
 *
 * AI-generated data is always "inferred" and must never be auto-promoted
 * to "confirmed". Only explicit user action can confirm a field.
 */

type ConfirmationLevel = "confirmed" | "missing" | "inferred";

/** Field confirmed by the user */
interface ConfirmedField<T> {
  readonly value: T;
  readonly level: "confirmed";
}

/** Field with no information available */
interface MissingField {
  readonly value: null;
  readonly level: "missing";
}

/** Field inferred by AI — requires user confirmation */
interface InferredField<T> {
  readonly value: T;
  readonly level: "inferred";
}

/** A field that may be confirmed, inferred, or missing */
type Confident<T> = ConfirmedField<T> | MissingField | InferredField<T>;

// ---------- helpers ----------

function confirmField<T>(value: T): ConfirmedField<T> {
  return { value, level: "confirmed" };
}

function inferField<T>(value: T): InferredField<T> {
  return { value, level: "inferred" };
}

function missingField(): MissingField {
  return { value: null, level: "missing" };
}

function isConfirmed<T>(field: Confident<T>): field is ConfirmedField<T> {
  return field.level === "confirmed";
}

function isInferred<T>(field: Confident<T>): field is InferredField<T> {
  return field.level === "inferred";
}

function isMissing<T>(field: Confident<T>): field is MissingField {
  return field.level === "missing";
}

function getFieldValue<T>(field: Confident<T>): T | null {
  return field.value;
}

/** Convert an inferred field to confirmed (user action) */
function confirmInferred<T>(field: Confident<T>): Confident<T> {
  if (field.level === "inferred") {
    return confirmField(field.value);
  }
  return field;
}

export type {
  ConfirmationLevel,
  ConfirmedField,
  MissingField,
  InferredField,
  Confident,
};

export {
  confirmField,
  inferField,
  missingField,
  isConfirmed,
  isInferred,
  isMissing,
  getFieldValue,
  confirmInferred,
};
