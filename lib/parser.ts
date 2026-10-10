import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { OPEN_SUBSTITUTE } from "@/lib/entries";
import { schoolLocalToIso } from "@/lib/time";
import type { PageMetadata, ParsedPage, SubstitutionEntry } from "@/lib/types";

const tableHeaderAliases: Record<string, keyof ParsedRow> = {
  "klasse(n)": "className",
  klasse: "className",
  stunde: "lesson",
  std: "lesson",
  art: "type",
  vertreter: "substitute",
  vertretung: "substitute",
  fach: "subject",
  text: "text",
  hinweis: "text",
  "(lehrer)": "teacher",
  lehrer: "teacher",
  raum: "room",
};

type ParsedRow = {
  className: string;
  lesson: string;
  type: string;
  substitute: string;
  teacher: string;
  room: string;
  subject: string;
  text: string;
};

// Untis fills cells without a real value with these markers (e.g. EVA rows).
const placeholderValues = new Set(["+", "-", "---", "???"]);

export function normalizeWhitespace(value: string) {
  // `\s` also covers non-breaking spaces (&nbsp;).
  return value.replace(/\s+/g, " ").trim();
}

function normalizeHeader(value: string) {
  return normalizeWhitespace(value).toLowerCase();
}

function normalizeCell(value: string) {
  const normalized = normalizeWhitespace(value);
  return placeholderValues.has(normalized) ? "" : normalized;
}

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function parseGermanDateTime(value: string) {
  const match = value.match(
    /(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})/,
  );

  if (!match) {
    return null;
  }

  const [, dayText, monthText, yearText, hourText, minuteText] = match;
  return schoolLocalToIso(
    Number(yearText),
    Number(monthText),
    Number(dayText),
    Number(hourText),
    Number(minuteText),
  );
}

function parseGermanDate(value: string) {
  const match = value.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);

  if (!match) {
    return null;
  }

  const [, dayText, monthText, yearText] = match;
  return `${yearText}-${pad(Number(monthText))}-${pad(Number(dayText))}`;
}

function extractTitle($: cheerio.CheerioAPI) {
  const title = normalizeWhitespace($(".mon_title").first().text());
  if (title) {
    return title;
  }

  // Fallback for layouts without the CSS class: the line with date and page.
  return (
    $("body")
      .text()
      .split(/\r?\n/)
      .map((line) => normalizeWhitespace(line))
      .find((line) => /\d{1,2}\.\d{1,2}\.\d{4}/.test(line) && /Seite\s+\d+/i.test(line)) ??
    ""
  );
}

/** `<meta http-equiv="refresh" content="10; URL=subst_002.htm">` -> 2 */
function extractNextPage($: cheerio.CheerioAPI) {
  const content =
    $("meta")
      .filter((_, element) => $(element).attr("http-equiv")?.toLowerCase() === "refresh")
      .attr("content") ?? "";
  const match = content.match(/subst_(\d+)\.htm/i);
  return match ? Number(match[1]) : null;
}

/** Rows of the "Nachrichten zum Tag" table. */
function extractNotices($: cheerio.CheerioAPI) {
  return $("table.info tr")
    .toArray()
    .map((row) =>
      $(row)
        .find("td")
        .toArray()
        .map((cell) => normalizeWhitespace($(cell).text()))
        .filter(Boolean)
        .join(" – "),
    )
    .filter(Boolean);
}

function extractMetadata($: cheerio.CheerioAPI, pageNumber: number): PageMetadata {
  // e.g. "8.10.2026 Donnerstag, Woche A (Seite 1 / 3)". The page counter
  // restarts for every day.
  const title = extractTitle($);
  const dateMatch = title.match(/(\d{1,2}\.\d{1,2}\.\d{4})(?:\s+([A-Za-zÄÖÜäöüß]+))?/);
  const weekMatch = title.match(/Woche\s+[A-Z]\b/i);
  const pageMatch = title.match(/Seite\s+(\d+)\s*\/\s*(\d+)/i);
  const sourceMatch = $("body")
    .text()
    .match(/Stand:\s*(\d{1,2}\.\d{1,2}\.\d{4}\s+\d{1,2}:\d{2})/);

  return {
    pageNumber,
    pageOfDay: pageMatch ? Number(pageMatch[1]) : null,
    pagesOfDay: pageMatch ? Number(pageMatch[2]) : null,
    nextPage: extractNextPage($),
    date: dateMatch ? parseGermanDate(dateMatch[1]) : null,
    dayLabel: dateMatch?.[2] ?? null,
    weekLabel: weekMatch ? weekMatch[0] : null,
    sourceUpdatedAt: sourceMatch ? parseGermanDateTime(sourceMatch[1]) : null,
    notices: extractNotices($),
  };
}

