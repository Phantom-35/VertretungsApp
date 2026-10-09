import { useCallback, useSyncExternalStore } from "react";

const EMPTY: readonly string[] = [];

// Fallback when localStorage is unavailable (e.g. private mode).
const memory = new Map<string, string>();
// Keeps the snapshot identical while the stored text is unchanged.
const parsed = new Map<string, { raw: string | null; value: readonly string[] }>();
const listeners = new Set<() => void>();

function readRaw(key: string) {
  try {
    return window.localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

function read(key: string): readonly string[] {
  const raw = readRaw(key);
  const cached = parsed.get(key);
  if (cached && cached.raw === raw) {
    return cached.value;
  }

  let value: readonly string[] = EMPTY;
  try {
    const list: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(list)) {
      value = list.filter((item): item is string => typeof item === "string");
    }
  } catch {
    // Broken entry: treat as empty.
  }
  parsed.set(key, { raw, value });
  return value;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function getServerSnapshot() {
  return EMPTY;
}

/** A list of strings persisted on this device (empty during server rendering). */
export function useStoredList(key: string) {
  const getSnapshot = useCallback(() => read(key), [key]);
  const list = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setList = useCallback(
    (value: readonly string[]) => {
      const raw = JSON.stringify(value);
      memory.set(key, raw);
      try {
        window.localStorage.setItem(key, raw);
      } catch {
        // Keep the in-memory value.
      }
      listeners.forEach((listener) => listener());
    },
    [key],
  );

  return [list, setList] as const;
}
