import { describe, it, expect } from "vitest";

// P30: прямой тест lib/salary.ts. Модуль объявляет себя «single source of truth»
// для парсинга зарплаты, но до P30 не имел собственного теста: assertions жили
// в __tests__/lib/vacancy-validation.test.ts и импортировали функцию через
// re-export из services/vacancy-import. Контракт, который здесь фиксируется:
//   - undefined на любом мусорном вводе, NaN НИКОГДА не доходит до модели;
//   - «0» — валидное значение (0 !== undefined);
//   - пробелы/разделители разрядов схлопываются, запятая = точка;
//   - отрицательные, экспоненциальные и валютные значения не принимаются.

import { parseSalaryValue } from "../../lib/salary";

describe("parseSalaryValue — valid input (P30)", () => {
  it("parses a plain integer string", () => {
    expect(parseSalaryValue("150000")).toBe(150000);
  });

  it("parses a dot decimal", () => {
    expect(parseSalaryValue("1500.50")).toBe(1500.5);
  });

  it("parses a comma decimal (Russian locale)", () => {
    expect(parseSalaryValue("1500,50")).toBe(1500.5);
  });

  it("keeps zero as a real value, not undefined", () => {
    expect(parseSalaryValue("0")).toBe(0);
    expect(parseSalaryValue("0")).not.toBeUndefined();
    expect(parseSalaryValue("0.0")).toBe(0);
    expect(parseSalaryValue("0,00")).toBe(0);
  });

  it("collapses inner whitespace and non-breaking spaces (thousand separators)", () => {
    expect(parseSalaryValue("150 000")).toBe(150000);
    expect(parseSalaryValue("  150000  ")).toBe(150000);
    expect(parseSalaryValue("1 500 000")).toBe(1500000);
    expect(parseSalaryValue("150\u00a0000")).toBe(150000);
    expect(parseSalaryValue("150\t000")).toBe(150000);
  });

  it("normalizes leading zeros", () => {
    expect(parseSalaryValue("007")).toBe(7);
  });

  it("always returns a finite number on success", () => {
    for (const raw of ["1", "0", "999999", "1.5", "2,25"]) {
      const parsed = parseSalaryValue(raw);
      expect(typeof parsed).toBe("number");
      expect(Number.isFinite(parsed)).toBe(true);
    }
  });
});

describe("parseSalaryValue — missing / empty input (P30)", () => {
  it("returns undefined for undefined and null", () => {
    expect(parseSalaryValue(undefined)).toBeUndefined();
    expect(parseSalaryValue(null)).toBeUndefined();
  });

  it("returns undefined for empty and whitespace-only strings", () => {
    expect(parseSalaryValue("")).toBeUndefined();
    expect(parseSalaryValue("   ")).toBeUndefined();
    expect(parseSalaryValue("\t\n ")).toBeUndefined();
  });
});

describe("parseSalaryValue — invalid input (P30)", () => {
  it("rejects trailing or embedded letters", () => {
    expect(parseSalaryValue("150000abc")).toBeUndefined();
    expect(parseSalaryValue("abc150000")).toBeUndefined();
    expect(parseSalaryValue("150k")).toBeUndefined();
  });

  it("rejects currency symbols and formatting", () => {
    expect(parseSalaryValue("150000₽")).toBeUndefined();
    expect(parseSalaryValue("от 200 000 ₽")).toBeUndefined();
    expect(parseSalaryValue("$150000")).toBeUndefined();
    expect(parseSalaryValue("150 000-200 000")).toBeUndefined();
  });

  it("rejects negative values", () => {
    expect(parseSalaryValue("-150000")).toBeUndefined();
    expect(parseSalaryValue("-1,5")).toBeUndefined();
  });

  it("rejects explicit plus signs", () => {
    expect(parseSalaryValue("+150000")).toBeUndefined();
  });

  it("rejects scientific notation", () => {
    expect(parseSalaryValue("1e6")).toBeUndefined();
    expect(parseSalaryValue("1E6")).toBeUndefined();
  });

  it("rejects malformed decimal separators", () => {
    expect(parseSalaryValue("1.5.5")).toBeUndefined();
    expect(parseSalaryValue("1,5,5")).toBeUndefined();
    expect(parseSalaryValue("1,")).toBeUndefined();
    expect(parseSalaryValue(",5")).toBeUndefined();
    expect(parseSalaryValue(".")).toBeUndefined();
    expect(parseSalaryValue(",")).toBeUndefined();
  });

  it("rejects non-numeric values once stringified (String(raw) coercion at lib/salary.ts:11)", () => {
    expect(parseSalaryValue({} as unknown as string)).toBeUndefined();
    expect(parseSalaryValue([] as unknown as string)).toBeUndefined();
    expect(parseSalaryValue(true as unknown as string)).toBeUndefined();
    expect(parseSalaryValue(NaN as unknown as string)).toBeUndefined();
    expect(parseSalaryValue(Infinity as unknown as string)).toBeUndefined();
  });

  it("accepts a numeric input via String() coercion (locked, out-of-contract but benign)", () => {
    // The declared signature is string|undefined|null, but the implementation
    // stringifies first, so a raw number is parsed instead of rejected.
    // Locked here so an accidental switch to a strict type check is noticed.
    expect(parseSalaryValue(150000 as unknown as string)).toBe(150000);
    expect(parseSalaryValue(0 as unknown as string)).toBe(0);
    expect(parseSalaryValue(-1 as unknown as string)).toBeUndefined();
  });
});

