import { describe, expect, it } from "vitest";
import {
  NRW_HOLIDAYS,
  easterSunday,
  freeUntil,
  holidayBreak,
  holidayBreakAt,
  holidayDataProblem,
  nextSchoolDay,
  publicHolidayName,
  schoolDayOffName,
  schoolDaysOffNote,
} from "@/lib/holidays";

describe("holidayBreak", () => {
  it("covers the autumn holidays 2026 and the weekend after them", () => {
    expect(holidayBreak("2026-10-16")).toBeNull(); // last school day (Friday)
    expect(holidayBreak("2026-10-17")).toMatchObject({ name: "Herbstferien", backOn: "2026-11-02" });
    expect(holidayBreak("2026-10-31")).toMatchObject({ name: "Herbstferien" });
    expect(holidayBreak("2026-11-01")).toMatchObject({ name: "Herbstferien", backOn: "2026-11-02" }); // Sunday after
    expect(holidayBreak("2026-11-02")).toBeNull(); // back to school
  });

  it("counts the weekend before holidays that start on a Monday", () => {
    // Herbstferien 2028: Monday 23.10. – Saturday 04.11.
    expect(holidayBreak("2028-10-20")).toBeNull(); // Friday
    expect(holidayBreak("2028-10-21")).toMatchObject({ name: "Herbstferien", backOn: "2028-11-06" }); // Saturday
  });

  it("handles holidays across the new year and single days", () => {
    expect(holidayBreak("2027-01-01")).toMatchObject({ name: "Weihnachtsferien", backOn: "2027-01-07" });
    expect(holidayBreak("2027-05-18")).toMatchObject({ name: "Pfingstferien", backOn: "2027-05-19" });
    expect(holidayBreak("2027-05-19")).toBeNull();
  });

  it("marks the breaks as school holidays", () => {
    expect(holidayBreak("2026-10-20")).toMatchObject({ kind: "holidays" });
  });

  it("ignores ordinary weekends", () => {
    expect(holidayBreak("2026-10-10")).toBeNull(); // Saturday
    expect(holidayBreak("2026-10-11")).toBeNull(); // Sunday
  });

  it("has consistent dates, in order, for at least three school years", () => {
    NRW_HOLIDAYS.forEach((holiday, index) => {
      expect(holiday.from <= holiday.to).toBe(true);
      if (index > 0) {
        expect(NRW_HOLIDAYS[index - 1].to < holiday.from).toBe(true);
      }
    });
    expect(NRW_HOLIDAYS.at(-1)!.to >= "2029-08-01").toBe(true);
  });
});

describe("public holidays", () => {
  it("knows Easter", () => {
    expect(easterSunday(2024)).toBe("2024-03-31");
    expect(easterSunday(2025)).toBe("2025-04-20");
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2028)).toBe("2028-04-16");
    expect(easterSunday(2030)).toBe("2030-04-21");
  });

  it("has the NRW public holidays", () => {
    expect(publicHolidayName("2027-05-06")).toBe("Christi Himmelfahrt");
    expect(publicHolidayName("2027-05-17")).toBe("Pfingstmontag");
    expect(publicHolidayName("2027-05-27")).toBe("Fronleichnam");
    expect(publicHolidayName("2027-05-01")).toBe("Tag der Arbeit");
    expect(publicHolidayName("2027-10-03")).toBe("Tag der Deutschen Einheit");
    expect(publicHolidayName("2027-11-01")).toBe("Allerheiligen");
    expect(publicHolidayName("2027-12-26")).toBe("2. Weihnachtstag");
    expect(publicHolidayName("2027-05-28")).toBeNull();
  });

  it("covers a public holiday on a weekday", () => {
    // Christi Himmelfahrt 2028: Thursday; Friday is a school day again.
    expect(holidayBreak("2028-05-24")).toBeNull();
    expect(holidayBreak("2028-05-25")).toEqual({
      name: "Christi Himmelfahrt",
      from: "2028-05-25",
      to: "2028-05-25",
      kind: "public-holiday",
      backOn: "2028-05-26",
      days: [{ date: "2028-05-25", name: "Christi Himmelfahrt" }],
    });
    expect(holidayBreak("2028-05-26")).toBeNull();
  });

  it("includes the weekend next to a public holiday", () => {
    // Pfingstmontag 2028: 05.06.
    expect(holidayBreak("2028-06-02")).toBeNull(); // Friday
    expect(holidayBreak("2028-06-03")).toMatchObject({ name: "Pfingstmontag", backOn: "2028-06-06" });
    expect(holidayBreak("2028-06-05")).toMatchObject({ name: "Pfingstmontag", kind: "public-holiday" });
    expect(holidayBreak("2028-06-06")).toBeNull();
  });

  it("ignores public holidays on a weekend", () => {
    expect(holidayBreak("2026-10-03")).toBeNull(); // Saturday
    expect(holidayBreak("2026-10-04")).toBeNull();
  });

  it("prefers the school holidays and extends them over public holidays", () => {
    // Ostermontag 2027 lies in the Easter holidays.
    expect(holidayBreak("2027-03-29")).toMatchObject({ name: "Osterferien", kind: "holidays" });
    // Pfingstferien 2027 (Tuesday) follow Pfingstmontag and the weekend.
    expect(holidayBreak("2027-05-15")).toMatchObject({ name: "Pfingstferien", backOn: "2027-05-19" });
  });
});

