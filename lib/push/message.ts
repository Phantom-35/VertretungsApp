import {
  entryAppliesToClass,
  entryMatchesTeachers,
  isCourseClass,
  lessonStart,
} from "@/lib/entries";
import { formatShortDate, relativeDayLabel } from "@/lib/format";
import type { KeyedEntry } from "@/lib/seen";
import { describeEntry, lessonLabel } from "@/lib/share";
import { NEXT_DAY_FROM_HOUR, schoolHour, schoolToday } from "@/lib/time";
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
  tag?: string;
};

/** Notifications list at most this many changes; the rest is counted. */
const MAX_LINES = 4;

export type Audience = { schoolClass: string; teachers: readonly string[] };

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

const slotOf = (entry: KeyedEntry) => `${entry.date}|${entry.className}|${entry.lesson}`;

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

  return changes.sort(
    (left, right) =>
      left.entry.date.localeCompare(right.entry.date) ||
      lessonStart(left.entry.lesson) - lessonStart(right.entry.lesson),
  );
}

/** "Heute", "Morgen" or "Mo., 12.10." */
function dayLabel(date: string, now: number) {
  return relativeDayLabel(date, now) ?? formatShortDate(date);
}

function describeChange(change: Change, schoolClass: string) {
  switch (change.kind) {
    case "added":
      return describeEntry(change.entry, schoolClass);
    case "changed":
      return `Jetzt: ${describeEntry(change.entry, schoolClass)} (vorher ${change.previous.type || "Änderung"})`;
    case "removed":
      return `Zurückgenommen: ${describeEntry(change.entry, schoolClass)}`;
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
      body: describeChange(changes[0], schoolClass),
      url,
      badgeCount: 1,
    };
  }

  const lines = changes
    .slice(0, MAX_LINES)
    .map(
      (change) =>
        `${dayLabel(change.entry.date, now)} ${lessonLabel(change.entry.lesson)}: ${describeChange(change, schoolClass)}`,
    );
  const rest = changes.length - MAX_LINES;
  return {
    title: `${schoolClass}: ${changes.length} Änderungen im Vertretungsplan`,
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
