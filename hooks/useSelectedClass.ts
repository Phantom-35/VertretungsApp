import { useCallback, useSyncExternalStore } from "react";
import { normalizeSelectedClass } from "@/lib/entries";

/** The student's own class (key kept from older versions of the app). */
export const MY_CLASS_STORAGE_KEY = "kag:selected-class";
/** A class only looked at, until the app is closed. */
export const VIEWED_CLASS_STORAGE_KEY = "kag:viewed-class";

type StorageKind = "localStorage" | "sessionStorage";

function classStore(kind: StorageKind, key: string) {
  // Fallback when the storage is unavailable (e.g. private mode).
  let memoryValue: string | null = null;
  const listeners = new Set<() => void>();

  const storage = () => window[kind];

  const subscribe = (listener: () => void) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) {
        listener();
      }
    };
    listeners.add(listener);
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  };

  const getSnapshot = () => {
    try {
      const stored = storage().getItem(key);
      return stored ? normalizeSelectedClass(stored) : memoryValue;
    } catch {
      return memoryValue;
    }
  };

  const set = (value: string | null) => {
    const normalized = value === null ? null : normalizeSelectedClass(value);
    if (value !== null && !normalized) {
      return;
    }
    memoryValue = normalized;
    try {
      if (normalized) {
        storage().setItem(key, normalized);
      } else {
        storage().removeItem(key);
      }
    } catch {
      // Keep the in-memory value.
    }
    listeners.forEach((listener) => listener());
  };

  return { subscribe, getSnapshot, set };
}

const myClassStore = classStore("localStorage", MY_CLASS_STORAGE_KEY);
const viewedClassStore = classStore("sessionStorage", VIEWED_CLASS_STORAGE_KEY);

const getServerSnapshot = () => undefined;

function useClassStore(store: ReturnType<typeof classStore>) {
  const value = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
  const set = useCallback((next: string | null) => store.set(next), [store]);
  return [value, set] as const;
}

/**
 * The student's own class: shown when the app opens and used for
 * notifications. `undefined` while not yet known (server render /
 * hydration), `null` if none has been chosen.
 */
export function useMyClass() {
  return useClassStore(myClassStore);
}

/**
 * Another class looked at on the main page, e.g. a sibling's. Only kept
 * until the app is closed; `null` shows the student's own class.
 */
export function useViewedClass() {
  return useClassStore(viewedClassStore);
}
