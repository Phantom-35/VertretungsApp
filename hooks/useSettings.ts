import { useCallback, useSyncExternalStore } from "react";
import { SETTINGS_STORAGE_KEY } from "@/lib/theme";
import { NEXT_DAY_FROM_HOUR } from "@/lib/time";

export type Settings = {
  /** From this hour on the next day is shown by default; 0 = always, 24 = never. */
  nextDayFromHour: number;
  /** "Neu" badges for changes since the last visit. */
  showNewBadges: boolean;
  textSize: TextSize;
};

export type TextSize = "normal" | "large";

/** Root font size per text size; everything is sized in rem. */
export const TEXT_SIZES: Record<TextSize, string> = { normal: "", large: "112.5%" };

export const NEXT_DAY_HOURS = [0, 14, 15, 16, 17, 24] as const;

const DEFAULTS: Settings = {
  nextDayFromHour: NEXT_DAY_FROM_HOUR,
  showNewBadges: true,
  textSize: "normal",
};
const STORAGE_KEY = SETTINGS_STORAGE_KEY;

const listeners = new Set<() => void>();
// Fallback when localStorage is unavailable (e.g. private mode).
let memoryValue: string | null = null;
// Keeps the snapshot identical while the stored text is unchanged.
let cached: { raw: string | null; value: Settings } = { raw: null, value: DEFAULTS };

function parse(raw: string | null): Settings {
  try {
    const stored = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    return {
      nextDayFromHour: NEXT_DAY_HOURS.includes(stored.nextDayFromHour as never)
        ? (stored.nextDayFromHour as number)
        : DEFAULTS.nextDayFromHour,
      showNewBadges:
        typeof stored.showNewBadges === "boolean" ? stored.showNewBadges : DEFAULTS.showNewBadges,
      textSize: stored.textSize === "large" ? "large" : "normal",
    };
  } catch {
    return DEFAULTS;
  }
}

function getSnapshot() {
  let raw = memoryValue;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY) ?? memoryValue;
  } catch {
    // Use the in-memory value.
  }
  if (raw !== cached.raw) {
    cached = { raw, value: parse(raw) };
  }
  return cached.value;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Preferences kept on this device. */
export function useSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULTS);

  const update = useCallback((changes: Partial<Settings>) => {
    const next = { ...getSnapshot(), ...changes };
    const raw = JSON.stringify(next);
    document.documentElement.style.fontSize = TEXT_SIZES[next.textSize];
    memoryValue = raw;
    try {
      window.localStorage.setItem(STORAGE_KEY, raw);
    } catch {
      // Keep the in-memory value.
    }
    listeners.forEach((listener) => listener());
  }, []);

  return [settings, update] as const;
}
