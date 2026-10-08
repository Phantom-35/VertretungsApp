import { useCallback, useSyncExternalStore } from "react";
import { normalizeSelectedClass } from "@/lib/entries";

const CLASS_STORAGE_KEY = "kag:selected-class";

// Fallback when localStorage is unavailable (e.g. private mode).
let memoryValue: string | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === CLASS_STORAGE_KEY) {
      listener();
    }
  };

  listeners.add(listener);
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot() {
  try {
    const stored = window.localStorage.getItem(CLASS_STORAGE_KEY);
    return stored ? normalizeSelectedClass(stored) : memoryValue;
  } catch {
    return memoryValue;
  }
}

function getServerSnapshot() {
  return undefined;
}

/**
 * The user's class, persisted in localStorage.
 * `undefined` while not yet known (server render / hydration), `null` if the
 * user has not picked a class yet.
 */
export function useSelectedClass() {
  const selectedClass = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const setSelectedClass = useCallback((value: string) => {
    const normalized = normalizeSelectedClass(value);
    if (!normalized) {
      return;
    }

    memoryValue = normalized;
    try {
      window.localStorage.setItem(CLASS_STORAGE_KEY, normalized);
    } catch {
      // Keep the in-memory value.
    }
    listeners.forEach((listener) => listener());
  }, []);

  return [selectedClass, setSelectedClass] as const;
}
