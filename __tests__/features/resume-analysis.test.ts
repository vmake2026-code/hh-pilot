import { describe, it, expect } from "vitest";
import { finalizeResume, createNewVersion } from "../../features/resume-wizard";
import type { ResumeAnalysisInput, ResumeRecord } from "../../types/resume";
import type { Vacancy } from "../../types/vacancy";
import { calculateMatch } from "../../services/matching";
import {
  analyzeCurrentVersion,
  isAnalysisStale,
  selectLatestAnalysis,
  listAnalysesForResume,
  RemoteAIGateway,
  AIAnalysisError,
} from "../../features/resume-analysis";
import type { AIErrorCode } from "../../features/resume-analysis";
import type { AIGateway } from "../../services/ai";
import { confirmField, missingField } from "../../types/confirmation";

const NOW = "2026-01-01T00:00:00Z";

function makeVacancy(): Vacancy {
  return {
    id: "vac-1",
    title: "Frontend Developer",
    company: "T",
    description: "",
    requirements: [],
    skills: ["React"],
    responsibilities: [],
    location: "Москва",
    source: "text",
    fetchedAt: "2026-01-01T00:00:00Z",
  };
}

function confirmAll(): Set<string> {
  return new Set(["phone", "email", "desiredPosition"]);
}

function makeRecord(): ResumeRecord {
  const data = finalizeResume(
    {
      firstName: "Иван",
      lastName: "Иванов",
      middleName: "",
      city: "Москва",
      phone: "+79999999999",
      email: "test@example.com",
      desiredPosition: "Frontend Developer", desiredSalary: "300000",
      workFormat: "remote",
      employmentType: "full_time",
      workExperience: [
        { id: "w1", company: "Example", position: "Frontend Developer", startDate: "01/2020", endDate: null, isCurrent: true, description: "React development", achievements: ["Reduced load time"] },
      ],
      education: [
        { id: "e1", level: "higher", institution: "МГУ", degree: "", field: "Computer Science", startDate: "09/2016", endDate: null, description: "" },
      ],
      skills: [
        { name: "React", level: "advanced" },
        { name: "Git", level: "beginner" },
      ],
      summary: "",
      languages: [],
    },
    new Set(["phone", "email", "desiredPosition"]),
  );
  return data.record;
}

function stubGateway(analyzeImpl: AIGateway["analyzeResume"]): AIGateway {
  return {
    setProvider() {},
    getProvider() { return { name: "stub", async complete() { return { content: "" }; } }; },
    analyzeResume: analyzeImpl,
    matchResumeToVacancy() { throw new Error("not used"); },
    generateCoverLetter() { throw new Error("not used"); },
    optimizeResume() { throw new Error("not used"); },
  };
}

// ---------- P10.1 orchestration ----------

describe("analyzeCurrentVersion (P10.1)", () => {
  it("analyzes the current version with correct bindings and persists", async () => {
    const record = makeRecord();
    const outcome = await analyzeCurrentVersion(record);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const a = outcome.analysis;
    expect(a.resumeId).toBe(record.resume.id);
    expect(a.versionId).toBe(record.resume.currentVersionId);
    expect(a.provider).toBe("mock");
    expect(listAnalysesForResume(record.resume.id).some((x) => x.id === a.id)).toBe(true);
  });

  it("malformed AI result -> controlled failure, nothing persisted", async () => {
    const record = makeRecord();
    const before = listAnalysesForResume(record.resume.id).length;
    const bad = stubGateway(async () => ({ wrong: true }) as never);

    const outcome = await analyzeCurrentVersion(record, bad);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toContain("некорректный");
    expect(listAnalysesForResume(record.resume.id).length).toBe(before);
  });

  it("throwing provider -> controlled failure", async () => {
    const record = makeRecord();
    const throwing = stubGateway(async () => { throw new Error("boom"); });
    const outcome = await analyzeCurrentVersion(record, throwing);
    expect(outcome.ok).toBe(false);
  });

  it("AI analysis does not mutate the source ResumeVersion (immutability)", async () => {
    const record = makeRecord();
    const before = JSON.stringify(record);

    await analyzeCurrentVersion(record);

    expect(JSON.stringify(record)).toBe(before);
  });

  it("matching result identical before/after analysis (boundary lock)", async () => {
    const record = makeRecord();
    const version =
      record.versions.find((v) => v.id === record.resume.currentVersionId) ??
      record.versions[record.versions.length - 1];
    const vacancy = makeVacancy();

    const before = calculateMatch(vacancy, version, record.resume.id).overallScore;
    await analyzeCurrentVersion(record);
    const after = calculateMatch(vacancy, version, record.resume.id).overallScore;

    expect(after).toBe(before);
  });
});