describe("nextSchoolDay", () => {
  it("skips weekends, school holidays and public holidays", () => {
    expect(nextSchoolDay("2026-10-08")).toBe("2026-10-09"); // Thursday -> Friday
    expect(nextSchoolDay("2026-10-09")).toBe("2026-10-12"); // Friday -> Monday
    expect(nextSchoolDay("2026-10-16")).toBe("2026-11-02"); // before the autumn holidays
    expect(nextSchoolDay("2028-05-24")).toBe("2028-05-26"); // over Christi Himmelfahrt
    // The school's own days off as well.
    expect(nextSchoolDay("2026-12-03")).toBe("2026-12-07"); // Studientag on Friday
    expect(nextSchoolDay("2027-05-05")).toBe("2027-05-10"); // Himmelfahrt, then a movable holiday
  });
});

describe("freeUntil", () => {
  it("never names a day that is already over", () => {
    const autumn = holidayBreak("2026-10-20")!;
    expect(freeUntil(autumn, "2026-10-20")).toBe("2026-10-31");
    // Sunday after holidays that end on Saturday.
    expect(freeUntil(holidayBreak("2026-11-01")!, "2026-11-01")).toBe("2026-11-01");
  });
});

describe("holidayBreakAt", () => {
  it("starts the holidays at 10:00 on the first free day", () => {
    expect(holidayBreakAt("2026-10-17", 9)).toBeNull(); // Saturday morning after the last school day
    expect(holidayBreakAt("2026-10-17", 10)).toMatchObject({ name: "Herbstferien" });
    expect(holidayBreakAt("2026-10-18", 0)).toMatchObject({ name: "Herbstferien" }); // Sunday: already on
    expect(holidayBreakAt("2027-05-06", 9)).toBeNull(); // Christi Himmelfahrt, in the morning
    expect(holidayBreakAt("2027-05-06", 11)).toMatchObject({ kind: "public-holiday" });
    expect(holidayBreakAt("2026-10-16", 20)).toBeNull(); // school day
  });
});

describe("holidayDataProblem", () => {
  it("reminds half a year before the known holidays run out", () => {
    expect(holidayDataProblem("2026-10-16")).toBeNull();
    expect(holidayDataProblem("2029-10-28")).toBeNull(); // 181 days before 27.04.2030
    expect(holidayDataProblem("2029-10-29")).toBe(
      "Ferien sind nur bis 27.04.2030 eingetragen (lib/holidays.ts ergänzen).",
    );
    expect(holidayDataProblem("2030-06-01")).toContain("27.04.2030"); // also once they are over
  });
});

describe("the school's own days off (Terminkalender 2026/27)", () => {
  it("are free for everyone, with the weekend next to them", () => {
    // Pedagogical day on a Thursday: only that day.
    expect(holidayBreak("2026-10-01")).toMatchObject({ name: "Pädagogischer Tag", from: "2026-10-01", backOn: "2026-10-02" });
    expect(holidayBreak("2026-10-02")).toBeNull();
    // Movable holiday on a Friday: Friday to Sunday.
    expect(holidayBreak("2027-02-05")).toMatchObject({ name: "beweglicher Ferientag", backOn: "2027-02-08" });
    expect(holidayBreak("2027-02-07")).toMatchObject({ name: "beweglicher Ferientag" });
    expect(schoolDayOffName("2027-07-08")).toBe("Zeugniskonferenz");
    // Not every event is a day off.
    expect(schoolDayOffName("2026-12-22")).toBeNull(); // Weihnachtsgottesdienst
    expect(holidayBreak("2027-02-04")).toBeNull(); // Weiberfastnacht
  });

  it("join a public holiday right before them", () => {
    const himmelfahrt = holidayBreak("2027-05-06")!;
    expect(himmelfahrt).toMatchObject({ from: "2027-05-06", to: "2027-05-07", backOn: "2027-05-10" });
    expect(himmelfahrt.days).toEqual([
      { date: "2027-05-06", name: "Christi Himmelfahrt" },
      { date: "2027-05-07", name: "beweglicher Ferientag" },
    ]);
  });

  it("can be for some classes only", () => {
    // 19.05.2027: study day for 5–10; EF and Q1 write exams.
    expect(schoolDayOffName("2027-05-19", "7A")).toBe("Studientag");
    expect(schoolDayOffName("2027-05-19", "EF")).toBeNull();
    expect(schoolDayOffName("2027-05-19")).toBeNull();
    expect(holidayBreak("2027-05-19", undefined, "9B")).toMatchObject({ name: "Pfingstferien", backOn: "2027-05-20" });
    expect(holidayBreak("2027-05-19", undefined, "Q1")).toBeNull();
    expect(nextSchoolDay("2027-05-14", undefined, "5A")).toBe("2027-05-20");
    expect(nextSchoolDay("2027-05-14", undefined, "Q1")).toBe("2027-05-19");
  });
});

describe("schoolDaysOffNote", () => {
  it("reminds to add the next school year's days off once the year is over", () => {
    expect(schoolDaysOffNote("2026-10-30")).toBeNull();
    expect(schoolDaysOffNote("2027-07-31")).toBeNull();
    expect(schoolDaysOffNote("2027-08-01")).toContain("neue Schuljahr");
  });
});
