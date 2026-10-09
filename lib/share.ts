import { formatClassName, formatLesson } from "@/lib/entries";
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
};

/** "3 - 4" -> "3.–4. Std.", "5" -> "5. Std." */
function lessonLabel(lesson: string) {
  return lesson ? `${formatLesson(lesson).replace(/(\d+)/g, "$1.")} Std.` : "Std. ?";
}

function teacherLabel({ teacher, substitute }: SubstitutionEntry) {
  if (teacher && substitute && teacher !== substitute) {
    return `${teacher} → ${substitute}`;
  }
  return substitute || teacher;
}

/** One line per change, e.g. "• 3.–4. Std.: Entfall · ABC · Raum 204". */
export function formatShareLine(entry: SubstitutionEntry, schoolClass: string) {
  const className = formatClassName(entry.className);
  const details = [
    entry.type || "Änderung",
    className !== schoolClass ? className : "",
    entry.subject ? `Fach ${entry.subject}` : "",
    teacherLabel(entry),
    entry.room ? `Raum ${entry.room}` : "",
    entry.text ? `„${entry.text}“` : "",
  ].filter(Boolean);
  return `• ${lessonLabel(entry.lesson)}: ${details.join(" · ")}`;
}

/** Plain text of one day's changes, for messengers or the clipboard. */
export function buildShareText({
  schoolClass,
  dayLabel,
  entries,
  ownCoursesOnly,
  sourceUpdated,
}: ShareOptions) {
  const heading = `Vertretungsplan ${schoolClass}${ownCoursesOnly ? " (meine Kurse)" : ""} – ${dayLabel}`;
  const body =
    entries.length > 0
      ? entries.map((entry) => formatShareLine(entry, schoolClass))
      : ["Keine Änderungen eingetragen."];
  return [heading, ...body, ...(sourceUpdated ? [`Stand: ${sourceUpdated}`] : [])].join("\n");
}
