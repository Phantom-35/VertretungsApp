import type { TellMaintainer } from "@/lib/alert";
import { holidayDataProblem, isSchoolDay, schoolDaysOffNote } from "@/lib/holidays";
import type { PushStore } from "@/lib/push/store";
import { ROOM_PLAN_EDITION, ROOM_PLAN_SCHOOL_YEAR } from "@/lib/rooms";
import { entryKey, type KeyedEntry } from "@/lib/seen";
import { daysBetween, schoolHour, schoolToday } from "@/lib/time";

/*
 * What the push check (every 10 minutes, with the database) also keeps an
 * eye on for the maintainer (never shown to users):
 *
 * 1. A plan that reads without errors but holds (almost) nothing on school
 *    days. Each page has its own self-check (lib/scraper.ts); this catches
 *    what it cannot see, e.g. the school's export changing so that the rows
 *    are no longer found at all. Compared with the usual number of entries
 *    of recent school days, reported once it has lasted a while.
 * 2. Data to add for a new school year (holidays, days off, room plan),
 *    as a reminder once a week until it is done.
 * 3. A weekly report of how many devices have notifications switched on.
 */

/**
 * What the watch keeps (JSON `WatchState`), in one value so that the many
 * checks without anything to do read just one more key: the entries per
 * school day of recent checks (what is usual), and since when the plan looks
 * too empty.
 */
export const WATCH_META = "plan-watch";
/** The day the last reminder went out. */
const REMINDER_META = "reminder-day";

const KEEP_DAYS = 10;
/** With fewer recorded school days, only a plan with no entries at all counts as empty. */
const MIN_HISTORY = 5;
/** Too empty: every school day in the plan below this share of the usual count. */
const SPARSE_SHARE = 0.1;
/** An empty plan for a short while is an upload in progress: reported after this long. */
export const SPARSE_WAIT_MS = 2 * 60 * 60_000;

const REMINDER_EVERY_DAYS = 7;
/** Reminders only in the daytime. */
const REMINDER_FROM_HOUR = 9;
const REMINDER_UNTIL_HOUR = 18;

type Counts = Record<string, number>;
export type SparseState = { since: string; alerted?: boolean };
type WatchState = { counts: Counts; sparse?: SparseState };

function parseJson<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as T) : null;
  } catch {
    return null;
  }
}

function parseWatchState(value: string | null): WatchState {
  const state = parseJson<Partial<WatchState>>(value);
  const counts = state?.counts && typeof state.counts === "object" ? state.counts : {};
  const sparse = state?.sparse && typeof state.sparse.since === "string" ? state.sparse : undefined;
  return { counts, ...(sparse ? { sparse } : {}) };
}

/** Since when the plan looks too empty, from the stored value (see WATCH_META). */
export const parseSparseState = (value: string | null) => parseWatchState(value).sparse ?? null;

/** Entries (each row once) per school day of the plan, today and later. */
export function countSchoolDays(entries: readonly KeyedEntry[], dates: readonly string[], today: string): Counts {
  const counts: Counts = {};
  for (const date of dates) {
    if (date >= today && isSchoolDay(date)) {
      counts[date] = 0;
    }
  }
  for (const key of new Set(entries.map(entryKey))) {
    const date = key.slice(0, key.indexOf("|"));
    if (date in counts) {
      counts[date] += 1;
    }
  }
  return counts;
}

