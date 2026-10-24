import {
  displayType,
  formatClassName,
  formatLesson,
  getEntryKind,
  isOpenSubstitute,
  type EntryKind,
} from "@/lib/entries";
import type { SubstitutionEntry } from "@/lib/types";

type ShareOptions = {
  schoolClass: string;
  /** "Heute, Donnerstag, 08.10." */
  dayLabel: string;
  entries: SubstitutionEntry[];
  /** Only the chosen courses are included. */
  ownCoursesOnly: boolean;
  /** The class is only looked at (e.g. a sibling's): its courses are not "mine". */
  viewingOther?: boolean;
  /** "08.10., 15:34 Uhr"; omitted when unknown. */
  sourceUpdated: string | null;
  /** The app's address (opening at the class), so that whoever gets the message finds the plan. */
  appUrl?: string | null;
  /** The school's notes for the day ("Nachrichten zum Tag"). */
  notices?: readonly string[];
};

/** A symbol per kind of change, to see at a glance in a chat what it is about. */
const KIND_SYMBOLS: Record<EntryKind, string> = {
  cancelled: "❌",
  "self-study": "📚",
  substitution: "🔄",
  supervision: "🧑‍🏫",
  room: "🚪",
  moved: "↪️",
  exam: "📝",
  event: "📌",
};

/** The symbol of an entry: its kind, or "❓" while nobody has been found to substitute. */
export function entrySymbol(entry: Pick<SubstitutionEntry, "type" | "substitute">) {
  return isOpenSubstitute(entry.substitute) ? "❓" : KIND_SYMBOLS[getEntryKind(entry.type)];
}

/** "3 - 4" -> "3.–4. Std.", "5" -> "5. Std." */
export function lessonLabel(lesson: string) {
  return lesson ? `${formatLesson(lesson).replace(/(\d+)/g, "$1.")} Std.` : "Std. ?";
}

export function teacherLabel({ teacher, substitute }: Pick<SubstitutionEntry, "teacher" | "substitute">) {
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

/**
 * One change as a short block for messengers. "*…*" is bold in WhatsApp
 * (most other messengers show the stars as they are):
 *   🔄 *3.–4. Std.* · Vertretung (9AB)
 *   Lehrer FER → GOT · Raum 109
 *   „Aufgaben im Lernraum“
 */
export function formatShareBlock(entry: DescribedEntry, schoolClass: string) {
  const className = formatClassName(entry.className);
  const teacher = teacherLabel(entry);
  const symbol = entrySymbol(entry);
  const details = [
    entry.subject ? `Fach ${entry.subject}` : "",
    teacher ? `Lehrer ${teacher}` : "",
    entry.room ? `Raum ${entry.room}` : "",
  ].filter(Boolean);
  return [
    `${symbol} *${lessonLabel(entry.lesson)}* · ${displayType(entry.type)}${className !== schoolClass ? ` (${className})` : ""}`,
    ...(details.length > 0 ? [details.join(" · ")] : []),
    ...(entry.text ? [`„${entry.text}“`] : []),
  ].join("\n");
}

/** Text of one day's changes, for messengers or the clipboard. */
export function buildShareText({
  schoolClass,
  dayLabel,
  entries,
  ownCoursesOnly,
  viewingOther = false,
  sourceUpdated,
  appUrl = null,
  notices = [],
}: ShareOptions) {
  const count = entries.length === 1 ? "1 Änderung" : `${entries.length} Änderungen`;
  const heading = [
    `📋 *Vertretungsplan ${schoolClass}${ownCoursesOnly ? (viewingOther ? " (ausgewählte Kurse)" : " (meine Kurse)") : ""}*`,
    entries.length > 0 ? `${dayLabel} · ${count}` : dayLabel,
  ].join("\n");
  const body =
    entries.length > 0
      ? entries.map((entry) => formatShareBlock(entry, schoolClass))
      : ["✅ Keine Änderungen, alles nach Stundenplan."];
  const notes = notices.length > 0 ? [notices.map((notice) => `ℹ️ ${notice}`).join("\n")] : [];
  const footer = [
    ...(sourceUpdated ? [`🕐 Stand der Schule: ${sourceUpdated}`] : []),
    ...(appUrl ? [`📲 Ganzer Plan: ${appUrl}`] : []),
  ].join("\n");
  // Blank lines between the blocks keep it readable in a chat.
  return [heading, ...body, ...notes, ...(footer ? [footer] : [])].join("\n\n");
}

/** The app's address opening at a class ("…/?klasse=7B"), for shared texts. */
export function classLink(origin: string, schoolClass: string) {
  return schoolClass ? `${origin}/?klasse=${encodeURIComponent(schoolClass)}` : `${origin}/`;
}
