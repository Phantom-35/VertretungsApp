import {
  displayType,
  entryAppliesToClass,
  entryMatchesTeachers,
  getEntryKind,
  isCourseClass,
  isOpenSubstitute,
  lessonStart,
  timetableSlot,
} from "@/lib/entries";
import { formatShortDate, relativeDayLabel } from "@/lib/format";
import type { KeyedEntry } from "@/lib/seen";
import { entrySymbol, lessonLabel, teacherLabel } from "@/lib/share";
import {
  EVENING_SUMMARY_TIMES,
  MORNING_SUMMARY_TIMES,
  notifyGroupOf,
  timeToMinutes,
  type NotifyGroup,
} from "@/lib/notify";
import { NEXT_DAY_FROM_HOUR, daysBetween, schoolHour, schoolMinutes, schoolToday } from "@/lib/time";
import type { PlanDiff } from "@/lib/push/diff";

export type Change =
  | { kind: "added"; entry: KeyedEntry }
  | { kind: "removed"; entry: KeyedEntry }
  | { kind: "changed"; entry: KeyedEntry; previous: KeyedEntry };

export type PushPayload = {
  title: string;
  body: string;
  /** Opened when the notification is tapped. */
  url: string;
  /** Number shown on the app icon, where supported. */
  badgeCount?: number;
  /**
   * "add" (default): the count adds to changes not seen yet. "set": the
   * icon shows at least this count (summaries repeat known changes).
   */
  badgeMode?: "add" | "set";
  tag?: string;
};

/** Notifications list at most this many changes; the rest is counted. */
const MAX_LINES = 4;

export type Audience = {
  schoolClass: string;
  teachers: readonly string[];
  /** Kinds of changes to notify about; all when missing. */
  notifyGroups?: readonly NotifyGroup[];
};

/**
 * Whether a change matters to a subscriber: their class (and courses, in the
 * upper school), and a day still ahead. Today only counts until school is out.
 */
export function isRelevant(entry: KeyedEntry, audience: Audience, now: number) {
  const today = schoolToday(now);
  const dayAhead =
    entry.date > today || (entry.date === today && schoolHour(now) < NEXT_DAY_FROM_HOUR);
  const teachers = isCourseClass(audience.schoolClass) ? audience.teachers : [];
  return (
    dayAhead &&
    entryAppliesToClass(entry.className, audience.schoolClass) &&
    entryMatchesTeachers(entry, teachers)
  );
}

const slotOf = (entry: KeyedEntry) => timetableSlot(entry);

/**
 * The changes one subscriber is told about. An entry replaced by another one
 * for the same lesson is reported as one change ("jetzt …").
 */
export function changesFor(diff: Pick<PlanDiff, "added" | "removed">, audience: Audience, now: number) {
  const added = diff.added.filter((entry) => isRelevant(entry, audience, now));
  const removed = diff.removed.filter((entry) => isRelevant(entry, audience, now));
  const changes: Change[] = [];
  const removedBySlot = new Map<string, KeyedEntry[]>();
  removed.forEach((entry) => {
    removedBySlot.set(slotOf(entry), [...(removedBySlot.get(slotOf(entry)) ?? []), entry]);
  });

  added.forEach((entry) => {
    const candidates = removedBySlot.get(slotOf(entry));
    const previous = candidates?.shift();
    changes.push(previous ? { kind: "changed", entry, previous } : { kind: "added", entry });
  });
  removedBySlot.forEach((entries) =>
    entries.forEach((entry) => changes.push({ kind: "removed", entry })),
  );

  return changes.filter((change) => matchesGroups(change, audience.notifyGroups)).sort(
    (left, right) =>
      left.entry.date.localeCompare(right.entry.date) ||
      lessonStart(left.entry.lesson) - lessonStart(right.entry.lesson),
  );
}

/**
 * Whether a change is of a kind the subscriber wants. An edited entry counts
 * if either its old or its new kind is wanted: someone who only follows
 * cancellations still learns that one was withdrawn.
 */
function matchesGroups(change: Change, groups: readonly NotifyGroup[] | undefined) {
  if (!groups) {
    return true;
  }
  const types = change.kind === "changed" ? [change.entry.type, change.previous.type] : [change.entry.type];
  return types.some((type) => groups.includes(notifyGroupOf(type)));
}

/** "Heute", "Morgen" or "Mo., 12.10." */
function dayLabel(date: string, now: number) {
  return relativeDayLabel(date, now) ?? formatShortDate(date);
}

/** Texts from the plan are cut here: a notification has room for a few short lines. */
const MAX_TEXT = 40;

