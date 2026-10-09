import { describe, expect, it } from "vitest";
import { diffPlan, type PlanState } from "@/lib/push/diff";
import {
  buildNotification,
  buildSummary,
  changesFor,
  isQuietTime,
  isRelevant,
  isSummaryTime,
  summaryDate,
} from "@/lib/push/message";
import { notifyGroupOf, type NotifyGroup } from "@/lib/notify";
import { entryKey, parseEntryKey, type KeyedEntry } from "@/lib/seen";

const entry = (overrides: Partial<KeyedEntry>): KeyedEntry => ({
  date: "2026-10-09",
  className: "05A",
  lesson: "3",
  type: "Entfall",
  substitute: "",
  teacher: "ABC",
  room: "101",
  subject: "",
  text: "",
  ...overrides,
});

// Thursday 08.10.2026, 10:00 in Germany.
const MORNING = Date.parse("2026-10-08T10:00:00+02:00");
const TODAY = "2026-10-08";

describe("entry keys", () => {
  it("can be turned back into entries, also with | in the text", () => {
    const original = entry({ text: "Aufgaben | Seite 12" });
    expect(parseEntryKey(entryKey(original))).toEqual(original);
  });
});

describe("diffPlan", () => {
  const state = (keys: KeyedEntry[], missing: KeyedEntry[] = []): PlanState => ({
    keys: keys.map(entryKey),
    missing: missing.map(entryKey),
    updatedAt: "",
  });

  it("only records the plan on the first run", () => {
    const diff = diffPlan(null, [entry({})], TODAY);
    expect(diff.initial).toBe(true);
    expect(diff.added).toEqual([]);
    expect(diff.state.keys).toEqual([entryKey(entry({}))]);
  });

  it("reports new entries at once, e.g. a second upload at noon", () => {
    const morning = [entry({ lesson: "1" })];
    const noon = [...morning, entry({ lesson: "5", type: "Vertretung" })];
    const diff = diffPlan(state(morning), noon, TODAY);
    expect(diff.added).toEqual([entry({ lesson: "5", type: "Vertretung" })]);
    expect(diff.removed).toEqual([]);
  });

  it("reports nothing when the school uploads the same plan again", () => {
    const plan = [entry({ lesson: "1" }), entry({ lesson: "2" })];
    const diff = diffPlan(state(plan), [...plan].reverse(), TODAY);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it("treats an entry as removed only when it is missing twice in a row", () => {
    const cancelled = entry({ lesson: "4" });
    const first = diffPlan(state([cancelled]), [], TODAY);
    expect(first.removed).toEqual([]);
    expect(first.state.missing).toEqual([entryKey(cancelled)]);
    // Still known, so it is not "new" if it comes back.
    expect(first.state.keys).toContain(entryKey(cancelled));

    const second = diffPlan(first.state, [], TODAY);
    expect(second.removed).toEqual([cancelled]);
    expect(second.state.keys).toEqual([]);
    expect(second.state.missing).toEqual([]);
  });

  it("reports an edited entry at once as one change", () => {
    const before = entry({ lesson: "3", type: "Statt-Vertretung", substitute: "SKA" });
    const after = entry({ lesson: "3", type: "Entfall" });
    const diff = diffPlan(state([before]), [after], TODAY);
    expect(diff.added).toEqual([after]);
    expect(diff.removed).toEqual([before]);
    expect(diff.state.missing).toEqual([]);
    // No second notification about the old entry later.
    expect(diffPlan(diff.state, [after], TODAY).removed).toEqual([]);
  });

  it("does not report an entry that was only briefly missing", () => {
    const cancelled = entry({ lesson: "4" });
    const gap = diffPlan(state([cancelled]), [], TODAY);
    const back = diffPlan(gap.state, [cancelled], TODAY);
    expect(back.added).toEqual([]);
    expect(back.removed).toEqual([]);
    expect(back.state.missing).toEqual([]);
  });

  it("forgets past days without reporting them as removed", () => {
    const yesterday = entry({ date: "2026-10-07" });
    const diff = diffPlan(state([yesterday]), [], TODAY);
    expect(diff.removed).toEqual([]);
    expect(diff.state.keys).toEqual([]);
  });

  it("ignores entries without a date", () => {
    const diff = diffPlan(state([]), [entry({ date: "" })], TODAY);
    expect(diff.added).toEqual([]);
  });
});

describe("who is told about what", () => {
  it("matches the class, including combined classes", () => {
    expect(isRelevant(entry({ className: "05ABC" }), { schoolClass: "5B", teachers: [] }, MORNING)).toBe(true);
    expect(isRelevant(entry({ className: "06A" }), { schoolClass: "5A", teachers: [] }, MORNING)).toBe(false);
  });

  it("uses the course filter in the upper school only", () => {
    const course = entry({ className: "Q1", teacher: "RUK" });
    expect(isRelevant(course, { schoolClass: "Q1", teachers: ["RUK"] }, MORNING)).toBe(true);
    expect(isRelevant(course, { schoolClass: "Q1", teachers: ["KER"] }, MORNING)).toBe(false);
    expect(isRelevant(course, { schoolClass: "Q1", teachers: [] }, MORNING)).toBe(true);
    // A stored filter must not hide anything from a lower-school class.
    expect(isRelevant(entry({}), { schoolClass: "5A", teachers: ["KER"] }, MORNING)).toBe(true);
  });

  it("only reports today's changes until school is out", () => {
    const today = entry({ date: TODAY });
    const audience = { schoolClass: "5A", teachers: [] };
    expect(isRelevant(today, audience, MORNING)).toBe(true);
    expect(isRelevant(today, audience, Date.parse("2026-10-08T16:30:00+02:00"))).toBe(false);
    expect(isRelevant(entry({ date: "2026-10-07" }), audience, MORNING)).toBe(false);
  });

  it("pairs a replaced entry into one change", () => {
    const before = entry({ lesson: "3", type: "Entfall" });
    const after = entry({ lesson: "3", type: "Vertretung", substitute: "DEF" });
    const other = entry({ lesson: "6", type: "Raum-Vtr.", room: "204" });
    const changes = changesFor(
      { added: [other, after], removed: [before] },
      { schoolClass: "5A", teachers: [] },
      MORNING,
    );
    expect(changes).toEqual([
      { kind: "changed", entry: after, previous: before },
      { kind: "added", entry: other },
    ]);
  });
});

describe("notification text", () => {
  const audience = { schoolClass: "5A", teachers: [] };

  it("describes a single change in the title and body", () => {
    const changes = changesFor({ added: [entry({ lesson: "3 - 4" })], removed: [] }, audience, MORNING);
    expect(buildNotification("5A", changes, MORNING)).toEqual({
      title: "5A · Morgen 3.–4. Std.",
      body: "Entfall · ABC · Raum 101",
      url: "/?day=2026-10-09",
      badgeCount: 1,
    });
  });

  it("explains changed and withdrawn entries", () => {
    const changed = changesFor(
      {
        added: [entry({ type: "Vertretung", substitute: "DEF" })],
        removed: [entry({})],
      },
      audience,
      MORNING,
    );
    expect(buildNotification("5A", changed, MORNING).body).toBe(
      "Jetzt: Vertretung · ABC → DEF · Raum 101 (vorher Entfall)",
    );
    const withdrawn = changesFor({ added: [], removed: [entry({})] }, audience, MORNING);
    expect(buildNotification("5A", withdrawn, MORNING).body).toBe(
      "Zurückgenommen: Entfall · ABC · Raum 101",
    );
  });

  it("lists several changes and counts the rest", () => {
    const added = ["1", "2", "3", "4", "5", "6"].map((lesson) =>
      entry({ lesson, date: lesson < "4" ? TODAY : "2026-10-12" }),
    );
    const notification = buildNotification("5A", changesFor({ added, removed: [] }, audience, MORNING), MORNING);
    expect(notification.title).toBe("5A: 6 Änderungen");
    expect(notification.body.split("\n")).toEqual([
      "Heute 1. Std.: Entfall · ABC · Raum 101",
      "Heute 2. Std.: Entfall · ABC · Raum 101",
      "Heute 3. Std.: Entfall · ABC · Raum 101",
      "Mo., 12.10. 4. Std.: Entfall · ABC · Raum 101",
      "… und 2 weitere",
    ]);
    expect(notification.url).toBe("/?day=2026-10-08");
    expect(notification.badgeCount).toBe(6);
  });

  it("stays quiet at night, in summer and winter time", () => {
    expect(isQuietTime(Date.parse("2026-10-08T21:05:00+02:00"))).toBe(true);
    expect(isQuietTime(Date.parse("2026-10-08T05:59:00+02:00"))).toBe(true);
    expect(isQuietTime(Date.parse("2026-10-08T06:00:00+02:00"))).toBe(false);
    expect(isQuietTime(Date.parse("2026-12-08T20:59:00+01:00"))).toBe(false);
    expect(isQuietTime(Date.parse("2026-12-08T05:30:00+01:00"))).toBe(true);
  });
});

describe("notification groups", () => {
  const audience = (notifyGroups: NotifyGroup[]) => ({ schoolClass: "5A", teachers: [], notifyGroups });

  it("sorts every kind of entry into a group", () => {
    expect(["Entfall", "EVA", "Vertretung", "Betreuung", "Raum-Vtr.", "Verlegung", "Klausur", "Veranst."].map(notifyGroupOf)).toEqual([
      "cancelled",
      "cancelled",
      "substitution",
      "substitution",
      "room",
      "room",
      "exam",
      "exam",
    ]);
  });

  it("only reports the chosen kinds", () => {
    const added = [entry({ lesson: "1", type: "Entfall" }), entry({ lesson: "2", type: "Vertretung" })];
    expect(changesFor({ added, removed: [] }, audience(["cancelled"]), MORNING).map((change) => change.entry.lesson)).toEqual(["1"]);
    expect(changesFor({ added, removed: [] }, audience([]), MORNING)).toEqual([]);
    // Older subscribers without a choice get everything.
    expect(changesFor({ added, removed: [] }, { schoolClass: "5A", teachers: [] }, MORNING)).toHaveLength(2);
  });

  it("reports a withdrawn cancellation to someone who only follows cancellations", () => {
    const before = entry({ type: "Entfall" });
    const after = entry({ type: "Vertretung", substitute: "DEF" });
    expect(changesFor({ added: [after], removed: [before] }, audience(["cancelled"]), MORNING)).toEqual([
      { kind: "changed", entry: after, previous: before },
    ]);
  });
});

describe("evening summary", () => {
  const EVENING = Date.parse("2026-10-08T19:05:00+02:00"); // Thursday
  const audience = { schoolClass: "5A", teachers: [] };

  it("is sent between 19 and 21 h", () => {
    expect(isSummaryTime(Date.parse("2026-10-08T18:59:00+02:00"))).toBe(false);
    expect(isSummaryTime(EVENING)).toBe(true);
    expect(isSummaryTime(Date.parse("2026-10-08T20:59:00+02:00"))).toBe(true);
    expect(isSummaryTime(Date.parse("2026-12-08T19:10:00+01:00"))).toBe(true);
  });

  it("is about tomorrow if it is a school day with a published plan", () => {
    expect(summaryDate(["2026-10-08", "2026-10-09"], EVENING)).toBe("2026-10-09");
    // No plan for tomorrow yet (or holidays): nothing.
    expect(summaryDate(["2026-10-08"], EVENING)).toBeNull();
    // Friday and Saturday evening: no school tomorrow.
    expect(summaryDate(["2026-10-09", "2026-10-10", "2026-10-12"], Date.parse("2026-10-09T19:05:00+02:00"))).toBeNull();
    // Sunday evening: Monday.
    expect(summaryDate(["2026-10-12"], Date.parse("2026-10-11T19:05:00+02:00"))).toBe("2026-10-12");
  });

  it("lists tomorrow's changes for the class", () => {
    const entries = [
      entry({ lesson: "5", type: "Vertretung", substitute: "DEF" }),
      entry({ lesson: "1" }),
      entry({ className: "07B", lesson: "2" }),
      entry({ date: "2026-10-12", lesson: "3" }),
    ];
    expect(buildSummary(audience, entries, "2026-10-09", EVENING)).toEqual({
      title: "5A · Morgen: 2 Änderungen",
      body: "1. Std.: Entfall · ABC · Raum 101\n5. Std.: Vertretung · ABC → DEF · Raum 101",
      url: "/?day=2026-10-09",
      tag: "kag-summary-2026-10-09",
      badgeCount: 2,
    });
  });

  it("says so when nothing changes", () => {
    expect(buildSummary(audience, [], "2026-10-09", EVENING)).toEqual({
      title: "5A · Morgen",
      body: "Keine Änderungen eingetragen.",
      url: "/?day=2026-10-09",
      tag: "kag-summary-2026-10-09",
    });
  });

  it("respects the course filter in the upper school", () => {
    const entries = [entry({ className: "Q1", teacher: "RUK" }), entry({ className: "Q1", teacher: "KER" })];
    const summary = buildSummary({ schoolClass: "Q1", teachers: ["RUK"] }, entries, "2026-10-09", EVENING);
    expect(summary.title).toBe("Q1 · Morgen: 1 Änderung");
  });
});
