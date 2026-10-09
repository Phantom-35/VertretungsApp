import { describe, expect, it } from "vitest";
import {
  entryAppliesToClass,
  formatClassName,
  formatLesson,
  getEntryKind,
  normalizeSelectedClass,
} from "@/lib/entries";
import { formatPlanDateLabel, isPastDate, relativeDayLabel } from "@/lib/format";
import { daysBetween, schoolLocalToIso, schoolToday } from "@/lib/time";
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
