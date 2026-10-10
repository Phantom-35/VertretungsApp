import { daysBetween } from "@/lib/time";

export type Holiday = {
  name: string;
  /** First and last day off, YYYY-MM-DD, both included. */
  from: string;
  to: string;
};

/**
 * School holidays in North Rhine-Westphalia, from the Ferienordnung of the
 * Ministerium für Schule und Bildung NRW ("Ferienordnung für Nordrhein-
 * Westfalen für die Schuljahre bis 2029/30"). The movable holidays each
 * school sets itself are not included. Extend when the ministry publishes
 * later years.
 */
export const NRW_HOLIDAYS: readonly Holiday[] = [
  { name: "Herbstferien", from: "2026-10-17", to: "2026-10-31" },
  { name: "Weihnachtsferien", from: "2026-12-23", to: "2027-01-06" },
  { name: "Osterferien", from: "2027-03-22", to: "2027-04-03" },
  { name: "Pfingstferien", from: "2027-05-18", to: "2027-05-18" },
  { name: "Sommerferien", from: "2027-07-19", to: "2027-08-31" },
  { name: "Herbstferien", from: "2027-10-23", to: "2027-11-06" },
  { name: "Weihnachtsferien", from: "2027-12-24", to: "2028-01-08" },
  { name: "Osterferien", from: "2028-04-10", to: "2028-04-22" },
  { name: "Sommerferien", from: "2028-07-10", to: "2028-08-22" },
  { name: "Herbstferien", from: "2028-10-23", to: "2028-11-04" },
  { name: "Weihnachtsferien", from: "2028-12-21", to: "2029-01-05" },
  { name: "Osterferien", from: "2029-03-26", to: "2029-04-07" },
  { name: "Pfingstferien", from: "2029-05-22", to: "2029-05-22" },
  { name: "Sommerferien", from: "2029-07-02", to: "2029-08-14" },
  { name: "Herbstferien", from: "2029-10-15", to: "2029-10-27" },
  { name: "Weihnachtsferien", from: "2029-12-20", to: "2030-01-04" },
  { name: "Osterferien", from: "2030-04-15", to: "2030-04-27" },
];

function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function isWeekend(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

export type HolidayBreak = Holiday & {
  /** First school day after the holidays (and the weekend around them). */
  backOn: string;
};

/**
 * The holidays `date` falls into, including the weekend right before them
 * (so the Saturday and Sunday before already count) and after them.
 * Null on school days and ordinary weekends.
 */
export function holidayBreak(date: string, holidays: readonly Holiday[] = NRW_HOLIDAYS): HolidayBreak | null {
  for (const holiday of holidays) {
    // The weekend before: Saturday/Sunday leading into the first day.
    let start = holiday.from;
    while (isWeekend(addDays(start, -1))) {
      start = addDays(start, -1);
    }
    let backOn = addDays(holiday.to, 1);
    while (isWeekend(backOn)) {
      backOn = addDays(backOn, 1);
    }
    if (date >= start && daysBetween(date, backOn) > 0) {
      return { ...holiday, backOn };
    }
  }
  return null;
}
