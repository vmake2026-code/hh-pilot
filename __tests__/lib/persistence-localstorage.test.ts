import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createPersistenceStore, InMemoryStore } from "@/lib/persistence";
import type { PersistenceStore } from "@/lib/persistence";

// Minimal Storage shape used by LocalStorageStore.
type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function stubWindow(localStorage: StorageLike): void {
  (globalThis as unknown as { window?: unknown }).window = { localStorage };
}

function unstubWindow(): void {
  delete (globalThis as unknown as { window?: unknown }).window;
}

/** In-memory Storage fake with an optional failure injection for setItem. */
function makeFakeStorage(options: { failSetWith?: () => Error } = {}) {
  const data = new Map<string, string>();
  return {
    data,
    getItem(key: string): string | null {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      if (options.failSetWith) throw options.failSetWith();
      data.set(key, value);
    },
    removeItem(key: string): void {
      data.delete(key);
    },
  };
}

describe("createPersistenceStore under Node (SSR parity)", () => {
  it("returns an in-memory store when window is undefined", () => {
    const store = createPersistenceStore<string>();
    expect(store).toBeInstanceOf(InMemoryStore);
  });

  it("supports get/set/remove roundtrip and starts empty", () => {
    const store = createPersistenceStore<{ v: number }>();
    expect(store.get("k")).toBeNull();
    store.set("k", { v: 1 });
    expect(store.get("k")).toEqual({ v: 1 });
    store.remove("k");
    expect(store.get("k")).toBeNull();
  });

  it("keeps instances isolated", () => {
    const a = createPersistenceStore<string>();
    const b = createPersistenceStore<string>();
    a.set("shared", "from-a");
    expect(b.get("shared")).toBeNull();
  });
});

describe("LocalStorageStore in browser mode", () => {
  let storage: ReturnType<typeof makeFakeStorage>;
  let store: PersistenceStore<{ n: number }>;

  beforeEach(() => {
    storage = makeFakeStorage();
    stubWindow(storage);
    store = createPersistenceStore<{ n: number }>();
  });

  afterEach(() => {
    unstubWindow();
  });

  it("does not return InMemoryStore", () => {
    expect(store).not.toBeInstanceOf(InMemoryStore);
  });

  it("successful set behaves exactly as before: JSON write under rp: prefix", () => {
    store.set("entry", { n: 42 });
    expect(storage.data.get("rp:entry")).toBe('{"n":42}');
    expect(store.get("entry")).toEqual({ n: 42 });
  });

  it("get returns null for missing keys", () => {
    expect(store.get("missing")).toBeNull();
  });

  it("remove deletes the underlying key", () => {
    store.set("entry", { n: 1 });
    store.remove("entry");
    expect(storage.data.has("rp:entry")).toBe(false);
    expect(store.get("entry")).toBeNull();
  });
});

describe("LocalStorageStore.set error contract", () => {
  afterEach(() => {
    unstubWindow();
  });

  it("propagates QuotaExceededError instead of swallowing it", () => {
    const quotaError = Object.assign(new Error("quota exceeded"), {
      name: "QuotaExceededError",
    });
    stubWindow(makeFakeStorage({ failSetWith: () => quotaError }));
    const store = createPersistenceStore<string>();

    expect(() => store.set("k", "v")).toThrowError(quotaError);
  });

  it("propagates SecurityError when storage is blocked", () => {
    const securityError = Object.assign(new Error("storage blocked"), {
      name: "SecurityError",
    });
    stubWindow(makeFakeStorage({ failSetWith: () => securityError }));
    const store = createPersistenceStore<string>();

    expect(() => store.set("k", "v")).toThrowError(securityError);
  });
});
