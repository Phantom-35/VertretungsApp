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
import { DEFAULT_NEXT_DAY_HOUR } from "@/lib/time";

export type Settings = {
  /** From this hour on the next day is shown by default; 0 = always, 24 = never. */
  nextDayHour: number;
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

/** "Heute" (24: today until the day is over) or "Ab 16 Uhr morgen" (16). */
export const NEXT_DAY_HOURS = [24, 16] as const;

const DEFAULTS: Settings = {
  nextDayHour: DEFAULT_NEXT_DAY_HOUR,
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

/**
 * The hour from which the next day is shown: today (24) or from 16:00 on.
 * Earlier versions offered more ("Immer" = 0, 14, 15, 17 Uhr); "Immer" now
 * means today, any hour means 16:00. The older field "nextDayFromHour" had
 * 16 as its default, saved along with any other setting: a stored 16 there
 * is that default, not a choice, and means today.
 */
function readNextDayHour(stored: Partial<Settings> & { nextDayFromHour?: unknown }) {
  const fromHour = (value: unknown) =>
    typeof value === "number" && value > 0 && value < 24 ? 16 : DEFAULT_NEXT_DAY_HOUR;
  if (typeof stored.nextDayHour === "number") {
    return fromHour(stored.nextDayHour);
  }
  const old = stored.nextDayFromHour;
  return old === 16 ? DEFAULT_NEXT_DAY_HOUR : fromHour(old);
}

function parse(raw: string | null): Settings {
  try {
    const stored = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    return {
      nextDayHour: readNextDayHour(stored),
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
