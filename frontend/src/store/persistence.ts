import { createJSONStorage, type StateStorage } from 'zustand/middleware';

/**
 * localStorage that never throws. Storage can be missing (tests, server rendering), blocked
 * (private windows, disabled site data) or full; in every case the app keeps working for the
 * session and simply forgets the inputs on reload.
 */
const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      return globalThis.localStorage?.getItem(name) ?? null;
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      globalThis.localStorage?.setItem(name, value);
    } catch {
      // Not persisted; the state is still held in memory.
    }
  },
  removeItem: (name) => {
    try {
      globalThis.localStorage?.removeItem(name);
    } catch {
      // Nothing to remove.
    }
  },
};

export const browserStorage = createJSONStorage(() => safeLocalStorage);

/** Keys are versioned by prefix so a schema change can drop old data instead of misreading it. */
export const storageKey = (store: string) => `mashkanta:${store}`;

/**
 * Row ids must stay unique across reloads, since persisted rows come back with theirs. A session
 * counter would restart at 1 and collide.
 */
export function uniqueId(prefix: string): string {
  const random =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}
