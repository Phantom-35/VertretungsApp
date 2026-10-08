import { SCHOOL_TIME_ZONE, daysBetween, schoolToday } from "@/lib/time";

// All formatting uses a fixed time zone so that server and client render the
// same text (no hydration mismatch) and times match the school's clock.
const planDateFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: "UTC",
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
});

const shortDateFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: "UTC",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: SCHOOL_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: SCHOOL_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

/** "2026-10-08" -> "Donnerstag, 08.10." */
export function formatPlanDate(date: string) {
  return planDateFormatter.format(new Date(`${date}T00:00:00Z`));
}

/** "2026-10-08" -> "Do., 08.10." */
export function formatShortDate(date: string) {
  return shortDateFormatter.format(new Date(`${date}T00:00:00Z`));
}

/** "Heute", "Morgen", "Gestern" or null; needs the current time. */
export function relativeDayLabel(date: string, now: number | null) {
  if (now === null) {
    return null;
  }

  switch (daysBetween(schoolToday(now), date)) {
    case 0:
      return "Heute";
    case 1:
      return "Morgen";
    case -1:
      return "Gestern";
    default:
      return null;
  }
}

export function isPastDate(date: string, now: number | null) {
  return now !== null && daysBetween(schoolToday(now), date) < 0;
}

/** "Heute, Donnerstag, 08.10." (or without the relative part on the server) */
export function formatPlanDateLabel(date: string, now: number | null) {
  const relative = relativeDayLabel(date, now);
  const absolute = formatPlanDate(date);
  return relative ? `${relative}, ${absolute}` : absolute;
}

/** "15:34" for today, "07.10., 15:34" otherwise. */
export function formatTimestamp(value: string | null, now: number | null) {
  if (!value) {
    return "unbekannt";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  if (now !== null && schoolToday(now) === schoolToday(parsed.getTime())) {
    return `${timeFormatter.format(parsed)} Uhr`;
  }

  return `${dateTimeFormatter.format(parsed)} Uhr`;
}

/** "gerade eben", "vor 5 Min.", "vor 2 Std." or an absolute timestamp. */
export function formatAge(value: string | null, now: number | null) {
  if (!value || now === null) {
    return formatTimestamp(value, now);
  }

  const minutes = Math.floor((now - new Date(value).getTime()) / 60_000);

  if (Number.isNaN(minutes)) {
    return value;
  }
  if (minutes < 1) {
    return "gerade eben";
  }
  if (minutes < 60) {
    return `vor ${minutes} Min.`;
  }
  if (minutes < 6 * 60) {
    return `vor ${Math.floor(minutes / 60)} Std.`;
  }

  return formatTimestamp(value, now);
}
