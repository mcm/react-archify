// Archify persists reader preferences (theme, notes rail, motion) in
// localStorage so they carry to the next artifact. Embedded, props own the
// theme and notes placement, so each instance reads from a private store
// seeded from props. Other preferences can opt into real localStorage.

export interface StorageOptions {
  /** Values the props pin; reads return these and writes never reach the page. */
  pinned: Record<string, string | null>;
  /** Back unpinned keys with window.localStorage, as standalone Archify does. */
  persist: boolean;
}

export class InstanceStorage implements Storage {
  private readonly memory = new Map<string, string>();
  private options: StorageOptions;

  constructor(options: StorageOptions) {
    this.options = options;
  }

  configure(options: StorageOptions): void {
    this.options = options;
  }

  /** Forget a value the viewer wrote, so the pinned or default value applies again. */
  forget(key: string): void {
    this.memory.delete(key);
  }

  get length(): number {
    return this.keys().length;
  }

  key(index: number): string | null {
    return this.keys()[index] ?? null;
  }

  getItem(key: string): string | null {
    if (Object.prototype.hasOwnProperty.call(this.options.pinned, key)) return this.options.pinned[key];
    if (this.memory.has(key)) return this.memory.get(key) ?? null;
    if (this.options.persist) {
      try { return window.localStorage.getItem(key); } catch { return null; }
    }
    return null;
  }

  setItem(key: string, value: string): void {
    if (Object.prototype.hasOwnProperty.call(this.options.pinned, key)) return;
    this.memory.set(key, String(value));
    if (this.options.persist) {
      try { window.localStorage.setItem(key, String(value)); } catch { /* storage may be blocked */ }
    }
  }

  removeItem(key: string): void {
    this.memory.delete(key);
    if (this.options.persist && !Object.prototype.hasOwnProperty.call(this.options.pinned, key)) {
      try { window.localStorage.removeItem(key); } catch { /* storage may be blocked */ }
    }
  }

  clear(): void {
    this.memory.clear();
  }

  private keys(): string[] {
    return [...new Set([...Object.keys(this.options.pinned), ...this.memory.keys()])];
  }
}
