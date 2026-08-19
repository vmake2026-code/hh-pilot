import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryStore } from "../../lib/persistence";
import type { Vacancy } from "../../types/vacancy";

function makeVacancy(id: string): Vacancy {
  return {
    id,
    title: `Vacancy ${id}`,
    company: `Company ${id}`,
    description: `Description ${id}`,
    requirements: [],
    skills: ["React"],
    responsibilities: [],
    location: "Москва",
    source: "text",
    fetchedAt: "2026-01-01T00:00:00Z",
  };
}

describe("Vacancy persistence (InMemoryStore)", () => {
  const store = new InMemoryStore<Vacancy>();

  beforeEach(() => {
    store.remove("vac:v1");
    store.remove("vac:v2");
  });

  it("saves and retrieves a vacancy", () => {
    const v = makeVacancy("v1");
    store.set("vac:v1", v);
    const retrieved = store.get("vac:v1");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe("v1");
    expect(retrieved!.title).toBe("Vacancy v1");
  });

  it("returns null for non-existent vacancy", () => {
    expect(store.get("vac:nonexistent")).toBeNull();
  });

  it("handles multiple vacancies", () => {
    store.set("vac:v1", makeVacancy("v1"));
    store.set("vac:v2", makeVacancy("v2"));
    expect(store.get("vac:v1")!.id).toBe("v1");
    expect(store.get("vac:v2")!.id).toBe("v2");
  });

  it("removes a vacancy", () => {
    store.set("vac:v1", makeVacancy("v1"));
    store.remove("vac:v1");
    expect(store.get("vac:v1")).toBeNull();
  });

  it("preserves vacancy data including skills", () => {
    const v = makeVacancy("v1");
    v.skills = ["React", "TypeScript", "Node.js"];
    store.set("vac:v1", v);
    const retrieved = store.get("vac:v1")!;
    expect(retrieved.skills).toEqual(["React", "TypeScript", "Node.js"]);
  });
});
