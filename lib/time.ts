export const SCHOOL_TIME_ZONE = "Europe/Berlin";

const DAY_MS = 86_400_000;

const zonedPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: SCHOOL_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const isoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SCHOOL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getOffsetMinutes(utcMs: number) {
  const parts = zonedPartsFormatter.formatToParts(new Date(utcMs));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const zonedAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
  );

  return Math.round((zonedAsUtc - utcMs) / 60_000);
}

/**
 * Converts a wall-clock time in the school's time zone to an ISO timestamp,
 * independent of the time zone the server runs in.
 */
export function schoolLocalToIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
) {
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);
  const firstGuess = getOffsetMinutes(naiveUtc);
  const offset = getOffsetMinutes(naiveUtc - firstGuess * 60_000);
  return new Date(naiveUtc - offset * 60_000).toISOString();
}

/** Returns today's date (YYYY-MM-DD) in the school's time zone. */
export function schoolToday(now: number) {
  return isoDateFormatter.format(new Date(now));
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** From this hour on, the next school day is more relevant than today. */
export const NEXT_DAY_FROM_HOUR = 16;

/** Current hour (0–23) in the school's time zone. */
export function schoolHour(now: number) {
  const hour = zonedPartsFormatter
    .formatToParts(new Date(now))
    .find((part) => part.type === "hour")?.value;
  return Number(hour ?? 0);
}

/**
 * The day to show by default (`dates` ascending, YYYY-MM-DD): today, or the
 * next day of the plan once school is over; the latest day if all are past.
 */
export function pickDefaultDate(dates: string[], now: number | null) {
  if (dates.length === 0) {
    return null;
  }
  if (now === null) {
    return dates[0];
  }

  const today = schoolToday(now);
  const afterSchool = schoolHour(now) >= NEXT_DAY_FROM_HOUR;
  const upcoming = dates.find((date) => (afterSchool ? date > today : date >= today));
  return upcoming ?? dates[dates.length - 1];
}
