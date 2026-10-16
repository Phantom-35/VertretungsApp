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

/** Easter Sunday (Gregorian calendar, anonymous algorithm), YYYY-MM-DD. */
export function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const publicHolidayCache = new Map<number, Map<string, string>>();

/** Public holidays in North Rhine-Westphalia: date -> name. */
export function publicHolidays(year: number) {
  let holidays = publicHolidayCache.get(year);
  if (!holidays) {
    const easter = easterSunday(year);
    holidays = new Map([
      [`${year}-01-01`, "Neujahr"],
      [addDays(easter, -2), "Karfreitag"],
      [addDays(easter, 1), "Ostermontag"],
      [`${year}-05-01`, "Tag der Arbeit"],
      [addDays(easter, 39), "Christi Himmelfahrt"],
      [addDays(easter, 50), "Pfingstmontag"],
      [addDays(easter, 60), "Fronleichnam"],
      [`${year}-10-03`, "Tag der Deutschen Einheit"],
      [`${year}-11-01`, "Allerheiligen"],
      [`${year}-12-25`, "1. Weihnachtstag"],
      [`${year}-12-26`, "2. Weihnachtstag"],
    ]);
    publicHolidayCache.set(year, holidays);
  }
  return holidays;
}

/** Name of the public holiday on `date`, or null. */
export function publicHolidayName(date: string) {
  return publicHolidays(Number(date.slice(0, 4))).get(date) ?? null;
}

/** No school: weekends and public holidays. */
function isDayOff(date: string) {
  return isWeekend(date) || publicHolidayName(date) !== null;
}

export type HolidayBreak = Holiday & {
  /** School holidays, or a public holiday (with the weekend around it). */
  kind: "holidays" | "public-holiday";
  /** First school day after the holidays (and the days off around them). */
  backOn: string;
};

/**
 * The days off `date` falls into: school holidays, including the weekend
 * (and public holidays) right before and after them, or a public holiday on
 * a weekday together with the weekend next to it, e.g. Saturday to
 * Pfingstmontag. Null on school days and ordinary weekends.
 */
export function holidayBreak(date: string, holidays: readonly Holiday[] = NRW_HOLIDAYS): HolidayBreak | null {
  for (const holiday of holidays) {
    // The days off before: Saturday/Sunday leading into the first day.
    let start = holiday.from;
    while (isDayOff(addDays(start, -1))) {
      start = addDays(start, -1);
    }
    let backOn = addDays(holiday.to, 1);
    while (isDayOff(backOn)) {
      backOn = addDays(backOn, 1);
    }
    if (date >= start && daysBetween(date, backOn) > 0) {
      return { ...holiday, kind: "holidays", backOn };
    }
  }

  if (!isDayOff(date)) {
    return null;
  }
  // The run of days off around `date`; it counts when a weekday in it is a
  // public holiday (a holiday on a Saturday or Sunday changes nothing).
  let start = date;
  while (isDayOff(addDays(start, -1))) {
    start = addDays(start, -1);
  }
  let backOn = date;
  while (isDayOff(backOn)) {
    backOn = addDays(backOn, 1);
  }
  const weekdayHolidays: string[] = [];
  for (let day = start; day < backOn; day = addDays(day, 1)) {
    if (!isWeekend(day)) {
      weekdayHolidays.push(day);
    }
  }
  if (weekdayHolidays.length === 0) {
    return null;
  }
  return {
    name: weekdayHolidays.map((day) => publicHolidayName(day)).join(" und "),
    from: weekdayHolidays[0],
    to: weekdayHolidays.at(-1)!,
    kind: "public-holiday",
    backOn,
  };
}

/** On the first free day, the holiday card only shows from this hour on. */
export const HOLIDAY_FROM_HOUR = 10;

/**
 * Like holidayBreak, but on the first free day only from HOLIDAY_FROM_HOUR
 * on: in the morning after the last school day the plan stays, as on an
 * ordinary Saturday. `hour` is the hour (0–23) in the school's time zone.
 */
export function holidayBreakAt(date: string, hour: number, holidays: readonly Holiday[] = NRW_HOLIDAYS) {
  const holiday = holidayBreak(date, holidays);
  if (holiday && hour < HOLIDAY_FROM_HOUR && !holidayBreak(addDays(date, -1), holidays)) {
    return null;
  }
  return holiday;
}

/**
 * The next day with school after `date`: not a weekend, not in the school
 * holidays, not a public holiday.
 */
export function nextSchoolDay(date: string, holidays: readonly Holiday[] = NRW_HOLIDAYS) {
  let day = addDays(date, 1);
  // A year at most, in case the holiday data were ever inconsistent.
  for (let tries = 0; tries < 366 && (isWeekend(day) || holidayBreak(day, holidays)); tries += 1) {
    day = addDays(day, 1);
  }
  return day;
}

/**
 * The last free day to name: the end of the holidays, or on the weekend
 * after them (e.g. Sunday after holidays ending on Saturday) that weekend's
 * last day, so the text never names a day that is already over.
 */
export function freeUntil(holiday: HolidayBreak, today: string | null) {
  return today !== null && today > holiday.to ? addDays(holiday.backOn, -1) : holiday.to;
}