function getHeaderMap($: cheerio.CheerioAPI, table: cheerio.Cheerio<Element>) {
  const rows = table.find("tr").toArray();

  for (let index = 0; index < rows.length; index += 1) {
    // Keep empty cells so that column indices stay aligned with the data rows.
    const cells = $(rows[index])
      .find("th, td")
      .toArray()
      .map((cell) => normalizeHeader($(cell).text()));

    if (
      cells.filter(Boolean).length >= 4 &&
      cells.some((cell) => cell.includes("klasse")) &&
      cells.some((cell) => cell.includes("stunde"))
    ) {
      const mapping = new Map<number, keyof ParsedRow>();
      const unknownColumns: string[] = [];

      cells.forEach((cell, cellIndex) => {
        const alias = tableHeaderAliases[cell];
        if (alias) {
          mapping.set(cellIndex, alias);
        } else if (cell) {
          unknownColumns.push(cell);
        }
      });

      return { headerRowIndex: index, mapping, unknownColumns };
    }
  }

  return null;
}

function buildEntryId(entry: Omit<SubstitutionEntry, "id">) {
  return [
    entry.page,
    entry.className,
    entry.lesson,
    entry.type,
    entry.substitute,
    entry.teacher,
    entry.room,
    entry.subject,
    entry.text,
  ].join("|");
}

/**
 * Counts the data rows of the substitution tables without relying on the
 * header detection, so that the parse result can be cross-checked.
 */
function countDataRows($: cheerio.CheerioAPI) {
  const rows = new Set<string>();

  $("table")
    .not(".info, .mon_head")
    .find("tr")
    .each((_, rowElement) => {
      const cells = $(rowElement)
        .find("td")
        .toArray()
        // "???" stays, as in the parsed entries (see OPEN_SUBSTITUTE).
        .map((cell) => {
          const text = normalizeWhitespace($(cell).text());
          return text === "???" ? text : normalizeCell(text);
        });
      const isHeader =
        normalizeHeader(cells[0] ?? "").startsWith("klasse") &&
        normalizeHeader(cells[1] ?? "") === "stunde";

      if (cells.length >= 4 && !isHeader && cells.some(Boolean)) {
        rows.add(cells.join("|"));
      }
    });

  return rows.size;
}

export function parseSubstitutionPage(html: string, pageNumber: number): ParsedPage {
  const $ = cheerio.load(html);
  const meta = extractMetadata($, pageNumber);
  const parsedEntries: SubstitutionEntry[] = [];
  let headerFound = false;
  const unknownColumns = new Set<string>();

  $("table").each((_, tableElement) => {
    const table = $(tableElement);
    const header = getHeaderMap($, table);

    if (!header || header.mapping.size === 0) {
      return;
    }

    headerFound = true;
    header.unknownColumns.forEach((column) => unknownColumns.add(column));

    const rows = table.find("tr").toArray().slice(header.headerRowIndex + 1);

    rows.forEach((rowElement) => {
      const cells = $(rowElement).find("td, th").toArray();
      if (cells.length === 0) {
        return;
      }

      const row: ParsedRow = {
        className: "",
        lesson: "",
        type: "",
        substitute: "",
        teacher: "",
        room: "",
        subject: "",
        text: "",
      };

      cells.forEach((cell, index) => {
        const key = header.mapping.get(index);
        if (!key) {
          return;
        }

        const value = normalizeWhitespace($(cell).text());
        // "???" as substitute: nobody found yet, which students should see.
        row[key] = key === "substitute" && value === OPEN_SUBSTITUTE ? value : normalizeCell(value);
      });

      // Long tables can repeat the header row.
      if (
        normalizeHeader(row.className).startsWith("klasse") &&
        normalizeHeader(row.lesson) === "stunde"
      ) {
        return;
      }

      if (
        !row.lesson &&
        !row.className &&
        !row.type &&
        !row.substitute &&
        !row.teacher &&
        !row.room &&
        !row.subject &&
        !row.text
      ) {
        return;
      }

      const entryBase = {
        className: row.className,
        lesson: row.lesson,
        type: row.type,
        substitute: row.substitute,
        teacher: row.teacher,
        room: row.room,
        subject: row.subject,
        text: row.text,
        date: meta.date ?? "",
        page: pageNumber,
      };

      parsedEntries.push({
        ...entryBase,
        id: buildEntryId(entryBase),
      });
    });
  });

  const uniqueEntries = Array.from(
    new Map(parsedEntries.map((entry) => [entry.id, entry])).values(),
  );

  return {
    meta,
    entries: uniqueEntries,
    stats: {
      headerFound,
      tableRows: countDataRows($),
      unknownColumns: Array.from(unknownColumns),
    },
  };
}
