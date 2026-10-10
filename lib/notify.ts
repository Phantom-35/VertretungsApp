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

/** The evening summary of the next school day is sent from this hour on. */
export const EVENING_SUMMARY_HOUR = 19;
/** The morning summary of the day is sent from this hour on (until 8 h). */
export const MORNING_SUMMARY_HOUR = 6;
