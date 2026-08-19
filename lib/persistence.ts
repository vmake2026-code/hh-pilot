/**
 * Persistence abstraction.
 *
 * The app never reads localStorage directly. All state goes through this
 * interface so the implementation can be swapped for a real backend later.
 */

interface PersistenceStore<T> {
  get(key: string): T | null;
  set(key: string, value: T): void;
  remove(key: string): void;
}

// ---------- In-memory (dev / SSR-safe default) ----------

class InMemoryStore<T> implements PersistenceStore<T> {
  private data = new Map<string, T>();

  get(key: string): T | null {
    return this.data.get(key) ?? null;
  }

  set(key: string, value: T): void {
    this.data.set(key, value);
  }

  remove(key: string): void {
    this.data.delete(key);
  }
}

// ---------- localStorage wrapper (browser only, optional) ----------

class LocalStorageStore<T> implements PersistenceStore<T> {
  private prefix: string;

  constructor(prefix: string = "rp:") {
    this.prefix = prefix;
  }

  get(key: string): T | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(this.prefix + key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  set(key: string, value: T): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(this.prefix + key, JSON.stringify(value));
    } catch {
      // quota exceeded or private browsing — silently ignore
    }
  }

  remove(key: string): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(this.prefix + key);
    } catch {
      // ignore
    }
  }
}

// ---------- Factory ----------

function createPersistenceStore<T>(): PersistenceStore<T> {
  if (typeof window !== "undefined") {
    return new LocalStorageStore<T>();
  }
  return new InMemoryStore<T>();
}

export type { PersistenceStore, LocalStorageStore };
export { createPersistenceStore, InMemoryStore };