describe("stale detection helpers (P10.1)", () => {
  it("analysis of v3 is stale after current version became v4", async () => {
    const record = makeRecord();
    const first = await analyzeCurrentVersion(record);
    expect(first.ok).toBe(true);

    // simulate user edit creating version 2
    createNewVersion(
      {
        firstName: "Иван", lastName: "Иванов", middleName: "", city: "Москва",
        phone: "+79999999999", email: "test@example.com",
        desiredPosition: "Frontend Developer", desiredSalary: "",
        workFormat: "remote", employmentType: "full_time",
        workExperience: record.versions[0].data.workExperience,
        education: record.versions[0].data.education,
        skills: record.versions[0].data.skills,
        summary: "", languages: [],
      },
      record,
      confirmAll(),
    );

    if (!first.ok) throw new Error("expected ok");
    expect(isAnalysisStale(first.analysis, record)).toBe(true);

    const latest = selectLatestAnalysis(listAnalysesForResume(record.resume.id), record);
    expect(latest?.id).toBe(first.analysis.id); // latest overall — но он stale
  });

  it("fresh analysis of the current version is not stale", async () => {
    const record = makeRecord();
    const res = await analyzeCurrentVersion(record);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(isAnalysisStale(res.analysis, record)).toBe(false);
    const latest = selectLatestAnalysis(listAnalysesForResume(record.resume.id), record);
    expect(latest?.versionId).toBe(record.resume.currentVersionId);
  });
});

// ---------- P10.1.2 regression lock: salaryExpectation must NOT exist in AI payload ----------

function captureGateway(captured: { value: unknown }): AIGateway {
  return {
    setProvider() {},
    getProvider() { return { name: "mock", async complete() { return { content: "" }; } }; },
    analyzeResume: async (input) => {
      captured.value = input;
      return {
        id: "a", resumeId: "res", versionId: "v",
        provider: "mock", overallScore: 50, sections: [], summary: "s",
        strengths: [], weaknesses: [], createdAt: "2026-01-01T00:00:00Z",
      };
    },
    matchResumeToVacancy() { throw new Error("unused"); },
    generateCoverLetter() { throw new Error("unused"); },
    optimizeResume() { throw new Error("unused"); },
  };
}

describe("privacy lock (P10.1.2)", () => {
  it("gateway payload has no salaryExpectation key and leaks no value; normal data intact", async () => {
    const record = makeRecord();
    const capturedBox: { value: unknown } = { value: null };
    const g = captureGateway(capturedBox);

    const before = JSON.stringify(record);
    const outcome = await analyzeCurrentVersion(record, g);
    const after = JSON.stringify(record);

    expect(outcome.ok).toBe(true);
    expect(capturedBox.value).not.toBeNull();

    // Ключ отсутствует полностью (не undefined/null)
    expect(Object.prototype.hasOwnProperty.call(capturedBox.value, "salaryExpectation")).toBe(false);
    // Значение нигде в сериализации
    const json = JSON.stringify(capturedBox.value);
    expect(json).not.toContain("300000");

    // P10.1.4: строгий контракт ключей AI payload
    const keys = Object.keys(capturedBox.value as object).sort();
    expect(keys).toEqual([
      "candidateId",
      "createdAt",
      "currentVersionId",
      "desiredPosition",
      "education",
      "employmentType",
      "id",
      "languages",
      "location",
      "skills",
      "summary",
      "title",
      "updatedAt",
      "workExperience",
      "workFormat",
    ]);

    // Нормальные данные остались
    const payload = capturedBox.value as {
      desiredPosition: { value?: string };
      workExperience: { description: string; achievements: string[] }[];
      skills: { name: string; level?: string }[];
      education: { level?: string }[];
      workFormat?: string;
      employmentType?: string;
    };
    expect(payload.desiredPosition.value).toBe("Frontend Developer");
    expect(payload.workExperience[0].description).toBe("React development");
    expect(payload.workExperience[0].achievements).toEqual(["Reduced load time"]);
    expect(payload.skills[0]).toEqual({ name: "React", level: "advanced" });
    expect(payload.education[0].level).toBe("higher");

    // P10.1.4: workFormat/employmentType дошли без преобразования
    expect(payload.workFormat).toBe("remote");
    expect(payload.employmentType).toBe("full_time");

    // Immutability источника
    expect(after).toBe(before);
  });
});

