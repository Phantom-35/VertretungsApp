import { useCallback, useSyncExternalStore } from "react";

/** Set once the introduction was seen; "Zurücksetzen" shows it again. */
export const ONBOARDED_STORAGE_KEY = "kag:onboarded";

let memoryDone = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function getSnapshot() {
  try {
    return memoryDone || window.localStorage.getItem(ONBOARDED_STORAGE_KEY) !== null;
  } catch {
    return memoryDone;
  }
}

// Not shown in the server-rendered page: only the device knows.
const getServerSnapshot = () => true;

function store(done: boolean) {
  memoryDone = done;
  try {
    if (done) {
      window.localStorage.setItem(ONBOARDED_STORAGE_KEY, "1");
    } else {
      window.localStorage.removeItem(ONBOARDED_STORAGE_KEY);
    }
  } catch {
    // Keep the in-memory value.
  }
  listeners.forEach((listener) => listener());
}

/** Whether the introduction has been seen on this device. */
export function useOnboarding() {
  const done = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const finish = useCallback(() => store(true), []);
  const restart = useCallback(() => store(false), []);
  return { done, finish, restart };
}
