import * as cheerio from "cheerio";
import type { Element } from "domhandler";
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

function extractLines($: cheerio.CheerioAPI) {
  return $("body")
    .text()
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
}

function extractMetadata($: cheerio.CheerioAPI, pageNumber: number): PageMetadata {
  const lines = extractLines($);
  const combinedText = lines.join("\n");
  const titleLine =
    lines.find((line) => /Woche\s+[A-Z]/i.test(line) && /\d{1,2}\.\d{1,2}\.\d{4}/.test(line)) ??
    "";

  const sourceLine = lines.find((line) => line.includes("Stand:")) ?? "";
  const pageMatch = titleLine.match(/Seite\s+(\d+)\s*\/\s*(\d+)/i);
  const dateMatch = titleLine.match(
    /(\d{1,2}\.\d{1,2}\.\d{4})\s+([A-Za-zÄÖÜäöüß]+),\s+(Woche\s+[A-Z])/i,
  );
  const notices = (() => {
    const noticeIndex = lines.findIndex((line) =>
      /^Nachrichten zum Tag$/i.test(line),
    );

    if (noticeIndex === -1) {
      return [];
    }

    const values: string[] = [];

    for (let index = noticeIndex + 1; index < lines.length; index += 1) {
      const line = lines[index];

      if (!line || line === "---") {
        continue;
      }

      if (/^Klasse/i.test(line) || /^Per\d+/i.test(line)) {
        break;
      }

      values.push(line);
    }

    return values;
  })();

  return {
    pageNumber,
    totalPages: pageMatch ? Number(pageMatch[2]) : null,
    date: dateMatch ? parseGermanDate(dateMatch[1]) : parseGermanDate(combinedText),
    dayLabel: dateMatch ? dateMatch[2] : null,
    weekLabel: dateMatch ? dateMatch[3] : null,
    sourceUpdatedAt: sourceLine ? parseGermanDateTime(sourceLine) : null,
    notices,
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

      cells.forEach((cell, cellIndex) => {
        const alias = tableHeaderAliases[cell];
        if (alias) {
          mapping.set(cellIndex, alias);
        }
      });

      return { headerRowIndex: index, mapping };
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

export function parseSubstitutionPage(html: string, pageNumber: number): ParsedPage {
  const $ = cheerio.load(html);
  const meta = extractMetadata($, pageNumber);
  const parsedEntries: SubstitutionEntry[] = [];

  $("table").each((_, tableElement) => {
    const table = $(tableElement);
    const header = getHeaderMap($, table);

    if (!header || header.mapping.size === 0) {
      return;
    }

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

        row[key] = normalizeCell($(cell).text());
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

  return { meta, entries: uniqueEntries };
}