// ---------- P10.2: RemoteAIGateway (client transport) ----------

describe("RemoteAIGateway (P10.2)", () => {
  it("POSTs payload+versionId to /api/ai/analyze and returns analysis", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const analysis = {
      id: "an-x", resumeId: "res-1", versionId: "v-1", provider: "mock",
      overallScore: 66, sections: [], summary: "ok", strengths: ["a"],
      weaknesses: [], recommendations: [], createdAt: "2026-01-01T00:00:00Z",
    };
    const fetchMock = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init: init ?? {} });
      return new Response(JSON.stringify({ ok: true, analysis }), { status: 200 });
    }) as unknown as typeof fetch;
    const original = globalThis.fetch;
    globalThis.fetch = fetchMock;

    try {
      const gw = new RemoteAIGateway();
      const input: ResumeAnalysisInput = {
        id: "r", candidateId: "c", title: "T",
        desiredPosition: confirmField("Dev"), summary: missingField(),
        location: missingField(), workExperience: [], education: [],
        skills: [{ name: "React", level: "beginner" }], languages: [],
        workFormat: "", employmentType: "",
        currentVersionId: "v-1", createdAt: NOW, updatedAt: NOW,
      };
      const result = await gw.analyzeResume(input, { versionId: "v-1" });

      expect(result).toEqual(analysis);
      expect(calls.length).toBe(1);
      expect(calls[0].url).toBe("/api/ai/analyze");
      expect(calls[0].init.method).toBe("POST");
      const body = JSON.parse(String(calls[0].init.body));
      expect(body.versionId).toBe("v-1");
      expect(Object.prototype.hasOwnProperty.call(body.input, "salaryExpectation")).toBe(false);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("server error -> AIAnalysisError preserving the server code (P10.3B)", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response(
      JSON.stringify({ ok: false, error: "AI-сервис временно недоступен", code: "provider_rate_limited" }),
      { status: 502 },
    )) as unknown as typeof fetch;
    try {
      const gw = new RemoteAIGateway();
      await expect(gw.analyzeResume({} as ResumeAnalysisInput)).rejects.toBeInstanceOf(AIAnalysisError);
    } finally {
      globalThis.fetch = original;
    }
  });
});

// ---------- P10.3B: transport preserves the machine-readable code ----------

describe("RemoteAIGateway error contract (P10.3B)", () => {
  async function captureError(status: number, body: unknown): Promise<unknown> {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response(
      typeof body === "string" ? body : JSON.stringify(body),
      { status },
    )) as unknown as typeof fetch;
    try {
      await new RemoteAIGateway().analyzeResume({} as ResumeAnalysisInput);
      throw new Error("expected analyzeResume to reject");
    } catch (error) {
      return error;
    } finally {
      globalThis.fetch = original;
    }
  }

  it("502 + provider_rate_limited -> code preserved", async () => {
    const error = await captureError(502, {
      ok: false, error: "AI-сервис временно недоступен", code: "provider_rate_limited",
    });
    expect(error).toBeInstanceOf(AIAnalysisError);
    expect((error as AIAnalysisError).code).toBe("provider_rate_limited");
    expect((error as AIAnalysisError).message).toBe("AI-сервис временно недоступен");
  });

  it("503 + ai_not_configured -> code preserved", async () => {
    const error = await captureError(503, {
      ok: false, error: "AI-анализ не настроен", code: "ai_not_configured",
    });
    expect((error as AIAnalysisError).code).toBe("ai_not_configured");
  });

  it("502 + provider_unavailable -> code preserved", async () => {
    const error = await captureError(502, {
      ok: false, error: "AI-сервис недоступен", code: "provider_unavailable",
    });
    expect((error as AIAnalysisError).code).toBe("provider_unavailable");
  });

  it("413 + input_too_large -> code preserved", async () => {
    const error = await captureError(413, {
      ok: false, error: "Резюме слишком большое для анализа", code: "input_too_large",
    });
    expect((error as AIAnalysisError).code).toBe("input_too_large");
  });

  it("429 + rate_limited -> code preserved (P10.5)", async () => {
    const error = await captureError(429, {
      ok: false, error: "Слишком много запросов на анализ. Попробуйте позже.", code: "rate_limited",
    });
    expect(error).toBeInstanceOf(AIAnalysisError);
    expect((error as AIAnalysisError).code).toBe("rate_limited");
  });

  it("response without code -> AIAnalysisError with undefined code", async () => {
    const error = await captureError(502, { ok: false, error: "что-то пошло не так" });
    expect(error).toBeInstanceOf(AIAnalysisError);
    expect((error as AIAnalysisError).code).toBeUndefined();
  });

  it("unrecognized code is not propagated as a known code", async () => {
    const error = await captureError(502, { ok: false, error: "x", code: "totally_new_code" });
    expect((error as AIAnalysisError).code).toBeUndefined();
  });

  it("failure without error text falls back to a safe generic message", async () => {
    const error = await captureError(502, { ok: false, code: "provider_error" });
    expect((error as AIAnalysisError).message).toBe("AI-сервис временно недоступен");
    expect((error as AIAnalysisError).code).toBe("provider_error");
  });
});

