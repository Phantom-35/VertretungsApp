import { describe, expect, it } from "vitest";
import {
  cancelledFirstLessons,
  classlessEntryFor,
  entryForStudent,
  courseTeachers,
  entryAppliesToClass,
  entryMatchesTeachers,
  isCourseClass,
  normalizeTeacher,
  summarizeEntries,
  formatClassName,
  formatLesson,
  getEntryKind,
  normalizeSelectedClass,
} from "@/lib/entries";
import { formatDayMonth, formatPlanDateLabel, formatWeekday, isPastDate, relativeDayLabel } from "@/lib/format";
import {
  daysBetween,
  isLessonOver,
  lessonEnd,
  pickDefaultDate,
  schoolHour,
  schoolLocalToIso,
  schoolToday,
} from "@/lib/time";
import { entryKey, findNewKeys, mergeSeenKeys } from "@/lib/seen";
import { buildShareText, classLink, formatShareBlock } from "@/lib/share";
import type { SubstitutionPayload } from "@/lib/types";
import { pickDisplayedPayload } from "@/hooks/useSubstitutionData";

describe("time", () => {
  it("converts school time to UTC in summer and winter time", () => {
    expect(schoolLocalToIso(2026, 7, 1, 12, 0)).toBe("2026-07-01T10:00:00.000Z");
    expect(schoolLocalToIso(2026, 12, 1, 12, 0)).toBe("2026-12-01T11:00:00.000Z");
  });

  it("uses the school's date, not UTC, for 'today'", () => {
    // 23:30 UTC is already the next day in Germany.
    expect(schoolToday(Date.parse("2026-10-08T23:30:00Z"))).toBe("2026-10-09");
    expect(schoolToday(Date.parse("2026-10-08T21:30:00Z"))).toBe("2026-10-08");
  });

  it("counts days across month ends and the time change", () => {
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
  });
});

describe("class matching", () => {
  it.each([
    ["05A", "5A", true],
    ["05A", "5B", false],
    ["06ABCD", "6B", true],
    ["08AB", "8C", false],
    ["10ABCD", "10C", true],
    ["10B", "1B", false],
    ["05A, 05B", "5B", true],
    ["EF", "EF", true],
    ["Q1", "Q2", false],
  ])("entry %s applies to %s: %s", (entryClass, selectedClass, expected) => {
    expect(entryAppliesToClass(entryClass, selectedClass)).toBe(expected);
  });

  it("normalizes stored and displayed class names", () => {
    expect(normalizeSelectedClass(" 05a ")).toBe("5A");
    expect(normalizeSelectedClass("11Z")).toBeNull();
    expect(formatClassName("06ABCD")).toBe("6ABCD");
  });
});

describe("entry display", () => {
  it.each([
    ["Statt-Vertretung", "substitution"],
    ["Vertretung", "substitution"],
    ["Raum-Vtr.", "room"],
    ["EVA", "self-study"],
    ["Entfall", "cancelled"],
    ["Klausur", "exam"],
    ["Veranst.", "event"],
    ["Entf.", "cancelled"],
    ["Ausfall", "cancelled"],
    ["Freisetzung", "cancelled"],
    ["Selbststudium", "self-study"],
    ["Nachschreibklausur", "exam"],
    ["Klausuraufsicht", "exam"],
    ["Sondereins.", "event"],
    ["Klassenfahrt", "event"],
    ["Verlegung", "moved"],
    ["Tausch", "moved"],
    ["Lehrertausch", "substitution"],
    ["Betreuung", "supervision"],
    ["Mitbetreuung", "supervision"],
    ["Raumtausch", "room"],
    ["Trotz Absenz", "substitution"],
    ["frei", "cancelled"],
    ["Unterrichtsfrei", "cancelled"],
    ["Freie Stunde", "cancelled"],
    ["Freiarbeit", "self-study"],
    ["Raumverlegung", "room"],
    ["Raum verlegt", "room"],
    ["Sonderraum", "room"],
    ["Fahrtzeit", "substitution"],
    ["Stundentausch", "moved"],
    ["Std.-Tausch", "moved"],
    ["Lehrerwechsel", "substitution"],
    ["", "substitution"],
  ])("classifies %s as %s", (type, kind) => {
    expect(getEntryKind(type)).toBe(kind);
  });

  it("formats lesson ranges", () => {
    expect(formatLesson("3 - 4")).toBe("3–4");
    expect(formatLesson("1-11")).toBe("1–11");
  });
});