/** The usual number of entries on a school day (median), or null without enough history. */
export function usualCount(history: Counts) {
  const values = Object.values(history).sort((left, right) => left - right);
  if (values.length < MIN_HISTORY) {
    return null;
  }
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 1 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

/** Every school day in the plan far below the usual count (or empty without history). */
export function isSparse(current: Counts, history: Counts) {
  const days = Object.values(current);
  if (days.length === 0) {
    return false;
  }
  const usual = usualCount(history);
  const below = usual === null ? 1 : Math.max(1, Math.floor(usual * SPARSE_SHARE));
  return days.every((count) => count < below);
}

/** The highest count seen per day, for the most recent days. */
function mergeCounts(history: Counts, current: Counts): Counts {
  const merged = { ...history };
  for (const [date, count] of Object.entries(current)) {
    merged[date] = Math.max(merged[date] ?? 0, count);
  }
  return Object.fromEntries(
    Object.entries(merged)
      .sort(([left], [right]) => right.localeCompare(left))
      .slice(0, KEEP_DAYS),
  );
}

export type WatchResult = "ok" | "sparse" | "alerted" | "recovered";

/** Watches the plan's size (point 1 above). Call with a complete plan only. */
export async function watchPlanSize(
  store: PushStore,
  plan: { entries: readonly KeyedEntry[]; dates: readonly string[] },
  now: number,
  tell: TellMaintainer,
): Promise<WatchResult> {
  const today = schoolToday(now);
  const current = countSchoolDays(plan.entries, plan.dates, today);
  const stored = await store.getMeta(WATCH_META);
  const previous = parseWatchState(stored);
  const { counts: history, sparse: state } = previous;
  const save = async (next: WatchState) => {
    const value = JSON.stringify(next);
    // Most checks change nothing: nothing to write then.
    if (value !== JSON.stringify(previous)) {
      await store.setMeta(WATCH_META, value);
    }
  };

  if (!isSparse(current, history)) {
    // Recorded only while the plan looks right: an empty plan must not
    // become what is usual.
    await save({ counts: mergeCounts(history, current) });
    if (state?.alerted) {
      await tell("Der Plan hat wieder so viele Einträge wie üblich.", "warning");
      return "recovered";
    }
    return "ok";
  }

  if (!state) {
    await save({ counts: history, sparse: { since: new Date(now).toISOString() } });
    return "sparse";
  }
  if (state.alerted || now - Date.parse(state.since) < SPARSE_WAIT_MS) {
    return "sparse";
  }
  const usual = usualCount(history);
  const days = Object.entries(current)
    .map(([date, count]) => `${date.slice(8, 10)}.${date.slice(5, 7)}.: ${count}`)
    .join(", ");
  const sent = await tell(
    `Der Plan ist seit über ${SPARSE_WAIT_MS / 3_600_000} Stunden auffällig leer (${days} Einträge${
      usual !== null ? `, üblich sind etwa ${Math.round(usual)}` : ""
    }). Vielleicht hat die Schule das Format geändert – bitte den Plan auf der Schulseite mit der App vergleichen. Ist dort wirklich kaum etwas eingetragen, ist alles in Ordnung.`,
    "warning",
  );
  if (sent) {
    await save({ counts: history, sparse: { ...state, alerted: true } });
    return "alerted";
  }
  return "sparse";
}

/** For /api/health: the plan has looked too empty for a while. */
export function sparseProblem(state: SparseState | null, now: number) {
  if (!state || now - Date.parse(state.since) < SPARSE_WAIT_MS) {
    return null;
  }
  const hours = Math.floor((now - Date.parse(state.since)) / 3_600_000);
  return `Plan seit ${hours} Stunden auffällig leer (Format der Schulseite geändert?).`;
}

/** The school year (its first year) a day belongs to: a new one starts on 1 August. */
function schoolYearOf(today: string) {
  const year = Number(today.slice(0, 4));
  return Number(today.slice(5, 7)) >= 8 ? year : year - 1;
}

/** Once the school year of the room plan is over: a reminder to draw the new one. */
export function roomPlanNote(today: string, planYear = ROOM_PLAN_SCHOOL_YEAR) {
  return schoolYearOf(today) > planYear
    ? `Raumplan und Klassenräume fürs neue Schuljahr eintragen (in der App ist noch der ${ROOM_PLAN_EDITION}; lib/rooms.ts, lib/class-rooms.ts, neuer Raumplan-Aushang der Schule).`
    : null;
}

/** What to add for the new school year, if anything. */
export function yearlyDataReminders(today: string) {
  return [holidayDataProblem(today), schoolDaysOffNote(today), roomPlanNote(today)].filter(
    (note): note is string => note !== null,
  );
}

/** Sends the reminders (point 2 above) once a week, in the daytime, while any are left. */
export async function sendReminders(store: PushStore, now: number, tell: TellMaintainer) {
  const hour = schoolHour(now);
  if (hour < REMINDER_FROM_HOUR || hour >= REMINDER_UNTIL_HOUR) {
    return false;
  }
  const today = schoolToday(now);
  const reminders = yearlyDataReminders(today);
  if (reminders.length === 0) {
    return false;
  }
  const last = await store.getMeta(REMINDER_META);
  if (last && daysBetween(last, today) < REMINDER_EVERY_DAYS) {
    return false;
  }
  const sent = await tell(
    `Bitte fürs neue Schuljahr nachtragen lassen (z. B. in einer Claude-Sitzung):\n${reminders.map((item) => `• ${item}`).join("\n")}`,
    "reminder",
  );
  if (sent) {
    await store.setMeta(REMINDER_META, today);
  }
  return sent;
}

/** The devices counted for the last weekly report (JSON `DeviceReport`). */
const DEVICE_REPORT_META = "device-report";
/** The weekly report goes out on Mondays (1), in the daytime. */
const DEVICE_REPORT_WEEKDAY = 1;

type DeviceReport = { day: string; count: number };

/** " (+5 seit letzter Woche)", " (unverändert seit dem 02.11.)", or "" for the first report. */
function deviceChange(count: number, previous: DeviceReport | null, today: string) {
  if (!previous || typeof previous.count !== "number" || typeof previous.day !== "string") {
    return "";
  }
  const since =
    daysBetween(previous.day, today) <= 7
      ? "seit letzter Woche"
      : `seit dem ${previous.day.slice(8, 10)}.${previous.day.slice(5, 7)}.`;
  const difference = count - previous.count;
  return difference === 0
    ? ` (unverändert ${since})`
    : ` (${difference > 0 ? "+" : "−"}${Math.abs(difference)} ${since})`;
}

/**
 * Once a week (Monday, daytime) the number of devices with notifications
 * switched on, to the maintainer only. A count, nothing about anyone. On
 * other days nothing is read, so the checks stay as cheap as before.
 */
export async function sendDeviceReport(store: PushStore, now: number, tell: TellMaintainer) {
  const hour = schoolHour(now);
  const today = schoolToday(now);
  if (
    new Date(`${today}T12:00:00Z`).getUTCDay() !== DEVICE_REPORT_WEEKDAY ||
    hour < REMINDER_FROM_HOUR ||
    hour >= REMINDER_UNTIL_HOUR
  ) {
    return false;
  }
  const previous = parseJson<DeviceReport>(await store.getMeta(DEVICE_REPORT_META));
  if (previous?.day === today) {
    return false;
  }
  const count = await store.countSubscribers();
  const sent = await tell(
    `Wochenbericht: ${count === 1 ? "1 Gerät hat" : `${count} Geräte haben`} Benachrichtigungen eingeschaltet${deviceChange(count, previous, today)}.`,
    "reminder",
  );
  if (sent) {
    await store.setMeta(DEVICE_REPORT_META, JSON.stringify({ day: today, count } satisfies DeviceReport));
  }
  return sent;
}
