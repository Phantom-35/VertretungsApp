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
  | "moved"
  | "supervision"
  | "room"
  | "substitution";

// Checked in this order, so that compound words land in the right group
// ("Raumverlegung" is a room change, "Freiarbeit" is self-study).
export function getEntryKind(type: string): EntryKind {
  const normalized = type.trim().toLowerCase();

  // Same lesson, other teacher.
  if (/lehrertausch|lehrerwechsel/.test(normalized)) {
    return "substitution";
  }
  // "Entfall", "Entf.", "Ausfall", "frei(e)", "unterrichtsfrei", "Freisetzung";
  // not "Freiarbeit".
  if (/entf(all|\.|\b)|fällt aus|ausfall|freie?\b|freisetz/.test(normalized)) {
    return "cancelled";
  }
  if (/^eva\b|eigenverantw|selbststudium|stillarbeit|freiarbeit/.test(normalized)) {
    return "self-study";
  }
  if (/klausur|prüfung|nachschreib/.test(normalized)) {
    return "exam";
  }
  if (/veranst|exkursion|ausflug|wandertag|fahrt\b|sondereins/.test(normalized)) {
    return "event";
  }
  if (/raum/.test(normalized)) {
    return "room";
  }
  // "Verlegung", "verlegt", "Tausch", "Stundentausch", "Std.-Tausch".
  if (/verleg|tausch/.test(normalized)) {
    return "moved";
  }
  // "Betreuung", "Mitbetreuung", "Aufsicht": supervised instead of taught.
  if (/betreu|aufsicht/.test(normalized)) {
    return "supervision";
  }

  return "substitution";
}

export const entryKindHints: Partial<Record<EntryKind, string>> = {
  "self-study": "Eigenverantwortliches Arbeiten",
  cancelled: "Unterricht fällt aus",
  moved: "Stunde wurde verlegt",
  supervision: "Klasse wird beaufsichtigt",
};

const kindLabels: Record<EntryKind, [singular: string, plural: string]> = {
  cancelled: ["Ausfall", "Ausfälle"],
  "self-study": ["EVA", "EVA"],
  exam: ["Klausur", "Klausuren"],
  event: ["Veranstaltung", "Veranstaltungen"],
  moved: ["Verlegung", "Verlegungen"],
  supervision: ["Betreuung", "Betreuungen"],
  room: ["Raumänderung", "Raumänderungen"],
  substitution: ["Vertretung", "Vertretungen"],
};

/** "1 Ausfall", "2 Klausuren" … per kind, most important first. */
export function summarizeEntries(entries: Pick<SubstitutionEntry, "type">[]) {
  const counts = new Map<EntryKind, number>();
  entries.forEach((entry) => {
    const kind = getEntryKind(entry.type);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  });

  return (Object.keys(kindLabels) as EntryKind[])
    .filter((kind) => counts.has(kind))
    .map((kind) => {
      const count = counts.get(kind)!;
      const [singular, plural] = kindLabels[kind];
      return { kind, count, label: `${count} ${count === 1 ? singular : plural}` };
    });
}

/** Classes of the upper school, where students attend courses, not one class. */
export function isCourseClass(schoolClass: string) {
  return /^(EF|Q1|Q2)$/.test(schoolClass);
}

/** "kag" -> "KAG"; null if it does not look like a teacher abbreviation. */
export function normalizeTeacher(value: string) {
  const normalized = value.trim().toUpperCase();
  return /^[A-ZÄÖÜ]{2,4}$/.test(normalized) ? normalized : null;
}

/**
 * Teachers that identify the course of an entry: the "(Lehrer)" column, or
 * for exams (no teacher) the abbreviations in the text, e.g. "Q1 S GK RUK".
 */
export function courseTeachers(entry: Pick<SubstitutionEntry, "teacher" | "text">) {
  const source = entry.teacher || entry.text;
  return (source.match(/[A-ZÄÖÜ]+/g) ?? []).filter(
    (token) => token.length >= 3 && token.length <= 4,
  );
}

/**
 * Whether an entry belongs to one of the student's courses, identified by
 * their teachers. Without a filter, or when the entry names no teacher,
 * everything is shown: better one entry too many than a missed change.
 */
export function entryMatchesTeachers(
  entry: Pick<SubstitutionEntry, "teacher" | "text">,
  teachers: readonly string[],
) {
  if (teachers.length === 0) {
    return true;
  }
  const own = courseTeachers(entry);
  return own.length === 0 || own.some((teacher) => teachers.includes(teacher));
}