function shorten(text: string) {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1).trimEnd()}…` : text;
}

/**
 * The details that matter for a kind of change, not everything the plan
 * says: whose lesson is cancelled, who substitutes, the new room, what the
 * event is. Combined classes ("9AB") are left out, they only add noise.
 */
function details(entry: KeyedEntry) {
  const kind = getEntryKind(entry.type);
  const text = entry.text ? shorten(entry.text) : "";
  if (isOpenSubstitute(entry.substitute)) {
    return [entry.teacher, "Vertretung noch offen"];
  }
  switch (kind) {
    case "cancelled":
    case "self-study":
      return [entry.subject || entry.teacher, text];
    case "substitution":
    case "supervision":
      return [teacherLabel(entry)];
    case "room":
      return [entry.room ? `Raum ${entry.room}` : "", entry.subject || entry.teacher];
    case "exam":
      return [text || entry.subject || entry.teacher, entry.room ? `Raum ${entry.room}` : ""];
    case "moved":
    case "event":
      return [text || entry.subject || entry.teacher];
  }
}

/** "🔄 Vertretung · ROE → JUB" */
function describeShort(entry: KeyedEntry, type = displayType(entry.type)) {
  return [type, ...details(entry)].filter(Boolean).join(" · ");
}

/** A change without lesson and day, e.g. ["❌", "Entfall statt Vertretung · RUK"]. */
function describeChange(change: Change): [symbol: string, text: string] {
  switch (change.kind) {
    case "added":
      return [entrySymbol(change.entry), describeShort(change.entry)];
    case "changed":
      return [
        entrySymbol(change.entry),
        describeShort(change.entry, `${displayType(change.entry.type)} statt ${displayType(change.previous.type)}`),
      ];
    case "removed":
      return ["✅", `Wieder nach Plan (${displayType(change.entry.type)} gestrichen)`];
  }
}

/** One notification for all of a subscriber's changes found in one check. */
export function buildNotification(
  schoolClass: string,
  changes: Change[],
  now: number,
): PushPayload {
  const first = changes[0].entry;
  const url = `/?day=${first.date}`;

  if (changes.length === 1) {
    return {
      title: `${schoolClass} · ${dayLabel(first.date, now)} ${lessonLabel(first.lesson)}`,
      body: describeChange(changes[0]).join(" "),
      url,
      badgeCount: 1,
    };
  }

  // All on one day: the day goes into the title instead of every line.
  const oneDay = changes.every((change) => change.entry.date === first.date);
  const lines = changes.slice(0, MAX_LINES).map((change) => {
    const [symbol, text] = describeChange(change);
    const lesson = lessonLabel(change.entry.lesson);
    return `${symbol} ${oneDay ? lesson : `${dayLabel(change.entry.date, now)} ${lesson}`}: ${text}`;
  });
  const rest = changes.length - MAX_LINES;
  return {
    title: oneDay
      ? `${schoolClass} · ${dayLabel(first.date, now)}: ${changes.length} Änderungen`
      : `${schoolClass}: ${changes.length} Änderungen`,
    body: [...lines, ...(rest > 0 ? [`… und ${rest} weitere`] : [])].join("\n"),
    url,
    badgeCount: changes.length,
  };
}

/** No notifications at night; changes found then are sent in the morning. */
export const QUIET_FROM_HOUR = 21;
export const QUIET_UNTIL_HOUR = 6;

export function isQuietTime(now: number) {
  const hour = schoolHour(now);
  return hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR;
}

/** Evening summaries go out from the earliest time to choose until the quiet time. */
export function isSummaryTime(now: number) {
  return schoolMinutes(now) >= timeToMinutes(EVENING_SUMMARY_TIMES[0]) && schoolHour(now) < QUIET_FROM_HOUR;
}

/** Morning summaries go out from the earliest time to choose until 8 h. */
export const MORNING_SUMMARY_UNTIL_HOUR = 8;

export function isMorningSummaryTime(now: number) {
  return (
    schoolMinutes(now) >= timeToMinutes(MORNING_SUMMARY_TIMES[0]) && schoolHour(now) < MORNING_SUMMARY_UNTIL_HOUR
  );
}

/** The times among `times` that have come already today. */
export function reachedTimes<T extends string>(times: readonly T[], now: number) {
  return times.filter((time) => timeToMinutes(time) <= schoolMinutes(now));
}

/** The plan's day `offset` days from today, if it is a school day (Mon–Fri). */
function schoolDayInPlan(planDates: readonly string[], now: number, offset: number) {
  const today = schoolToday(now);
  const date = planDates.find((planDate) => daysBetween(today, planDate) === offset);
  if (!date) {
    return null;
  }
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6 ? null : date;
}

/**
 * The day an evening summary is about: tomorrow, if it is a school day
 * (Mon–Fri) and the school has already published its plan. Otherwise null,
 * e.g. on Friday and Saturday evenings or in the holidays.
 */
export function summaryDate(planDates: readonly string[], now: number) {
  return schoolDayInPlan(planDates, now, 1);
}

/** The day a morning summary is about: today, if it is a school day in the plan. */
export function morningSummaryDate(planDates: readonly string[], now: number) {
  return schoolDayInPlan(planDates, now, 0);
}

/** "5A · Morgen: 2 Änderungen" with one line per change, or "keine Änderungen" (also for today). */
export function buildSummary(
  audience: Audience,
  entries: readonly KeyedEntry[],
  date: string,
  now: number,
): PushPayload {
  const teachers = isCourseClass(audience.schoolClass) ? audience.teachers : [];
  const own = entries
    .filter(
      (entry) =>
        entry.date === date &&
        entryAppliesToClass(entry.className, audience.schoolClass) &&
        entryMatchesTeachers(entry, teachers),
    )
    .sort((left, right) => lessonStart(left.lesson) - lessonStart(right.lesson));
  const day = dayLabel(date, now);
  const url = `/?day=${date}`;
  // Morning and evening apart: the morning one must not silently replace
  // last evening's (a replaced notification makes no sound on Android).
  const tag = `kag-summary-${schoolHour(now) < 12 ? "morning" : "evening"}-${date}`;

  if (own.length === 0) {
    return { title: `${audience.schoolClass} · ${day}`, body: "Keine Änderungen eingetragen.", url, tag };
  }

  const lines = own
    .slice(0, MAX_LINES)
    .map((entry) => `${entrySymbol(entry)} ${lessonLabel(entry.lesson)}: ${describeShort(entry)}`);
  const rest = own.length - MAX_LINES;
  return {
    title: `${audience.schoolClass} · ${day}: ${own.length === 1 ? "1 Änderung" : `${own.length} Änderungen`}`,
    body: [...lines, ...(rest > 0 ? [`… und ${rest} weitere`] : [])].join("\n"),
    url,
    tag,
    badgeCount: own.length,
    badgeMode: "set",
  };
}
