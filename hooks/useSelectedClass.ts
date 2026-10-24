import { useCallback, useSyncExternalStore } from "react";
import { normalizeSelectedClass } from "@/lib/entries";
import { schoolToday } from "@/lib/time";

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

/** Away from the app this long counts as opening it anew. */
const AWAY_MS = 30 * 60_000;
const DAY_CHECK_MS = 60_000;

/**
 * A class only looked at is forgotten when the app is opened anew: installed
 * apps often stay alive in the background for days (and keep their session
 * storage), so "until the app is closed" alone would show a sibling's class
 * the next morning. Anew means after half an hour away, or on another day.
 */
function forgetViewedClassWhenAway(set: (value: string | null) => void) {
  let since = Date.now();
  const forgetIfAnew = (away: boolean) => {
    const now = Date.now();
    if ((away && now - since >= AWAY_MS) || schoolToday(now) !== schoolToday(since)) {
      set(null);
    }
    since = now;
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      forgetIfAnew(true);
    } else {
      since = Date.now();
    }
  };
  // Left on screen overnight (e.g. a tablet): the next day starts fresh too.
  const timer = window.setInterval(() => {
    if (document.visibilityState === "visible") {
      forgetIfAnew(false);
    }
  }, DAY_CHECK_MS);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

const subscribeViewed = (listener: () => void) => {
  const unsubscribe = viewedClassStore.subscribe(listener);
  const stopForgetting = forgetViewedClassWhenAway(viewedClassStore.set);
  return () => {
    unsubscribe();
    stopForgetting();
  };
};

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
 * until the app is closed or opened anew (see forgetViewedClassWhenAway);
 * `null` shows the student's own class.
 */
export function useViewedClass() {
  const value = useSyncExternalStore(subscribeViewed, viewedClassStore.getSnapshot, getServerSnapshot);
  const set = useCallback((next: string | null) => viewedClassStore.set(next), []);
  return [value, set] as const;
}
