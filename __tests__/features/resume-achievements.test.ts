import { describe, it, expect } from "vitest";
import {
  parseAchievements,
  achievementsToText,
} from "../../features/resume-wizard";

// ---------- P9.3 achievements textarea <-> string[] ----------

describe("parseAchievements (P9.3)", () => {
  it("splits by newline, trims and drops empty lines", () => {
    expect(parseAchievements("Achievement A\nAchievement B\n\n Achievement C ")).toEqual([
      "Achievement A",
      "Achievement B",
      "Achievement C",
    ]);
  });

  it("preserves order", () => {
    expect(parseAchievements("A\nB\nC")).toEqual(["A", "B", "C"]);
  });

  it("handles CRLF line endings", () => {
    expect(parseAchievements("A\r\nB\r\nC")).toEqual(["A", "B", "C"]);
  });

  it("empty/whitespace-only input produces an empty array", () => {
    expect(parseAchievements("")).toEqual([]);
    expect(parseAchievements("\n\n   \n")).toEqual([]);
  });
});

describe("achievementsToText (P9.3)", () => {
  it("joins achievements with newlines", () => {
    expect(achievementsToText(["A", "B"])).toBe("A\nB");
  });

  it("legacy/undefined safely renders as an empty string", () => {
    expect(achievementsToText(undefined)).toBe("");
    expect(achievementsToText([])).toBe("");
  });

  it("text <-> array roundtrip is lossless", () => {
    const original = ["Увеличил продажи на 30%", "Сократил расходы на 15%"];
    expect(parseAchievements(achievementsToText(original))).toEqual(original);
  });
});
