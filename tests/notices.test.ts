import { describe, expect, it } from "vitest";
import { noticeLayout } from "@/lib/notices";

describe("laying out a day notice", () => {
  it("makes the school's lines lines again, with a heading and labels, leaving nothing out", () => {
    const notice =
      "Berufsinformationstag (BIT) am Campus (JHH, Aula-THR, KAG, Rathaus) · EF: 8:40–13:15 Uhr · alle 9. Klassen: 9:45–13:15 Uhr · Q1/Q2: ab 12:20 Uhr (bitte pünktlich losgehen, der Weg zur Jungholzhalle ist lang) · Der Nachmittagsunterricht ab der 8. Stunde findet statt.";
    const layout = noticeLayout(notice);
    expect(layout).toEqual({
      heading: "Berufsinformationstag (BIT) am Campus (JHH, Aula-THR, KAG, Rathaus)",
      lines: [
        { label: "EF", text: "8:40–13:15 Uhr" },
        { label: "alle 9. Klassen", text: "9:45–13:15 Uhr" },
        { label: "Q1/Q2", text: "ab 12:20 Uhr (bitte pünktlich losgehen, der Weg zur Jungholzhalle ist lang)" },
        { label: null, text: "Der Nachmittagsunterricht ab der 8. Stunde findet statt." },
      ],
    });
    // Every word is still there.
    const back = [layout.heading, ...layout.lines.map((line) => (line.label ? `${line.label}: ${line.text}` : line.text))].join(" · ");
    expect(back).toBe(notice);
  });

  it("keeps a one-line notice as it is, and times are no labels", () => {
    expect(noticeLayout("Bitte Einsätze in SPR beachten.")).toEqual({
      heading: null,
      lines: [{ label: null, text: "Bitte Einsätze in SPR beachten." }],
    });
    expect(noticeLayout("Revision Fr. Azzam · 09:20-10:05 Mathe, 10B, R. E39")).toEqual({
      heading: "Revision Fr. Azzam",
      lines: [{ label: null, text: "09:20-10:05 Mathe, 10B, R. E39" }],
    });
    // A long text before ": " is a sentence, not a label.
    expect(noticeLayout("Heute gilt für alle Klassen der Stufe 7: Sportzeug mitbringen").lines[0].label).toBeNull();
  });
});
