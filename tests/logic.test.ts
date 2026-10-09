import { describe, expect, it } from "vitest";
import {
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
import { formatPlanDateLabel, isPastDate, relativeDayLabel } from "@/lib/format";
import {
  daysBetween,
  pickDefaultDate,
  schoolHour,
  schoolLocalToIso,
  schoolToday,
} from "@/lib/time";
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

  it("takes the server's answer otherwise", () => {
    const fresh = payload("2026-10-08T08:00:00.000Z");
    expect(pickDisplayedPayload(fresh, payload("2026-10-08T10:00:00.000Z"))).toBe(fresh);
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
