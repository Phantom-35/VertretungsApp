/**
 * A day notice laid out for reading. The parser joins the lines the school
 * wrote with " · " (see extractNotices); here they become lines again: the
 * first one a heading, the rest a short list. A line like "EF: 8:40 Uhr"
 * keeps its label apart, so that it can be set in bold. Nothing is left out.
 */
export type NoticeLine = { label: string | null; text: string };
export type NoticeLayout = { heading: string | null; lines: NoticeLine[] };

/** Labels are short ("EF", "alle 9. Klassen", "Q1/Q2"); a long text before ": " is a sentence. */
const MAX_LABEL = 24;

function splitLabel(line: string): NoticeLine {
  // ": " with a space, so that times like "8:40" are not taken for a label.
  const index = line.indexOf(": ");
  if (index > 0 && index <= MAX_LABEL) {
    return { label: line.slice(0, index), text: line.slice(index + 2) };
  }
  return { label: null, text: line };
}

export function noticeLayout(notice: string): NoticeLayout {
  const parts = notice
    .split(" · ")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    return { heading: null, lines: parts.map(splitLabel) };
  }
  return { heading: parts[0], lines: parts.slice(1).map(splitLabel) };
}
