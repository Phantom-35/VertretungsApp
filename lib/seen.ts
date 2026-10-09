import type { SubstitutionEntry } from "@/lib/types";

export type KeyedEntry = Pick<
  SubstitutionEntry,
  "date" | "className" | "lesson" | "type" | "substitute" | "teacher" | "room" | "subject" | "text"
>;

/**
 * Identifies an entry by its content. Unlike `entry.id` it leaves out the page
 * number, which shifts whenever the school uploads a new plan.
 */
export function entryKey(entry: KeyedEntry) {
  return [
    entry.date,
    entry.className,
    entry.lesson,
    entry.type,
    entry.substitute,
    entry.teacher,
    entry.room,
    entry.subject,
    entry.text,
  ].join("|");
}

/**
 * Keys of entries that were not in the plan when the user last looked.
 * Without a baseline (first use) nothing counts as new.
 */
export function findNewKeys(baseline: readonly string[] | null, entries: KeyedEntry[]) {
  if (!baseline) {
    return new Set<string>();
  }
  const seen = new Set(baseline);
  return new Set(entries.map(entryKey).filter((key) => !seen.has(key)));
}

/**
 * Seen keys to store: the current plan plus earlier ones not yet in the past.
 * Earlier keys without a date are dropped, so the list cannot grow forever.
 */
export function mergeSeenKeys(
  previous: readonly string[],
  entries: KeyedEntry[],
  today: string,
) {
  const current = entries.map(entryKey);
  // Keys start with the date (YYYY-MM-DD).
  const stillRelevant = previous.filter((key) => {
    const date = key.slice(0, key.indexOf("|"));
    return date !== "" && date >= today;
  });
  return Array.from(new Set([...stillRelevant, ...current]));
}

const KEY_FIELDS = [
  "date",
  "className",
  "lesson",
  "type",
  "substitute",
  "teacher",
  "room",
  "subject",
] as const;

/** Reverses `entryKey`; the text is last, so it may itself contain "|". */
export function parseEntryKey(key: string): KeyedEntry {
  const parts = key.split("|");
  const entry = Object.fromEntries(KEY_FIELDS.map((field, index) => [field, parts[index] ?? ""]));
  return { ...entry, text: parts.slice(KEY_FIELDS.length).join("|") } as KeyedEntry;
}