describe("parseSalaryValue — boundary input (P30)", () => {
  it("rejects numbers that would overflow to Infinity", () => {
    // Number.MAX_VALUE is ~1.7977e308. "1"x309 is ~1.111e308 (finite), while
    // "9"x309 is ~9.99e308 and anything 310+ digits overflows; the
    // Number.isFinite guard at lib/salary.ts:15 rejects exactly those.
    expect(parseSalaryValue("9".repeat(309))).toBeUndefined();
    expect(parseSalaryValue("9".repeat(310))).toBeUndefined();
    expect(parseSalaryValue("9".repeat(400))).toBeUndefined();
    expect(parseSalaryValue("1".repeat(310))).toBeUndefined();
  });

  it("accepts the largest digit string that remains finite", () => {
    const ones309 = parseSalaryValue("1".repeat(309));
    expect(ones309).toBeTypeOf("number");
    expect(Number.isFinite(ones309)).toBe(true);
    expect(ones309).toBe(Number("1".repeat(309)));
  });

  it("single and double digit boundaries parse exactly", () => {
    expect(parseSalaryValue("9")).toBe(9);
    expect(parseSalaryValue("10")).toBe(10);
    expect(parseSalaryValue("0.1")).toBe(0.1);
    expect(parseSalaryValue("0,1")).toBe(0.1);
  });

  it("a very long but finite value stays finite", () => {
    expect(Number.isFinite(parseSalaryValue("999999999999999") as number)).toBe(true);
  });
});

describe("parseSalaryValue — NaN never escapes (P30 invariant)", () => {
  it("never returns NaN across a mixed corpus of hostile inputs", () => {
    const corpus: unknown[] = [
      "",
      " ",
      "  1  ",
      "0",
      "-0",
      "-1",
      "+1",
      "1e5",
      "1,5",
      "1.5",
      "1,5,5",
      "1.",
      ",1",
      "abc",
      "1a",
      "NaN",
      "Infinity",
      "-Infinity",
      "undefined",
      "null",
      "₽",
      "1 000 ₽",
      undefined,
      null,
      true,
      false,
      {},
      [],
      [150000],
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER,
      "9".repeat(500),
    ];

    for (const raw of corpus) {
      const parsed = parseSalaryValue(raw as string);
      expect(parsed === undefined || Number.isFinite(parsed)).toBe(true);
      if (parsed !== undefined) {
        expect(Number.isNaN(parsed)).toBe(false);
        expect(typeof parsed).toBe("number");
      }
    }
  });

  it("the only accepted shapes are digits with an optional single decimal separator", () => {
    const accepted = new Set(["0", "7", "007", "1.5", "1,5", "1 000", "150000"]);
    const corpus = [
      "0", "7", "007", "1.5", "1,5", "1 000", "150000",
      "1.5.5", "1,", ",1", "-1", "+1", "1e5", "abc", "", " ", "1a", "1 ₽",
    ];
    for (const raw of corpus) {
      const parsed = parseSalaryValue(raw);
      if (accepted.has(raw)) {
        expect(parsed).toBeTypeOf("number");
      } else {
        expect(parsed).toBeUndefined();
      }
    }
  });
});