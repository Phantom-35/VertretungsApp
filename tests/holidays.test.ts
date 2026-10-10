import { describe, expect, it } from "vitest";
import { NRW_HOLIDAYS, easterSunday, holidayBreak, publicHolidayName } from "@/lib/holidays";

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
    // Christi Himmelfahrt 2027: Thursday; Friday is a school day again.
    expect(holidayBreak("2027-05-05")).toBeNull();
    expect(holidayBreak("2027-05-06")).toEqual({
      name: "Christi Himmelfahrt",
      from: "2027-05-06",
      to: "2027-05-06",
      kind: "public-holiday",
      backOn: "2027-05-07",
    });
    expect(holidayBreak("2027-05-07")).toBeNull();
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
