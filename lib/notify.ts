import { getEntryKind, type EntryKind } from "@/lib/entries";

/** What a subscriber can choose to be notified about. */
export const NOTIFY_GROUPS = ["cancelled", "substitution", "room", "exam"] as const;
export type NotifyGroup = (typeof NOTIFY_GROUPS)[number];

export const NOTIFY_GROUP_LABELS: Record<NotifyGroup, string> = {
  cancelled: "Ausfälle & EVA",
  substitution: "Vertretungen & Betreuung",
  room: "Raumänderungen & Verlegungen",
  exam: "Klausuren & Veranstaltungen",
};

const groupOfKind: Record<EntryKind, NotifyGroup> = {
  cancelled: "cancelled",
  "self-study": "cancelled",
  substitution: "substitution",
  supervision: "substitution",
  room: "room",
  moved: "room",
  exam: "exam",
  event: "exam",
};

export function notifyGroupOf(type: string): NotifyGroup {
  return groupOfKind[getEntryKind(type)];
}

/** Known groups from untrusted input, without duplicates; null if not a list. */
export function parseNotifyGroups(value: unknown): NotifyGroup[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return NOTIFY_GROUPS.filter((group) => value.includes(group));
}

/**
 * Times to choose from for the evening summary of the next school day; the
 * quiet time starts at 21 h. 19 h was the only time before, and stays the default.
 */
export const EVENING_SUMMARY_TIMES = ["17:00", "18:00", "19:00", "20:00"] as const;
export type EveningSummaryTime = (typeof EVENING_SUMMARY_TIMES)[number];
export const DEFAULT_EVENING_SUMMARY_TIME: EveningSummaryTime = "19:00";

/**
 * Times for the morning summary of the day, before school (until 8 h). 6:30
 * by default: the school often updates the plan early in the morning.
 */
export const MORNING_SUMMARY_TIMES = ["06:00", "06:30", "07:00"] as const;
export type MorningSummaryTime = (typeof MORNING_SUMMARY_TIMES)[number];
export const DEFAULT_MORNING_SUMMARY_TIME: MorningSummaryTime = "06:30";

/** A known time from untrusted input, else the fallback. */
export function parseSummaryTime<T extends string>(value: unknown, times: readonly T[], fallback: T): T {
  return times.find((time) => time === value) ?? fallback;
}

/** "06:30" -> 390 (minutes after midnight). */
export function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** "06:30" -> "6:30 Uhr", "19:00" -> "19 Uhr". */
export function summaryTimeLabel(time: string) {
  const [hours, minutes] = time.split(":");
  return `${Number(hours)}${minutes === "00" ? "" : `:${minutes}`} Uhr`;
}
