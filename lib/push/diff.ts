import { entryKey, parseEntryKey, type KeyedEntry } from "@/lib/seen";

/**
 * What the push check last knew about the plan. Shared by all subscribers, so
 * every change is detected once, no matter how many devices are registered.
 */
export type PlanState = {
  /** Keys (see `entryKey`) of all entries of today and later. */
  keys: string[];
  /**
   * Keys that were missing in the last check but are not yet treated as
   * removed: during an upload the school's pages are briefly incomplete, and
   * a lesson must not be reported as "back to normal" because of that.
   */
  missing: string[];
  updatedAt: string;
};

export type PlanDiff = {
  state: PlanState;
  /** No earlier state: the plan was only recorded, nothing is reported. */
  initial: boolean;
  added: KeyedEntry[];
  removed: KeyedEntry[];
};

function dateOf(key: string) {
  return key.slice(0, key.indexOf("|"));
}

/** Date, class and lesson: the place in the timetable an entry is about. */
function slotOf(key: string) {
  return key.split("|").slice(0, 3).join("|");
}

/** Entries of today and later; entries without a date cannot be placed. */
function isCurrent(key: string, today: string) {
  const date = dateOf(key);
  return date !== "" && date >= today;
}

/**
 * Compares the plan with the last known state. New and edited entries count
 * at once; an entry that disappears without replacement only counts as
 * removed once it is missing in two checks in a row.
 */
export function diffPlan(
  previous: PlanState | null,
  entries: KeyedEntry[],
  today: string,
  now = new Date(),
): PlanDiff {
  const current = Array.from(new Set(entries.map(entryKey))).filter((key) =>
    isCurrent(key, today),
  );
  const updatedAt = now.toISOString();

  if (!previous) {
    return {
      state: { keys: current, missing: [], updatedAt },
      initial: true,
      added: [],
      removed: [],
    };
  }

  const known = new Set(previous.keys.filter((key) => isCurrent(key, today)));
  const currentSet = new Set(current);
  const wasMissing = new Set(previous.missing);

  const added = current.filter((key) => !known.has(key));
  const gone = [...known].filter((key) => !currentSet.has(key));
  // An entry replaced by a new one for the same lesson was edited, not lost
  // in an incomplete upload: report it at once, as one change with the new one.
  const replacedSlots = new Set(added.map(slotOf));
  const replaced = gone.filter((key) => replacedSlots.has(slotOf(key)));
  const removed = gone.filter((key) => replaced.includes(key) || wasMissing.has(key));
  const stillMissing = gone.filter((key) => !removed.includes(key));

  return {
    state: { keys: [...current, ...stillMissing], missing: stillMissing, updatedAt },
    initial: false,
    added: added.map(parseEntryKey),
    removed: removed.map(parseEntryKey),
  };
}