describe("day labels", () => {
  // Thursday, 08.10.2026, 10:00 in Germany
  const now = Date.parse("2026-10-08T08:00:00Z");

  it("names today, tomorrow and yesterday relative to the current date", () => {
    expect(relativeDayLabel("2026-10-08", now)).toBe("Heute");
    expect(relativeDayLabel("2026-10-09", now)).toBe("Morgen");
    expect(relativeDayLabel("2026-10-07", now)).toBe("Gestern");
    expect(relativeDayLabel("2026-10-12", now)).toBeNull();
  });

  it("shows the weekday and date", () => {
    expect(formatPlanDateLabel("2026-10-09", now)).toBe("Morgen, Freitag, 09.10.");
    expect(formatPlanDateLabel("2026-10-12", now)).toBe("Montag, 12.10.");
  });

  it("marks past plans", () => {
    expect(isPastDate("2026-10-07", now)).toBe(true);
    expect(isPastDate("2026-10-08", now)).toBe(false);
  });
});

describe("displayed data", () => {
  const payload = (lastUpdated: string, stale = false) =>
    ({ success: true, stale, lastUpdated, error: stale ? "down" : null }) as SubstitutionPayload;

  it("keeps a newer copy on screen when the server only has an older fallback", () => {
    const shown = payload("2026-10-08T10:00:00.000Z");
    const result = pickDisplayedPayload(payload("2026-10-08T08:00:00.000Z", true), shown);
    expect(result.lastUpdated).toBe(shown.lastUpdated);
    expect(result.stale).toBe(true);
    expect(result.error).toBe("down");
  });

  it("keeps a newer copy when a cached answer is a few minutes older", () => {
    const shown = payload("2026-10-08T10:05:00.000Z");
    expect(pickDisplayedPayload(payload("2026-10-08T10:01:00.000Z"), shown)).toBe(shown);
  });

  it("takes the server's answer otherwise", () => {
    const fresh = payload("2026-10-08T08:00:00.000Z");
    expect(pickDisplayedPayload(fresh, payload("2026-10-08T10:00:00.000Z"))).toBe(fresh);
    const newer = payload("2026-10-08T10:06:00.000Z");
    expect(pickDisplayedPayload(newer, payload("2026-10-08T10:05:00.000Z"))).toBe(newer);
    const newerStale = payload("2026-10-08T12:00:00.000Z", true);
    expect(pickDisplayedPayload(newerStale, payload("2026-10-08T10:00:00.000Z"))).toBe(newerStale);
  });
});

