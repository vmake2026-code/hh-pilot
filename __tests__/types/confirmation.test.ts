import { describe, it, expect } from "vitest";
import {
  confirmField,
  inferField,
  missingField,
  isConfirmed,
  isInferred,
  isMissing,
  getFieldValue,
  confirmInferred,
} from "../../types/confirmation";
import type { Confident } from "../../types/confirmation";

describe("confirmation types", () => {
  it("creates a confirmed field", () => {
    const field = confirmField("hello");
    expect(field.value).toBe("hello");
    expect(field.level).toBe("confirmed");
    expect(isConfirmed(field)).toBe(true);
    expect(isInferred(field)).toBe(false);
    expect(isMissing(field)).toBe(false);
  });

  it("creates an inferred field", () => {
    const field = inferField(42);
    expect(field.value).toBe(42);
    expect(field.level).toBe("inferred");
    expect(isInferred(field)).toBe(true);
    expect(isConfirmed(field)).toBe(false);
  });

  it("creates a missing field", () => {
    const field = missingField();
    expect(field.value).toBeNull();
    expect(field.level).toBe("missing");
    expect(isMissing(field)).toBe(true);
    expect(isConfirmed(field)).toBe(false);
  });

  it("getFieldValue returns the value or null", () => {
    const confirmed = confirmField("yes");
    const missing = missingField();
    const inferred = inferField("maybe");

    expect(getFieldValue(confirmed)).toBe("yes");
    expect(getFieldValue(missing)).toBeNull();
    expect(getFieldValue(inferred)).toBe("maybe");
  });

  it("confirmInferred converts inferred to confirmed", () => {
    const inferred: Confident<string> = inferField("draft");
    const confirmed = confirmInferred(inferred);
    expect(confirmed.level).toBe("confirmed");
    expect(confirmed.value).toBe("draft");
  });

  it("confirmInferred leaves confirmed fields unchanged", () => {
    const original = confirmField("locked");
    const result = confirmInferred(original);
    expect(result).toBe(original);
    expect(result.level).toBe("confirmed");
  });

  it("confirmInferred leaves missing fields unchanged", () => {
    const original = missingField();
    const result = confirmInferred(original);
    expect(result.level).toBe("missing");
  });
});
