import type { SubstitutionEntry } from "@/lib/types";

export const SCHOOL_CLASSES = [
  ...[5, 6, 7, 8, 9, 10].flatMap((grade) =>
    ["A", "B", "C", "D"].map((suffix) => `${grade}${suffix}`),
  ),
  "EF",
  "Q1",
  "Q2",
];

function stripLeadingZeros(value: string) {
  return value.replace(/^0+(?=\d)/, "");
}

export function normalizeSelectedClass(value: string) {
  const normalized = stripLeadingZeros(value.trim().toUpperCase());
  return SCHOOL_CLASSES.includes(normalized) ? normalized : null;
}

/** "06ABCD" -> "6ABCD", "05A, 05B" -> "5A, 5B" */
export function formatClassName(value: string) {
  return value
    .split(/\s*,\s*/)
    .map((part) => stripLeadingZeros(part.trim()))
    .join(", ");
}

/**
 * Untis lists combined classes as "06ABCD" or "05A, 05B". An entry applies to
 * the selected class if any of those groups contains it.
 */
export function entryAppliesToClass(entryClassName: string, selectedClass: string) {
  const schoolClass = selectedClass.toUpperCase();
  const selectedMatch = schoolClass.match(/^(\d{1,2})([A-D])$/);

  return entryClassName
    .toUpperCase()
    .split(/[,;/]+/)
    .map((token) => stripLeadingZeros(token.replace(/\s+/g, "")))
    .some((token) => {
      if (token === schoolClass) {
        return true;
      }

      const sourceMatch = token.match(/^(\d{1,2})([A-D]+)$/);
      return Boolean(
        selectedMatch &&
          sourceMatch &&
          selectedMatch[1] === sourceMatch[1] &&
          sourceMatch[2].includes(selectedMatch[2]),
      );
    });
}

function lessonStart(lesson: string) {
  return Number(lesson.match(/\d+/)?.[0] ?? Number.MAX_SAFE_INTEGER);
}

export function compareEntries(left: SubstitutionEntry, right: SubstitutionEntry) {
  if (left.date !== right.date) {
    return left.date.localeCompare(right.date);
  }

  const lessonDifference = lessonStart(left.lesson) - lessonStart(right.lesson);
  if (lessonDifference !== 0) {
    return lessonDifference;
  }

  return left.lesson.localeCompare(right.lesson, "de-DE", { numeric: true });
}

/** "3 - 4" -> "3–4" */
export function formatLesson(lesson: string) {
  return lesson.replace(/\s*-\s*/g, "–");
}

export type EntryKind =
  | "cancelled"
  | "self-study"
  | "exam"
  | "event"
  | "room"
  | "substitution";

export function getEntryKind(type: string): EntryKind {
  const normalized = type.toLowerCase();

  if (/entfall|fällt aus|frei/.test(normalized)) {
    return "cancelled";
  }
  if (/^eva\b|eigenverantw/.test(normalized)) {
    return "self-study";
  }
  if (/klausur|prüfung/.test(normalized)) {
    return "exam";
  }
  if (/veranst|exkursion|ausflug/.test(normalized)) {
    return "event";
  }
  if (/raum/.test(normalized)) {
    return "room";
  }

  return "substitution";
}

export const entryKindHints: Partial<Record<EntryKind, string>> = {
  "self-study": "Eigenverantwortliches Arbeiten",
  cancelled: "Unterricht fällt aus",
};