describe("default day", () => {
  const plan = ["2026-10-08", "2026-10-09", "2026-10-12"];
  const at = (iso: string) => Date.parse(iso);

  it("uses the school's hour in summer and winter time", () => {
    expect(schoolHour(at("2026-10-08T14:00:00Z"))).toBe(16);
    expect(schoolHour(at("2026-12-01T14:00:00Z"))).toBe(15);
  });

  it("shows today during school", () => {
    expect(pickDefaultDate(plan, at("2026-10-08T06:00:00Z"))).toBe("2026-10-08");
    expect(pickDefaultDate(plan, at("2026-10-08T13:59:00Z"))).toBe("2026-10-08");
  });

  it("switches to the next plan day once school is over", () => {
    expect(pickDefaultDate(plan, at("2026-10-08T14:00:00Z"))).toBe("2026-10-09");
    // Friday afternoon and the weekend: Monday.
    expect(pickDefaultDate(plan, at("2026-10-09T15:00:00Z"))).toBe("2026-10-12");
    expect(pickDefaultDate(plan, at("2026-10-10T08:00:00Z"))).toBe("2026-10-12");
    expect(pickDefaultDate(["2026-12-01", "2026-12-02"], at("2026-12-01T14:30:00Z"))).toBe("2026-12-01");
    expect(pickDefaultDate(["2026-12-01", "2026-12-02"], at("2026-12-01T15:30:00Z"))).toBe("2026-12-02");
  });

  it("uses the hour chosen in the settings", () => {
    const halfPastThree = at("2026-10-08T13:30:00Z");
    expect(pickDefaultDate(plan, halfPastThree)).toBe("2026-10-08");
    expect(pickDefaultDate(plan, halfPastThree, 15)).toBe("2026-10-09");
    // "Immer": always the next school day, also in the morning.
    expect(pickDefaultDate(plan, at("2026-10-08T05:00:00Z"), 0)).toBe("2026-10-09");
    // "Nie": always today.
    expect(pickDefaultDate(plan, at("2026-10-08T19:00:00Z"), 24)).toBe("2026-10-08");
  });

  it("stays on the last day when no later one exists", () => {
    expect(pickDefaultDate(plan, at("2026-10-12T16:00:00Z"))).toBe("2026-10-12");
    expect(pickDefaultDate(plan, at("2026-10-20T08:00:00Z"))).toBe("2026-10-12");
  });

  it("handles missing time and empty plans", () => {
    expect(pickDefaultDate(plan, null)).toBe("2026-10-08");
    expect(pickDefaultDate([], at("2026-10-08T06:00:00Z"))).toBeNull();
  });
});

describe("course filter", () => {
  const entry = (teacher: string, text = "") => ({ teacher, text });

  it("recognises the upper school", () => {
    expect(["EF", "Q1", "Q2"].every(isCourseClass)).toBe(true);
    expect(isCourseClass("9A")).toBe(false);
  });

  it("normalises teacher abbreviations", () => {
    expect(normalizeTeacher(" kag ")).toBe("KAG");
    expect(normalizeTeacher("häR")).toBe("HÄR");
    expect(normalizeTeacher("K1")).toBeNull();
    expect(normalizeTeacher("")).toBeNull();
  });

  it("finds the course teachers of an entry", () => {
    expect(courseTeachers(entry("RUK"))).toEqual(["RUK"]);
    expect(courseTeachers(entry("", "Q1 S GK RUK"))).toEqual(["RUK"]);
    // Other texts name no course: such an entry is shown to everyone.
    expect(courseTeachers(entry("", "ABI-Info in der AULA"))).toEqual([]);
    expect(courseTeachers(entry("", "EF D GK DRE/SNE/WOR + NTA"))).toEqual([
      "DRE",
      "SNE",
      "WOR",
      "NTA",
    ]);
    expect(courseTeachers(entry("", "Praktikumsmesse"))).toEqual([]);
  });

  it("filters by the student's teachers", () => {
    expect(entryMatchesTeachers(entry("RUK"), [])).toBe(true);
    expect(entryMatchesTeachers(entry("RUK"), ["RUK"])).toBe(true);
    expect(entryMatchesTeachers(entry("KER"), ["RUK"])).toBe(false);
    expect(entryMatchesTeachers(entry("", "Q2 D LK SNE"), ["SNE"])).toBe(true);
    expect(entryMatchesTeachers(entry("", "Q2 D LK HPT"), ["SNE"])).toBe(false);
    // Nothing to tell the course by: keep it visible.
    expect(entryMatchesTeachers(entry("", "Praktikumsmesse"), ["SNE"])).toBe(true);
  });
});

describe("day summary", () => {
  it("counts entries per kind, most important first", () => {
    const types = ["Vertretung", "Entfall", "Klausur", "Entfall", "Raum-Vtr.", "Statt-Vertretung"];
    expect(summarizeEntries(types.map((type) => ({ type }))).map((item) => item.label)).toEqual([
      "2 Ausfälle",
      "1 Klausur",
      "1 Raumänderung",
      "2 Vertretungen",
    ]);
    expect(summarizeEntries([])).toEqual([]);
  });
});

