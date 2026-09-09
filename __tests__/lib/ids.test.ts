import { describe, it, expect } from "vitest";

// P30: generateId — до этого ни одного прямого теста; fallback-ветка
// (без crypto.randomUUID) вообще никогда не исполнялась в тестах.

import { generateId } from "../../lib/ids";

describe("generateId (P30 direct coverage)", () => {
  it("returns a unique non-empty string on every call", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const id = generateId();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
      ids.add(id);
    }
    expect(ids.size).toBe(1000);
  });

  it("UUID path (crypto.randomUUID available in Node 22) produces valid UUID format", () => {
    const id = generateId();
    // Node 18+ имеет crypto.randomUUID — основная ветка в тест-окружении
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("non-crypto fallback path: still unique and URL-safe", () => {
    // Исполняем fallback-ветку напрямую: удаляем crypto.randomUUID
    // через подмену глобального объекта в изолированном дочернем вычислении.
    // generateId читает глобальный crypto при каждом вызове.
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");

    const fakeNoRandomUUID = {};
    Object.defineProperty(globalThis, "crypto", {
      value: fakeNoRandomUUID,
      configurable: true,
      writable: true,
    });
    try {
      const ids = new Set<string>();
      for (let i = 0; i < 200; i++) {
        ids.add(generateId());
      }
      expect(ids.size).toBe(200);
      for (const id of ids) {
        // base36: буквы-цифры и дефис-разделитель
        expect(id).toMatch(/^[0-9a-z]+-[0-9a-z]+$/);
      }
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, "crypto", originalDescriptor);
      }
    }
  });
});
