import { describe, expect, it } from "vitest";
import { diffPlan, type PlanState } from "@/lib/push/diff";
import {
  buildNotification,
  buildSummary,
  changesFor,
  isQuietTime,
  isRelevant,
  isSummaryTime,
  reachedTimes,
  summaryDate,
} from "@/lib/push/message";
import {
  EVENING_SUMMARY_TIMES,
  MORNING_SUMMARY_TIMES,
  notifyGroupOf,
  summaryTimeLabel,
  type NotifyGroup,
} from "@/lib/notify";
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

  it("does not report a whole day vanishing at once until it lasts (a broken upload)", () => {
    const day = [entry({ lesson: "1" }), entry({ lesson: "2" }), entry({ lesson: "3" }), entry({ lesson: "4" })];
    const other = entry({ date: "2026-10-12", lesson: "5" });
    const at = (minutes: number) => new Date(MORNING + minutes * 60_000);
    const dates = ["2026-10-09", "2026-10-12"];
    // The day's page is there, but empty: twice, three times – nothing reported.
    let diff = diffPlan(state([...day, other]), [other], TODAY, at(0), dates);
    expect(diff.removed).toEqual([]);
    expect(diff.state.vanishedSince).toEqual({ "2026-10-09": at(0).toISOString() });
    diff = diffPlan(diff.state, [other], TODAY, at(10), dates);
    diff = diffPlan(diff.state, [other], TODAY, at(20), dates);
    expect(diff.removed).toEqual([]);
    expect(diff.state.keys).toHaveLength(5);
    // Back again: nothing to report either.
    const back = diffPlan(diff.state, [...day, other], TODAY, at(30), dates);
    expect(back.added).toEqual([]);
    expect(back.removed).toEqual([]);
    expect(back.state.vanishedSince).toBeUndefined();
    // Still empty after the wait: then it really was withdrawn.
    diff = diffPlan(diff.state, [other], TODAY, at(50), dates);
    expect(diff.removed).toHaveLength(4);
    expect(diff.state.keys).toEqual([entryKey(other)]);
  });

  it("still reports a single withdrawn lesson after two checks", () => {
    const day = [entry({ lesson: "1" }), entry({ lesson: "2" }), entry({ lesson: "3" }), entry({ lesson: "4" })];
    const first = diffPlan(state(day), day.slice(1), TODAY, new Date(MORNING), ["2026-10-09"]);
    expect(first.removed).toEqual([]);
    const second = diffPlan(first.state, day.slice(1), TODAY, new Date(MORNING + 600_000), ["2026-10-09"]);
    expect(second.removed).toHaveLength(1);
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

  it("keeps the entries of a day that is missing from the plan as a whole", () => {
    const friday = entry({ lesson: "1" });
    const monday = entry({ date: "2026-10-12", lesson: "2" });
    // Monday's pages are missing (e.g. too many pages), twice in a row.
    const first = diffPlan(state([friday, monday]), [friday], TODAY, new Date(), ["2026-10-09"]);
    const second = diffPlan(first.state, [friday], TODAY, new Date(), ["2026-10-09"]);
    expect([...first.removed, ...second.removed]).toEqual([]);
    // Back again: nothing is new.
    const back = diffPlan(second.state, [friday, monday], TODAY, new Date(), ["2026-10-09", "2026-10-12"]);
    expect(back.added).toEqual([]);
    expect(back.removed).toEqual([]);
    // A single entry missing on a day that is there still counts.
    const gone = diffPlan(back.state, [friday], TODAY, new Date(), ["2026-10-09", "2026-10-12"]);
    expect(diffPlan(gone.state, [friday], TODAY, new Date(), ["2026-10-09", "2026-10-12"]).removed).toEqual([monday]);
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

  it("tells about rows without a class only those who chose that teacher's course", () => {
    const classless = entry({ className: "", teacher: "JUN" });
    expect(isRelevant(classless, { schoolClass: "Q1", teachers: ["JUN"] }, MORNING)).toBe(true);
    expect(isRelevant(classless, { schoolClass: "Q1", teachers: [] }, MORNING)).toBe(false);
    expect(isRelevant(classless, { schoolClass: "9A", teachers: [] }, MORNING)).toBe(false);
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

  it("does not pair different courses of the upper school", () => {
    const eva = entry({ className: "Q1", lesson: "3 - 4", type: "EVA", teacher: "KER" });
    const exam = entry({ className: "Q1", lesson: "3 - 4", type: "Klausur", teacher: "", text: "Q1 S GK LIT" });
    const changes = changesFor({ added: [exam], removed: [eva] }, { schoolClass: "Q1", teachers: [] }, MORNING);
    expect(changes.map((change) => change.kind).sort()).toEqual(["added", "removed"]);
  });
});

describe("notification text", () => {
  const audience = { schoolClass: "5A", teachers: [] };

  it("describes a single change in the title and body", () => {
    const changes = changesFor({ added: [entry({ lesson: "3 - 4" })], removed: [] }, audience, MORNING);
    expect(buildNotification("5A", changes, MORNING)).toEqual({
      title: "5A · Morgen 3.–4. Std.",
      body: "❌ Entfall · ABC",
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
      "🔄 Vertretung statt Entfall · ABC → DEF",
    );
    // A room the school had left open is set now.
    const roomSet = changesFor(
      { added: [entry({ type: "Raum-Vtr.", room: "218" })], removed: [entry({ type: "Raum-Vtr.", room: "???" })] },
      audience,
      MORNING,
    );
    expect(buildNotification("5A", roomSet, MORNING).body).toBe("🚪 Raumänderung · Raum 218 steht fest · ABC");
    const substitutionRoomSet = changesFor(
      {
        added: [entry({ type: "Vertretung", substitute: "DEF", room: "105" })],
        removed: [entry({ type: "Vertretung", substitute: "DEF", room: "???" })],
      },
      audience,
      MORNING,
    );
    expect(buildNotification("5A", substitutionRoomSet, MORNING).body).toBe("🔄 Vertretung · Raum 105 steht fest · ABC → DEF");
    const withdrawn = changesFor({ added: [], removed: [entry({})] }, audience, MORNING);
    expect(buildNotification("5A", withdrawn, MORNING).body).toBe(
      "✅ Findet doch statt (war: Entfall)",
    );
  });

  it("names only what matters for each kind, with a symbol", () => {
    const one = (overrides: Partial<KeyedEntry>) =>
      buildNotification("5A", changesFor({ added: [entry(overrides)], removed: [] }, audience, MORNING), MORNING).body;
    expect(one({ type: "Raum-Vtr.", room: "218" })).toBe("🚪 Raumänderung · Raum 218 · ABC");
    expect(one({ type: "Raum-Vtr.", room: "???" })).toBe("🚪 Raumänderung · Raum noch offen · ABC");
    expect(one({ type: "Klausur", teacher: "", room: "217", text: "Q1 S GK RUK" })).toBe("📝 Klausur · Q1 S GK RUK · Raum 217");
    expect(one({ type: "Veranst.", text: "Praktikumsmesse" })).toBe("📌 Veranstaltung · Praktikumsmesse");
    expect(one({ type: "Betreuung", substitute: "DEF" })).toBe("🧑‍🏫 Betreuung · ABC → DEF");
    expect(one({ type: "Vertretung", substitute: "???" })).toBe("❓ Vertretung · ABC · Vertretung noch offen");
    // Combined classes are left out, long texts shortened.
    expect(one({ className: "05AB", type: "EVA", text: "Aufgaben stehen im Lernraum, bitte bis Freitag bearbeiten" })).toBe(
      "📚 EVA · ABC · Aufgaben stehen im Lernraum, bitte bis…",
    );
  });

  it("lists several changes and counts the rest", () => {
    const added = ["1", "2", "3", "4", "5", "6"].map((lesson) =>
      entry({ lesson, date: lesson < "4" ? TODAY : "2026-10-12" }),
    );
    const notification = buildNotification("5A", changesFor({ added, removed: [] }, audience, MORNING), MORNING);
    expect(notification.title).toBe("5A: 6 Änderungen");
    expect(notification.body.split("\n")).toEqual([
      "❌ Heute 1. Std.: Entfall · ABC",
      "❌ Heute 2. Std.: Entfall · ABC",
      "❌ Heute 3. Std.: Entfall · ABC",
      "❌ Mo., 12.10. 4. Std.: Entfall · ABC",
      "… und 2 weitere",
    ]);
    expect(notification.url).toBe("/?day=2026-10-08");
    expect(notification.badgeCount).toBe(6);
  });

  it("puts the day into the title when all changes are on one day", () => {
    const added = ["1", "2"].map((lesson) => entry({ lesson }));
    const notification = buildNotification("5A", changesFor({ added, removed: [] }, audience, MORNING), MORNING);
    expect(notification.title).toBe("5A · Morgen: 2 Änderungen");
    expect(notification.body).toBe("❌ 1. Std.: Entfall · ABC\n❌ 2. Std.: Entfall · ABC");
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

  it("is sent between the earliest time to choose (17 h) and 21 h", () => {
    expect(isSummaryTime(Date.parse("2026-10-08T16:59:00+02:00"))).toBe(false);
    expect(isSummaryTime(Date.parse("2026-10-08T17:00:00+02:00"))).toBe(true);
    expect(isSummaryTime(EVENING)).toBe(true);
    expect(isSummaryTime(Date.parse("2026-10-08T20:59:00+02:00"))).toBe(true);
    expect(isSummaryTime(Date.parse("2026-10-08T21:00:00+02:00"))).toBe(false);
    expect(isSummaryTime(Date.parse("2026-12-08T19:10:00+01:00"))).toBe(true);
  });

  it("knows which of the times to choose have come", () => {
    expect(reachedTimes(EVENING_SUMMARY_TIMES, Date.parse("2026-10-08T18:30:00+02:00"))).toEqual(["17:00", "18:00"]);
    expect(reachedTimes(MORNING_SUMMARY_TIMES, Date.parse("2026-10-09T06:29:00+02:00"))).toEqual(["06:00"]);
    expect(reachedTimes(MORNING_SUMMARY_TIMES, Date.parse("2026-12-09T06:30:00+01:00"))).toEqual(["06:00", "06:30"]);
    expect(summaryTimeLabel("06:30")).toBe("6:30 Uhr");
    expect(summaryTimeLabel("19:00")).toBe("19 Uhr");
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
      body: "❌ 1. Std.: Entfall · ABC\n🔄 5. Std.: Vertretung · ABC → DEF",
      url: "/?day=2026-10-09",
      tag: "kag-summary-evening-2026-10-09",
      badgeCount: 2,
      badgeMode: "set",
    });
  });

  it("counts the same row on two pages once", () => {
    const twice = [entry({ lesson: "1" }), { ...entry({ lesson: "1" }) }];
    expect(buildSummary(audience, twice, "2026-10-09", EVENING).title).toBe("5A · Morgen: 1 Änderung");
  });

  it("says so when nothing changes", () => {
    expect(buildSummary(audience, [], "2026-10-09", EVENING)).toEqual({
      title: "5A · Morgen",
      body: "Keine Änderungen eingetragen.",
      url: "/?day=2026-10-09",
      tag: "kag-summary-evening-2026-10-09",
    });
  });

  it("respects the course filter in the upper school", () => {
    const entries = [entry({ className: "Q1", teacher: "RUK" }), entry({ className: "Q1", teacher: "KER" })];
    const summary = buildSummary({ schoolClass: "Q1", teachers: ["RUK"] }, entries, "2026-10-09", EVENING);
    expect(summary.title).toBe("Q1 · Morgen: 1 Änderung");
  });
});