describe("new entries", () => {
  const entry = (date: string, lesson: string, type = "Entfall") => ({
    date,
    className: "05A",
    lesson,
    type,
    substitute: "",
    teacher: "ABC",
    room: "101",
    subject: "",
    text: "",
  });

  it("ignores the page number, so a re-uploaded plan is not all new", () => {
    expect(entryKey(entry("2026-10-08", "1"))).toBe(entryKey({ ...entry("2026-10-08", "1") }));
    expect(entryKey(entry("2026-10-08", "1"))).not.toBe(entryKey(entry("2026-10-08", "2")));
  });

  it("marks entries missing from the baseline as new", () => {
    const old = [entry("2026-10-08", "1")];
    const now = [...old, entry("2026-10-08", "2"), entry("2026-10-08", "1", "Vertretung")];
    expect(findNewKeys(old.map(entryKey), now)).toEqual(
      new Set([entryKey(now[1]), entryKey(now[2])]),
    );
  });

  it("leaves out badges already seen in this visit", () => {
    const old = [entry("2026-10-08", "1")];
    const now = [...old, entry("2026-10-08", "2"), entry("2026-10-08", "3")];
    expect(findNewKeys(old.map(entryKey), now, new Set([entryKey(now[1])]))).toEqual(new Set([entryKey(now[2])]));
  });

  it("marks nothing as new on first use", () => {
    expect(findNewKeys(null, [entry("2026-10-08", "1")]).size).toBe(0);
  });

  it("does not keep old entries without a date forever", () => {
    const dateless = entryKey(entry("", "1"));
    expect(mergeSeenKeys([dateless], [], "2026-10-08")).toEqual([]);
    expect(mergeSeenKeys([], [entry("", "1")], "2026-10-08")).toEqual([dateless]);
  });

  it("forgets past days but keeps the rest", () => {
    const previous = [entryKey(entry("2026-10-07", "1")), entryKey(entry("2026-10-09", "3"))];
    expect(mergeSeenKeys(previous, [entry("2026-10-08", "2")], "2026-10-08")).toEqual([
      entryKey(entry("2026-10-09", "3")),
      entryKey(entry("2026-10-08", "2")),
    ]);
  });
});

