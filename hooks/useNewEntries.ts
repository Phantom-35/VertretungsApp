import { useEffect, useSyncExternalStore } from "react";
import { mergeSeenKeys } from "@/lib/seen";
import { schoolToday } from "@/lib/time";
import type { SubstitutionPayload } from "@/lib/types";

const SEEN_STORAGE_KEY = "kag:seen-entries";

/**
 * What the plan looked like when the user last opened the app. It stays fixed
 * while the app is in use, so that "Neu" badges do not vanish on the next
 * refresh, and is taken again after the app was in the background.
 */
let baseline: readonly string[] | null = null;
let needsBaseline = true;
/** "Neu" badges that were on screen long enough; they fade out. */
let acknowledged: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
const acknowledgedListeners = new Set<() => void>();
let acknowledgedPending: string[] = [];

function readStored(): string[] | null {
  try {
    const raw = window.localStorage.getItem(SEEN_STORAGE_KEY);
    const list: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(list) ? list.filter((item) => typeof item === "string") : null;
  } catch {
    return null;
  }
}

function onVisibilityChange() {
  if (document.visibilityState === "hidden") {
    needsBaseline = true;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}

/**
 * Keys of the entries the user had already seen (see `findNewKeys`), or null
 * on first use. Records the shown plan as seen.
 */
export function useSeenBaseline(data: SubstitutionPayload | null) {
  useEffect(() => {
    if (!data?.success) {
      return;
    }

    const stored = readStored();
    if (needsBaseline) {
      // Taken before the current plan is written below.
      baseline = stored;
      needsBaseline = false;
      acknowledged = new Set();
      acknowledgedListeners.forEach((listener) => listener());
      listeners.forEach((listener) => listener());
    }
    try {
      window.localStorage.setItem(
        SEEN_STORAGE_KEY,
        JSON.stringify(mergeSeenKeys(stored ?? [], data.entries, schoolToday(Date.now()))),
      );
    } catch {
      // Without storage there are simply no "Neu" badges.
    }
  }, [data]);

  return useSyncExternalStore(
    subscribe,
    () => baseline,
    () => null,
  );
}

/**
 * Marks a "Neu" badge as seen: it stays away until the app is opened again.
 * Badges fading at the same moment are applied together (one re-render).
 */
export function acknowledgeNewEntry(key: string) {
  if (acknowledged.has(key) || acknowledgedPending.includes(key)) {
    return;
  }
  acknowledgedPending.push(key);
  if (acknowledgedPending.length === 1) {
    queueMicrotask(() => {
      acknowledged = new Set([...acknowledged, ...acknowledgedPending]);
      acknowledgedPending = [];
      acknowledgedListeners.forEach((listener) => listener());
    });
  }
}

function subscribeAcknowledged(listener: () => void) {
  acknowledgedListeners.add(listener);
  return () => {
    acknowledgedListeners.delete(listener);
  };
}

/** Keys of the "Neu" badges already seen in this visit. */
export function useAcknowledgedEntries() {
  return useSyncExternalStore(
    subscribeAcknowledged,
    () => acknowledged,
    () => acknowledged,
  );
}
