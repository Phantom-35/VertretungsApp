import { displayType, formatClassName, formatLesson, isOpenSubstitute } from "@/lib/entries";
import type { SubstitutionEntry } from "@/lib/types";

type ShareOptions = {
  schoolClass: string;
  /** "Heute, Donnerstag, 08.10." */
  dayLabel: string;
  entries: SubstitutionEntry[];
  /** Only the student's own courses are included. */
  ownCoursesOnly: boolean;
  /** "08.10., 15:34 Uhr"; omitted when unknown. */
  sourceUpdated: string | null;
  /** The app's address, so that whoever gets the message can find the app. */
  appUrl?: string | null;
};

/** "3 - 4" -> "3.–4. Std.", "5" -> "5. Std." */
export function lessonLabel(lesson: string) {
  return lesson ? `${formatLesson(lesson).replace(/(\d+)/g, "$1.")} Std.` : "Std. ?";
}

function teacherLabel({ teacher, substitute }: Pick<SubstitutionEntry, "teacher" | "substitute">) {
  if (isOpenSubstitute(substitute)) {
    return teacher ? `${teacher} → noch offen` : "noch offen";
  }
  if (teacher && substitute && teacher !== substitute) {
    return `${teacher} → ${substitute}`;
  }
  return substitute || teacher;
}

type DescribedEntry = Pick<
  SubstitutionEntry,
  "className" | "lesson" | "type" | "substitute" | "teacher" | "room" | "subject" | "text"
>;

/** "Entfall · 6ABCD · ABC → DEF · Raum 204 · „Aufgaben“" */
export function describeEntry(entry: DescribedEntry, schoolClass: string) {
  const className = formatClassName(entry.className);
  return [
    displayType(entry.type),
    className !== schoolClass ? className : "",
    entry.subject ? `Fach ${entry.subject}` : "",
    teacherLabel(entry),
    entry.room ? `Raum ${entry.room}` : "",
    entry.text ? `„${entry.text}“` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** One line per change, e.g. "• 3.–4. Std.: Entfall · ABC · Raum 204". */
export function formatShareLine(entry: DescribedEntry, schoolClass: string) {
  return `• ${lessonLabel(entry.lesson)}: ${describeEntry(entry, schoolClass)}`;
}

/**
 * One change as a short block for messengers:
 *   3.–4. Std. · Vertretung (9AB)
 *   Lehrer FER → GOT · Raum 109
 *   „Aufgaben im Lernraum“
 */
export function formatShareBlock(entry: DescribedEntry, schoolClass: string) {
  const className = formatClassName(entry.className);
  const teacher = teacherLabel(entry);
  const details = [
    entry.subject ? `Fach ${entry.subject}` : "",
    teacher ? `Lehrer ${teacher}` : "",
    entry.room ? `Raum ${entry.room}` : "",
  ].filter(Boolean);
  return [
    `${lessonLabel(entry.lesson)} · ${displayType(entry.type)}${className !== schoolClass ? ` (${className})` : ""}`,
    ...(details.length > 0 ? [details.join(" · ")] : []),
    ...(entry.text ? [`„${entry.text}“`] : []),
  ].join("\n");
}

/** Plain text of one day's changes, for messengers or the clipboard. */
export function buildShareText({
  schoolClass,
  dayLabel,
  entries,
  ownCoursesOnly,
  sourceUpdated,
  appUrl = null,
}: ShareOptions) {
  const heading = [`Vertretungsplan ${schoolClass}${ownCoursesOnly ? " (meine Kurse)" : ""}`, dayLabel].join("\n");
  const body =
    entries.length > 0
      ? entries.map((entry) => formatShareBlock(entry, schoolClass))
      : ["Keine Änderungen eingetragen."];
  // Blank lines between the blocks keep it readable in a chat.
  const footer = [
    ...(sourceUpdated ? [`Stand der Schule: ${sourceUpdated}`] : []),
    ...(appUrl ? [`Ganzer Plan in der App: ${appUrl}`] : []),
  ].join("\n");
  return [heading, ...body, ...(footer ? [footer] : [])].join("\n\n");
}