describe("share text", () => {
  const base = {
    id: "x",
    className: "05A",
    lesson: "1",
    type: "Vertretung",
    substitute: "",
    teacher: "",
    room: "",
    subject: "",
    text: "",
    date: "2026-10-08",
    page: 1,
  };

  it("describes each change as a short block", () => {
    expect(
      formatShareBlock({ ...base, lesson: "3 - 4", type: "Entfall", teacher: "ABC" }, "5A"),
    ).toBe("❌ *3.–4. Std.* · Entfall\nLehrkraft ABC");
    expect(
      formatShareBlock(
        { ...base, className: "06ABCD", teacher: "ABC", substitute: "DEF", room: "204", text: "Aufgaben" },
        "6B",
      ),
    ).toBe("🔄 *1. Std.* · Vertretung (6ABCD)\nLehrkraft ABC → DEF · Raum 204\n„Aufgaben“");
    expect(formatShareBlock({ ...base, lesson: "", type: "" }, "5A")).toBe("🔄 *Std. ?* · Änderung");
  });

  it("builds the whole message", () => {
    expect(
      buildShareText({
        schoolClass: "Q1",
        dayLabel: "Heute, Donnerstag, 08.10.",
        entries: [{ ...base, className: "Q1", lesson: "2", type: "Klausur", substitute: "RUK", room: "217" }],
        ownCoursesOnly: true,
        sourceUpdated: "15:34 Uhr",
      }),
    ).toBe(
      "📋 *Vertretungsplan Q1 (meine Kurse)*\nHeute, Donnerstag, 08.10. · 1 Änderung\n\n📝 *2. Std.* · Klausur\nLehrkraft RUK · Raum 217\n\n🕐 Stand der Schule: 15:34 Uhr",
    );
    expect(
      buildShareText({ schoolClass: "5A", dayLabel: "Freitag, 09.10.", entries: [], ownCoursesOnly: false, sourceUpdated: null }),
    ).toBe("📋 *Vertretungsplan 5A*\nFreitag, 09.10.\n\n✅ Keine Änderungen, alles nach Stundenplan.");
    // With the school's notes for the day and the app's address.
    expect(
      buildShareText({
        schoolClass: "5A",
        dayLabel: "Freitag, 09.10.",
        entries: [{ ...base, type: "Entfall", teacher: "ABC" }, { ...base, lesson: "3", room: "108", type: "Raum-Vtr." }],
        ownCoursesOnly: false,
        sourceUpdated: "08.10., 15:34 Uhr",
        appUrl: classLink("https://example.org", "5A"),
        notices: ["Bitte Einsätze in SPR beachten."],
      }),
    ).toBe(
      [
        "📋 *Vertretungsplan 5A*\nFreitag, 09.10. · 2 Änderungen",
        "❌ *1. Std.* · Entfall\nLehrkraft ABC",
        "🚪 *3. Std.* · Raumänderung\nRaum 108",
        "ℹ️ Bitte Einsätze in SPR beachten.",
        "🕐 Stand der Schule: 08.10., 15:34 Uhr\n📲 Ganzer Plan: https://example.org/?klasse=5A",
      ].join("\n\n"),
    );
  });

  it("does not call a looked-at class's courses \"mine\"", () => {
    const text = buildShareText({
      schoolClass: "Q1",
      dayLabel: "Heute",
      entries: [],
      ownCoursesOnly: true,
      viewingOther: true,
      sourceUpdated: null,
    });
    expect(text.split("\n")[0]).toBe("📋 *Vertretungsplan Q1 (ausgewählte Kurse)*");
  });

  it("puts each change in a short block", () => {
    expect(
      formatShareBlock(
        { ...base, className: "06ABCD", lesson: "3 - 4", teacher: "ABC", substitute: "DEF", room: "204", text: "Aufgaben" },
        "6B",
      ),
    ).toBe("🔄 *3.–4. Std.* · Vertretung (6ABCD)\nLehrkraft ABC → DEF · Raum 204\n„Aufgaben“");
    expect(formatShareBlock({ ...base, type: "Entfall", teacher: "ABC" }, "5A")).toBe("❌ *1. Std.* · Entfall\nLehrkraft ABC");
    expect(formatShareBlock({ ...base, lesson: "", type: "" }, "5A")).toBe("🔄 *Std. ?* · Änderung");
  });

  it("says when no substitute has been found yet", () => {
    expect(formatShareBlock({ ...base, teacher: "FCH", substitute: "???", room: "TU2" }, "5A")).toBe(
      "❓ *1. Std.* · Vertretung\nLehrkraft FCH → noch offen · Raum TU2",
    );
    expect(formatShareBlock({ ...base, substitute: "???" }, "5A")).toBe("❓ *1. Std.* · Vertretung\nLehrkraft noch offen");
  });

  it("leaves out an empty class", () => {
    expect(formatShareBlock({ ...base, className: "", teacher: "JUN", type: "Entfall" }, "Q1")).toBe(
      "❌ *1. Std.* · Entfall\nLehrkraft JUN",
    );
  });

  it("says when the room is not decided yet", () => {
    expect(formatShareBlock({ ...base, type: "Raum-Vtr.", teacher: "EBT", substitute: "EBT", room: "???" }, "5A")).toBe(
      "🚪 *1. Std.* · Raumänderung\nLehrkraft EBT · Raum noch offen",
    );
  });
});

describe("day labels", () => {
  it("formats day and month, and the weekday, without the time zone shifting them", () => {
    expect(formatDayMonth("2026-10-08")).toBe("08.10.");
    expect(formatWeekday("2026-10-08")).toBe("Donnerstag");
    expect(formatDayMonth("2027-01-01")).toBe("01.01.");
  });
});

