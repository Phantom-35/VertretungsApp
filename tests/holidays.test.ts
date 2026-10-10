import { describe, expect, it } from "vitest";
import { NRW_HOLIDAYS, holidayBreak } from "@/lib/holidays";

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
