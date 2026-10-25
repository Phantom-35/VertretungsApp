import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_EVENING_SUMMARY_TIME,
  DEFAULT_MORNING_SUMMARY_TIME,
  EVENING_SUMMARY_TIMES,
  MORNING_SUMMARY_TIMES,
  NOTIFY_GROUPS,
  parseNotifyGroups,
  parseSummaryTime,
  type EveningSummaryTime,
  type MorningSummaryTime,
  type NotifyGroup,
} from "@/lib/notify";
import { SETTINGS_STORAGE_KEY } from "@/lib/theme";
import { NEXT_DAY_FROM_HOUR } from "@/lib/time";

export type Settings = {
  /** From this hour on the next day is shown by default; 0 = always, 24 = never. */
  nextDayFromHour: number;
  /** "Neu" badges for changes since the last visit. */
  showNewBadges: boolean;
  /** "Wo ist das?" next to the rooms, opening the room plan. */
  roomPlanButton: boolean;
  textSize: TextSize;
  /** Kinds of changes push notifications are sent for. */
  notifyGroups: NotifyGroup[];
  /** Summary of the next school day in the evening. */
  eveningSummary: boolean;
  /** Summary of the day in the morning. */
  morningSummary: boolean;
  /** When the summaries come, e.g. "19:00" and "06:30". */
  eveningSummaryTime: EveningSummaryTime;
  morningSummaryTime: MorningSummaryTime;
};

export type TextSize = "normal" | "large";

/** Root font size per text size; everything is sized in rem. */
export const TEXT_SIZES: Record<TextSize, string> = { normal: "", large: "112.5%" };

export const NEXT_DAY_HOURS = [0, 14, 15, 16, 17, 24] as const;

const DEFAULTS: Settings = {
  nextDayFromHour: NEXT_DAY_FROM_HOUR,
  showNewBadges: true,
  roomPlanButton: true,
  textSize: "normal",
  notifyGroups: [...NOTIFY_GROUPS],
  eveningSummary: false,
  morningSummary: false,
  eveningSummaryTime: DEFAULT_EVENING_SUMMARY_TIME,
  morningSummaryTime: DEFAULT_MORNING_SUMMARY_TIME,
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
      // On for everyone; the earlier "roomPlan" (a yes/no question) no longer counts.
      roomPlanButton: stored.roomPlanButton !== false,
      textSize: stored.textSize === "large" ? "large" : "normal",
      notifyGroups: parseNotifyGroups(stored.notifyGroups) ?? DEFAULTS.notifyGroups,
      eveningSummary: stored.eveningSummary === true,
      morningSummary: stored.morningSummary === true,
      eveningSummaryTime: parseSummaryTime(stored.eveningSummaryTime, EVENING_SUMMARY_TIMES, DEFAULT_EVENING_SUMMARY_TIME),
      morningSummaryTime: parseSummaryTime(stored.morningSummaryTime, MORNING_SUMMARY_TIMES, DEFAULT_MORNING_SUMMARY_TIME),
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
    window.__kagFontSize = TEXT_SIZES[next.textSize];
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
