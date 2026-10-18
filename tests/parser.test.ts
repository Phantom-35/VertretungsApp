import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSubstitutionPage } from "@/lib/parser";
import { checkParsedPages } from "@/lib/scraper";
import { allFixturePages, loadFixture } from "./helpers";

describe("parseSubstitutionPage", () => {
  it("reads date, weekday, week and the per-day page counter from the title", () => {
    const { meta } = parseSubstitutionPage(loadFixture(1), 1);

    expect(meta).toMatchObject({
      date: "2026-10-08",
      dayLabel: "Donnerstag",
      weekLabel: "Woche A",
      pageOfDay: 1,
      pagesOfDay: 3,
      nextPage: 2,
    });
  });

  it("restarts the page counter for the next day and links back at the end", () => {
    expect(parseSubstitutionPage(loadFixture(4), 4).meta).toMatchObject({
      date: "2026-10-09",
      dayLabel: "Freitag",
      pageOfDay: 1,
      pagesOfDay: 2,
      nextPage: 5,
    });
    expect(parseSubstitutionPage(loadFixture(5), 5).meta.nextPage).toBe(1);
  });

  it("converts the school's local 'Stand' time to UTC, whatever the server's time zone", () => {
    // Stand: 08.10.2026 15:34 (summer time, UTC+2)
    expect(parseSubstitutionPage(loadFixture(1), 1).meta.sourceUpdatedAt).toBe(
      "2026-10-08T13:34:00.000Z",
    );
  });

  it("reads every table row of every saved page", () => {
    Object.entries(allFixturePages()).forEach(([pageNumber, html]) => {
      const { entries, stats } = parseSubstitutionPage(html, Number(pageNumber));
      expect(stats.headerFound).toBe(true);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries).toHaveLength(stats.tableRows);
    });
  });

  it("maps the columns to the right fields", () => {
    const { entries } = parseSubstitutionPage(loadFixture(1), 1);

    expect(entries[0]).toMatchObject({
      className: "05A",
      lesson: "1",
      type: "Statt-Vertretung",
      substitute: "JUB",
      teacher: "ROE",
      room: "004",
      text: "",
      date: "2026-10-08",
      page: 1,
    });
  });

  it("drops Untis placeholders such as '+' and '---'", () => {
    const { entries } = parseSubstitutionPage(loadFixture(2), 2);
    const selfStudy = entries.filter((entry) => entry.type === "EVA");

    expect(selfStudy.length).toBeGreaterThan(0);
    selfStudy.forEach((entry) => expect(entry.substitute).toBe(""));
    entries.forEach((entry) => {
      expect(entry.room).not.toMatch(/^(---|\?\?\?|\+)$/);
    });
  });

  it("keeps '???' as substitute: nobody has been found yet", () => {
    // Row as on the live plan of 09.10.2026.
    const html = loadFixture(1).replace(
      /(<tr class='list odd'>)/,
      `<tr class='list odd'><td class="list" align="center">05B</td><td class="list" align="center">1 - 2</td><td class="list" align="center">Vertretung</td><td class="list" align="center">???</td><td class="list">&nbsp;</td><td class="list" align="center">FCH</td><td class="list" align="center">???</td></tr>$1`,
    );
    const open = parseSubstitutionPage(html, 1).entries.find((entry) => entry.className === "05B");
    expect(open).toMatchObject({ type: "Vertretung", substitute: "???", teacher: "FCH", room: "" });
  });

  it("reads 'Nachrichten zum Tag'", () => {
    expect(parseSubstitutionPage(loadFixture(7), 7).meta.notices).toEqual([
      "Unterrichtsfrei – 7-11 Std.",
    ]);
  });

  it("keeps the lines of a notice and of a cell apart", () => {
    const html = loadFixture(7)
      .replace(
        "<td class='info'>Unterrichtsfrei&nbsp;</td><td class='info'>7-11 Std.</td>",
        "<td class='info' colspan='2'><b>Revision Fr. Azzam</b><br>09:20-10:05 Mathe, 10B, R. E39<br></td>",
      )
      .replace('align="center">133</td>', 'align="center">SWI<br>TU3</td>');
    const { meta, entries } = parseSubstitutionPage(html, 7);
    expect(meta.notices).toEqual(["Revision Fr. Azzam · 09:20-10:05 Mathe, 10B, R. E39"]);
    expect(entries.find((entry) => entry.className === "07D")?.room).toBe("SWI TU3");
  });
});