describe("cancelledFirstLessons", () => {
  const e = (lesson: string, type: string) => ({ lesson, type });
  it("names the first lessons that are all cancelled", () => {
    expect(cancelledFirstLessons([e("1 - 2", "Entfall"), e("5", "Vertretung")])).toBe(2);
    expect(cancelledFirstLessons([e("1", "Entfall"), e("2", "Entfall"), e("3", "Entfall")])).toBe(3);
    expect(cancelledFirstLessons([e("1", "Entfall")])).toBe(1);
  });

  it("says nothing when it cannot be sure", () => {
    // Not from the first lesson on.
    expect(cancelledFirstLessons([e("2 - 3", "Entfall")])).toBeNull();
    // Another group still has its lesson.
    expect(cancelledFirstLessons([e("1 - 2", "Entfall"), e("1 - 2", "Vertretung")])).toBeNull();
    // Self-study is no lesson off.
    expect(cancelledFirstLessons([e("1 - 2", "EVA")])).toBeNull();
    expect(cancelledFirstLessons([])).toBeNull();
  });
});

describe("rows without a class", () => {
  const classless = { className: "", teacher: "JUN", text: "" };

  it("belong to upper-school students who chose that teacher, nobody else", () => {
    expect(classlessEntryFor(classless, "Q1", ["JUN", "RUK"])).toBe(true);
    expect(entryForStudent(classless, "EF", ["JUN"])).toBe(true);
    // Without a chosen course nobody can tell whose they are.
    expect(classlessEntryFor(classless, "Q1", [])).toBe(false);
    expect(classlessEntryFor(classless, "Q1", ["RUK"])).toBe(false);
    expect(classlessEntryFor(classless, "9A", ["JUN"])).toBe(false);
    expect(classlessEntryFor({ ...classless, teacher: "" }, "Q1", ["JUN"])).toBe(false);
    // Rows with a class are judged as before.
    expect(entryForStudent({ className: "Q1", teacher: "ABC", text: "" }, "Q1", ["JUN"])).toBe(false);
    expect(entryForStudent({ className: "Q1", teacher: "JUN", text: "" }, "Q1", ["JUN"])).toBe(true);
    expect(entryForStudent({ className: "09AB", teacher: "JUN", text: "" }, "9A", [])).toBe(true);
  });
});

describe("lessons already over", () => {
  // 08.10.2026 in Meckenheim (summer time, UTC+2).
  const at = (time: string) => Date.parse(`2026-10-08T${time}:00+02:00`);
  const today = (lesson: string) => ({ date: "2026-10-08", lesson });

  it("knows when a lesson ends, from the school's times", () => {
    expect(lessonEnd("1")).toBe(8 * 60 + 35);
    expect(lessonEnd("3 - 4")).toBe(11 * 60 + 15);
    expect(lessonEnd("5-6")).toBe(13 * 60 + 5);
    expect(lessonEnd("9")).toBe(15 * 60 + 35);
    // Unknown: never over.
    expect(lessonEnd("10")).toBeNull();
    expect(lessonEnd("")).toBeNull();
  });

  it("are today's lessons whose end has passed", () => {
    expect(isLessonOver(today("1"), at("08:34"))).toBe(false);
    expect(isLessonOver(today("1"), at("08:35"))).toBe(true);
    // A double lesson only after its second part.
    expect(isLessonOver(today("3 - 4"), at("10:31"))).toBe(false);
    expect(isLessonOver(today("3 - 4"), at("11:15"))).toBe(true);
    // Other days never.
    expect(isLessonOver({ date: "2026-10-09", lesson: "1" }, at("16:00"))).toBe(false);
    expect(isLessonOver({ date: "2026-10-07", lesson: "1" }, at("16:00"))).toBe(false);
    expect(isLessonOver(today("?"), at("16:00"))).toBe(false);
  });
});