// ---------- P10.3B: orchestration surfaces the code in AnalysisOutcome ----------

describe("analyzeCurrentVersion error codes (P10.3B)", () => {
  function failingGateway(message: string, code?: AIErrorCode): AIGateway {
    return stubGateway(async () => { throw new AIAnalysisError(message, code); });
  }

  const serverCodes: AIErrorCode[] = [
    "ai_not_configured",
    "input_too_large",
    "invalid_input",
    "invalid_body",
    // P10.5: новый server code rate limit — контракт расширен, не заменён.
    "rate_limited",
    "provider_rate_limited",
    "provider_error",
    "provider_invalid_response",
    "provider_unavailable",
  ];

  it.each(serverCodes)("code %s reaches AnalysisOutcome", async (code) => {
    const record = makeRecord();
    const outcome = await analyzeCurrentVersion(record, failingGateway("санитизированный текст", code));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe(code);
    expect(outcome.error).toBe("санитизированный текст");
  });

  it("error without code -> safe generic fallback, no code", async () => {
    const record = makeRecord();
    const outcome = await analyzeCurrentVersion(record, failingGateway("что угодно"));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBeUndefined();
    expect(outcome.error).toBe("AI-сервис временно недоступен");
  });

  it("plain Error from a gateway -> generic fallback, technical text discarded", async () => {
    const record = makeRecord();
    const throwing = stubGateway(async () => { throw new Error("AI провайдер вернул HTTP 500 https://api.example/v1"); });

    const outcome = await analyzeCurrentVersion(record, throwing);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBeUndefined();
    expect(outcome.error).toBe("AI-сервис временно недоступен");
    expect(outcome.error).not.toContain("HTTP 500");
    expect(outcome.error).not.toContain("api.example");
  });

  it("nothing is persisted when the gateway fails with a server code", async () => {
    const record = makeRecord();
    const before = listAnalysesForResume(record.resume.id).length;

    await analyzeCurrentVersion(record, failingGateway("AI-анализ не настроен", "ai_not_configured"));

    expect(listAnalysesForResume(record.resume.id).length).toBe(before);
  });

  it("local orchestration failures stay code-free (not AI provider errors)", async () => {
    const record = makeRecord();

    // malformed AI result — локальная ошибка нормализации
    const malformed = await analyzeCurrentVersion(record, stubGateway(async () => ({ wrong: true }) as never));
    expect(malformed.ok).toBe(false);
    if (malformed.ok) return;
    expect(malformed.code).toBeUndefined();
    expect(malformed.error).toContain("некорректный");

    // отсутствует версия для анализа
    const emptyRecord = { ...record, versions: [] } as typeof record;
    const noVersion = await analyzeCurrentVersion(emptyRecord);
    expect(noVersion.ok).toBe(false);
    if (noVersion.ok) return;
    expect(noVersion.code).toBeUndefined();
    expect(noVersion.error).toBe("У резюме нет версии для анализа");
  });
});
