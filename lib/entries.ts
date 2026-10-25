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

/** "3 - 4" -> 3; lessons without a number sort last. */
export function lessonStart(lesson: string) {
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

/** For screen readers: "3. Stunde", "3. bis 4. Stunde" (not "S-T-D 3 Strich 4"). */
export function spokenLesson(lesson: string) {
  const parts = lesson.split(/\s*-\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    return "Stunde unbekannt";
  }
  if (parts.length === 1) {
    return /^\d+$/.test(parts[0]) ? `${parts[0]}. Stunde` : `Stunde ${parts[0]}`;
  }
  return `${parts[0]}. bis ${parts.at(-1)}. Stunde`;
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

/**
 * Untis abbreviations and internal terms, spelled out for students:
 * "Statt-Vertretung" (a teacher's lesson replaced by another) is simply a
 * substitution for them.
 */
const TYPE_NAMES: Record<string, string> = {
  "statt-vertretung": "Vertretung",
  "veranst.": "Veranstaltung",
  "raum-vtr.": "Raumänderung",
  "vtr.": "Vertretung",
  "entf.": "Entfall",
  "verl.": "Verlegung",
  "betr.": "Betreuung",
};

/** The type as shown to users: "Veranst." -> "Veranstaltung"; "Änderung" if empty. */
export function displayType(type: string) {
  const trimmed = type.trim();
  return TYPE_NAMES[trimmed.toLowerCase()] ?? (trimmed || "Änderung");
}

export const entryKindHints: Partial<Record<EntryKind, string>> = {
  "self-study": "Aufgaben selbst bearbeiten",
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
/** The lessons an entry covers: "3 - 4" -> [3, 4], "5" -> [5]; none without a number. */
function lessonNumbers(lesson: string) {
  const numbers = (lesson.match(/\d+/g) ?? []).map(Number);
  if (numbers.length === 0) {
    return [];
  }
  const first = Math.min(...numbers);
  const last = Math.max(...numbers);
  return last - first > 12 ? [first] : Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

/**
 * For the day's summary: the last of the first lessons that are all
 * cancelled ("1.–2. Std. fallen aus"), or null. Only when nothing else is
 * planned for those lessons, so a cancellation for one group next to
 * another group's lesson does not count. Not knowing the timetable, the app
 * says what is cancelled, not that the day starts later.
 */
export function cancelledFirstLessons(entries: Pick<SubstitutionEntry, "lesson" | "type">[]) {
  const cancelled = new Set<number>();
  const other = new Set<number>();
  for (const entry of entries) {
    const target = getEntryKind(entry.type) === "cancelled" ? cancelled : other;
    lessonNumbers(entry.lesson).forEach((lesson) => target.add(lesson));
  }
  let last = 0;
  while (cancelled.has(last + 1) && !other.has(last + 1)) {
    last += 1;
  }
  return last > 0 ? last : null;
}

export function isCourseClass(schoolClass: string) {
  return /^(EF|Q1|Q2)$/.test(schoolClass);
}

/**
 * Untis writes "???" as substitute while nobody has been found yet. It is
 * kept (unlike other placeholders) so the app can say so.
 */
export const OPEN_SUBSTITUTE = "???";

export function isOpenSubstitute(substitute: string) {
  return substitute === OPEN_SUBSTITUTE;
}

/**
 * The same "???" as room: the lesson takes place, but where is not decided
 * yet (e.g. a room change without the room). Kept only where a room matters,
 * not for cancelled lessons or self-study.
 */
export const OPEN_ROOM = "???";

export function isOpenRoom(room: string) {
  return room === OPEN_ROOM;
}

/** "Raum 204", "Raum noch offen", or "" without a room. */
export function roomLabel(room: string) {
  return room ? `Raum ${isOpenRoom(room) ? "noch offen" : room}` : "";
}

/** "kag" -> "KAG"; null if it does not look like a teacher abbreviation. */
export function normalizeTeacher(value: string) {
  const normalized = value.trim().toUpperCase();
  return /^[A-ZÄÖÜ]{2,4}$/.test(normalized) ? normalized : null;
}

/**
 * Teachers that identify the course of an entry: the "(Lehrer)" column, or
 * for exams (no teacher) the abbreviations in a course label in the text,
 * e.g. "Q1 S GK RUK". Other texts ("ABI-Info in der AULA") name no course.
 */
export function courseTeachers(entry: Pick<SubstitutionEntry, "teacher" | "text">) {
  const courseLabel = /^(EF|Q1|Q2)\s/.test(entry.text.trim()) ? entry.text : "";
  const source = entry.teacher || courseLabel;
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

/**
 * Some rows name no class, only a teacher (e.g. a course the plan gives no
 * class for). Nobody can tell whose they are, except upper-school students
 * who chose that teacher as one of their courses: they get them.
 */
export function classlessEntryFor(
  entry: Pick<SubstitutionEntry, "className" | "teacher" | "text">,
  schoolClass: string,
  teachers: readonly string[],
) {
  return (
    !entry.className &&
    isCourseClass(schoolClass) &&
    teachers.length > 0 &&
    courseTeachers(entry).some((teacher) => teachers.includes(teacher))
  );
}

/** Whether an entry is for a student: their class (and courses), or a classless row of one of their courses. */
export function entryForStudent(
  entry: Pick<SubstitutionEntry, "className" | "teacher" | "text">,
  schoolClass: string,
  teachers: readonly string[],
) {
  return entry.className
    ? entryAppliesToClass(entry.className, schoolClass) && entryMatchesTeachers(entry, teachers)
    : classlessEntryFor(entry, schoolClass, teachers);
}

/**
 * The place in the timetable an entry is about: date, class and lesson. In
 * the upper school one lesson holds many courses, so the course (its
 * teachers) is part of it; otherwise unrelated courses would be paired as
 * "now X (before Y)".
 */
export function timetableSlot(
  entry: Pick<SubstitutionEntry, "date" | "className" | "lesson" | "teacher" | "text">,
) {
  const slot = `${entry.date}|${entry.className}|${entry.lesson}`;
  return isCourseClass(formatClassName(entry.className))
    ? `${slot}|${[...courseTeachers(entry)].sort().join(",")}`
    : slot;
}
