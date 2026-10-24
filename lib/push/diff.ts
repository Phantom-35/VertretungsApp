import { timetableSlot } from "@/lib/entries";
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
  /**
   * When this state was worked out. The push check stores it only when it
   * changed, so the stored value is the time of the last change.
   */
  updatedAt: string;
  /**
   * Set while the plan comes from the school's second website (see
   * lib/scraper.ts). It writes the same entries a little differently, so a
   * switch must not be read as changes.
   */
  source?: "fallback";
  /**
   * Days on which (nearly) all entries vanished at once, with the time this
   * was first seen. Such a day is far more likely a broken or half-finished
   * upload than everything being withdrawn: it is only reported after a
   * while (MASS_VANISH_WAIT_MS), not after the usual two checks.
   */
  vanishedSince?: Record<string, string>;
};

/** From this many entries of a day vanishing at once (and most of them) … */
const MASS_VANISH_MIN = 3;
const MASS_VANISH_SHARE = 0.8;
/** … they count as withdrawn only when the day stays like that this long. */
export const MASS_VANISH_WAIT_MS = 45 * 60_000;

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

/** The place in the timetable an entry is about (see `timetableSlot`). */
function slotOf(key: string) {
  return timetableSlot(parseEntryKey(key));
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
  /**
   * The days the current plan contains. Entries of a day that is missing as a
   * whole are kept as they were: a day absent from the export (too many
   * pages, a broken upload) does not mean its changes were withdrawn.
   */
  planDates?: readonly string[],
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
  const shownDays = planDates ? new Set(planDates) : null;
  const dayMissing = (key: string) => shownDays !== null && !shownDays.has(dateOf(key));
  const kept = [...known].filter((key) => !currentSet.has(key) && dayMissing(key));
  const gone = [...known].filter((key) => !currentSet.has(key) && !dayMissing(key));
  // An entry replaced by a new one for the same lesson was edited, not lost
  // in an incomplete upload: report it at once, as one change with the new one.
  const replacedSlots = new Set(added.map(slotOf));
  const replaced = gone.filter((key) => replacedSlots.has(slotOf(key)));

  // Nearly a whole day gone at once (e.g. its page uploaded empty): kept as it
  // was until that has lasted a while, so that nobody gets "back to normal"
  // for every lesson because of a broken upload.
  const vanishedSince: Record<string, string> = {};
  const held = new Set<string>();
  const byDay = new Map<string, { known: number; vanished: string[] }>();
  for (const key of known) {
    const day = byDay.get(dateOf(key)) ?? { known: 0, vanished: [] };
    day.known += 1;
    if (gone.includes(key) && !replaced.includes(key)) {
      day.vanished.push(key);
    }
    byDay.set(dateOf(key), day);
  }
  for (const [date, day] of byDay) {
    if (day.vanished.length < MASS_VANISH_MIN || day.vanished.length < day.known * MASS_VANISH_SHARE) {
      continue;
    }
    const since = previous.vanishedSince?.[date] ?? updatedAt;
    if (now.getTime() - Date.parse(since) < MASS_VANISH_WAIT_MS) {
      vanishedSince[date] = since;
      day.vanished.forEach((key) => held.add(key));
    }
  }
  const settled = gone.filter((key) => !held.has(key));
  // After the wait, such a day is reported at once (it was checked often enough).
  const waited = (key: string) => previous.vanishedSince?.[dateOf(key)] !== undefined;
  const removed = settled.filter((key) => replaced.includes(key) || wasMissing.has(key) || waited(key));
  const stillMissing = settled.filter((key) => !removed.includes(key));
  const heldKeys = [...held];

  return {
    state: {
      keys: [...current, ...stillMissing, ...kept, ...heldKeys],
      missing: [
        ...stillMissing,
        ...previous.missing.filter((key) => kept.includes(key) || held.has(key)),
      ],
      updatedAt,
      ...(Object.keys(vanishedSince).length > 0 ? { vanishedSince } : {}),
    },
    initial: false,
    added: added.map(parseEntryKey),
    removed: removed.map(parseEntryKey),
  };
}