describe("checkParsedPages (self-check)", () => {
  const check = (html: string) => checkParsedPages([parseSubstitutionPage(html, 1)]);

  it("finds no problems on correct pages", () => {
    const pages = Object.entries(allFixturePages()).map(([pageNumber, html]) =>
      parseSubstitutionPage(html, Number(pageNumber)),
    );
    expect(checkParsedPages(pages)).toEqual({ problems: [], notes: [] });
  });

  it("notices an unknown table header", () => {
    const html = loadFixture(1).replace(">Klasse(n)<", ">Kurs<");
    expect(check(html).problems).toContain("Seite 1: Tabellenformat nicht erkannt.");
  });

  it("notices shifted columns", () => {
    // An extra header cell moves every column by one.
    const html = loadFixture(1).replace("<tr class='list'><th", "<tr class='list'><th>Nr</th><th");
    expect(check(html).problems.some((problem) => problem.includes("ohne gültige Klasse oder Stunde"))).toBe(true);
  });

  it("notices a missing date", () => {
    const html = loadFixture(1).replace("8.10.2026 Donnerstag", "Donnerstag");
    expect(check(html).problems).toContain("Seite 1: Datum nicht erkannt.");
  });

  it("notices rows that were not read", () => {
    // A new column the parser does not know: two rows that only differ in it
    // are merged, so one row of the page is lost.
    const html = loadFixture(1)
      .replace(">Raum</th>", ">Raum</th><th>Bemerkung</th>")
      .replace(/<\/td><\/tr>/g, "</td><td></td></tr>");
    const firstRow = html.match(/<tr class='list odd'>.*?<\/tr>/)![0];
    const withColumn = html.replace(
      firstRow,
      firstRow.replace("<td></td></tr>", "<td>A</td></tr>") +
        firstRow.replace("<td></td></tr>", "<td>B</td></tr>"),
    );
    const page = parseSubstitutionPage(withColumn, 1);
    const result = checkParsedPages([page]);

    expect(page.stats.tableRows).toBe(page.entries.length + 1);
    expect(result.notes).toContain("Seite 1: Unbekannte Spalte „bemerkung“ wird nicht angezeigt.");
    expect(result.problems).toContain(
      `Seite 1: ${page.stats.tableRows} Zeilen auf der Seite, aber ${page.entries.length} gelesen.`,
    );
  });
  it("counts an open substitute (???) like the parser does", () => {
    const html = loadFixture(1);
    const row = html.match(/<tr class='list odd'>.*?<\/tr>/)![0];
    const cells = row.match(/<td[^>]*>.*?<\/td>/g)!;
    // Two rows that only differ in "???" versus "---" as substitute.
    const withSubstitute = (value: string) => row.replace(cells[3], cells[3].replace(/>[^<]*</, `>${value}<`));
    const page = parseSubstitutionPage(html.replace(row, withSubstitute("???") + withSubstitute("---")), 1);
    expect(page.stats.tableRows).toBe(page.entries.length);
  });

  it("only notes an all-day row on a short page", () => {
    const html = loadFixture(1);
    const rows = html.match(/<tr class='list (odd|even)'>.*?<\/tr>/g)!;
    const cells = rows[0].match(/<td[^>]*>.*?<\/td>/g)!;
    const allDay = rows[0].replace(cells[1], cells[1].replace(/>[^<]*</, ">ganztägig<"));
    // Only two rows left on the page, one of them without a lesson number.
    let short = html.replace(rows[0], allDay);
    rows.slice(2).forEach((row) => {
      short = short.replace(row, "");
    });
    const page = parseSubstitutionPage(short, 1);
    expect(page.entries).toHaveLength(2);
    expect(checkParsedPages([page]).problems).toEqual([]);
  });

  it("only notes a few rows without a lesson, e.g. an all-day event", () => {
    const html = loadFixture(1);
    const row = html.match(/<tr class='list odd'>.*?<\/tr>/)![0];
    const cells = row.match(/<td[^>]*>.*?<\/td>/g)!;
    const page = parseSubstitutionPage(html.replace(row, row.replace(cells[1], cells[1].replace(/>[^<]*</, ">ganztägig<"))), 1);
    const result = checkParsedPages([page]);
    expect(result.problems).toEqual([]);
    expect(result.notes).toContain("Seite 1: 1 Einträge ohne gültige Klasse oder Stunde.");
  });
});

describe("the school's second website (other Untis export)", () => {
  const html = readFileSync(join(__dirname, "fixtures", "vertretung-2026-10-16", "subst_003.htm"), "latin1");

  it("reads its columns: class, lesson, subject, type, substitute, room, text", () => {
    const page = parseSubstitutionPage(html, 3);
    expect(page.meta).toMatchObject({ date: "2026-11-02", dayLabel: "Montag" });
    expect(page.entries).toHaveLength(15);
    expect(page.entries.find((item) => item.className === "09A")).toMatchObject({
      lesson: "3 - 4",
      subject: "E",
      type: "Vertretung",
      substitute: "???",
      room: "204",
      teacher: "",
    });
    // Break supervision is for teachers: not an entry, and no warning either.
    expect(page.entries.some((item) => /pausenaufsicht/i.test(item.type))).toBe(false);
    expect(checkParsedPages([page])).toEqual({ problems: [], notes: [] });
  });
});
