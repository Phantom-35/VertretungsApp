import { reportPlanProblems } from "@/lib/alert";
import { lessonStart } from "@/lib/entries";
import { normalizeWhitespace, parseSubstitutionPage } from "@/lib/parser";
import type {
  DayNotice,
  ParsedPage,
  PlanDay,
  FetchedPage,
  SubstitutionEntry,
  SubstitutionPayload,
} from "@/lib/types";

const BASE_URL =
  process.env.SUBSTITUTION_BASE_URL ??
  "https://monitor2020.meckenheim-kag.com/schueler/subst_";
const REQUEST_TIMEOUT_MS = 6_000;
const RETRY_DELAY_MS = 400;
const MAX_ATTEMPTS = 2;
const PARALLEL_PAGE_LIMIT = 3;
const MAX_PAGES = 30;
/**
 * The server keeps old subst_XXX.htm files from earlier uploads around. Pages
 * whose "Stand" is much older than page 1 are such leftovers.
 */
const LEFTOVER_PAGE_AGE_MS = 12 * 60 * 60_000;

function buildPageUrl(pageNumber: number) {
  return `${BASE_URL}${pageNumber.toString().padStart(3, "0")}.htm`;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveCharset(contentType: string | null) {
  const match = contentType?.match(/charset=([^;]+)/i);
  const charset = match?.[1]?.trim().toLowerCase();

  if (!charset || charset === "iso-8859-1" || charset === "latin1") {
    return "windows-1252";
  }

  return charset;
}

function decodeHtml(buffer: ArrayBuffer, contentType: string | null) {
  try {
    return new TextDecoder(resolveCharset(contentType)).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

function pageLooksValid(html: string) {
  const content = normalizeWhitespace(html);
  return (
    /Untis/i.test(content) &&
    (/Klasse\(n\)/i.test(content) || /Seite\s+\d+\s*\/\s*\d+/i.test(content))
  );
}

async function fetchPage(pageNumber: number, attempt = 1): Promise<FetchedPage> {
  const url = buildPageUrl(pageNumber);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "de-DE,de;q=0.9",
        "user-agent": "KAG-Vertretungsplan/1.0",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status === 404) {
      return { kind: "missing", pageNumber, url, reason: "HTTP 404" };
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = decodeHtml(
      await response.arrayBuffer(),
      response.headers.get("content-type"),
    );

    if (!pageLooksValid(html)) {
      return {
        kind: "missing",
        pageNumber,
        url,
        reason: "Seite enthält keinen gültigen Vertretungsplan",
      };
    }

    return { kind: "ok", pageNumber, url, html };
  } catch (error) {
    // Network errors, timeouts and 5xx responses are retried once.
    if (attempt < MAX_ATTEMPTS) {
      await wait(RETRY_DELAY_MS);
      return fetchPage(pageNumber, attempt + 1);
    }

    return {
      kind: "error",
      pageNumber,
      url,
      reason: error instanceof Error ? error.message : "Unbekannter Fehler",
    };
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
) {
  const results: R[] = new Array(values.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < values.length) {
      const index = currentIndex;
      currentIndex += 1;
      results[index] = await mapper(values[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );

  return results;
}

function sortEntries(entries: SubstitutionEntry[]) {
  return [...entries].sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date);
    }

    if (left.className !== right.className) {
      return left.className.localeCompare(right.className, "de-DE", {
        numeric: true,
      });
    }

    const leftLesson = lessonStart(left.lesson);
    const rightLesson = lessonStart(right.lesson);

    if (leftLesson !== rightLesson) {
      return leftLesson - rightLesson;
    }

    return left.id.localeCompare(right.id);
  });
}

function toFailurePayload(error: string): SubstitutionPayload {
  return {
    success: false,
    stale: false,
    days: [],
    diagnostics: [],
    sourceUrl: buildPageUrl(1),
    pageCount: 0,
    fetchedPages: 0,
    lastUpdated: null,
    lastSuccessfulUpdate: null,
    sourceUpdatedAt: null,
    classes: [],
    entries: [],
    notices: [],
    warnings: [],
    error,
  };
}

function range(from: number, to: number) {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => from + index);
}

function isLeftoverPage(page: ParsedPage, referenceStand: string | null) {
  const stand = page.meta.sourceUpdatedAt;
  return Boolean(
    referenceStand &&
      stand &&
      Date.parse(referenceStand) - Date.parse(stand) > LEFTOVER_PAGE_AGE_MS,
  );
}

/** Pages without a readable date belong to the day of the page before. */
function withInheritedDate(page: ParsedPage, previous: ParsedPage): ParsedPage {
  if (page.meta.date || !previous.meta.date) {
    return page;
  }

  const date = previous.meta.date;
  return {
    ...page,
    meta: { ...page.meta, date, dayLabel: previous.meta.dayLabel, weekLabel: previous.meta.weekLabel },
    entries: page.entries.map((entry) => ({ ...entry, date })),
  };
}

/**
 * Follows the Untis monitor chain starting at page 1:
 * - "Seite x / y" tells how many more pages the current day has; those are
 *   fetched in parallel.
 * - After the last page of a day, the meta refresh link points to the first
 *   page of the next day, or back to page 1 at the end of the plan.
 * Simply counting up until a 404 is wrong, because outdated pages from
 * earlier uploads stay on the server.
 */
async function collectPages(firstPage: ParsedPage, warnings: string[]) {
  const pages = [firstPage];
  const referenceStand = firstPage.meta.sourceUpdatedAt;
  let failedPages = 0;
  let highestPage = 1;
  let current: ParsedPage["meta"] | null = firstPage.meta;

  while (current && highestPage < MAX_PAGES) {
    const remainingOfDay =
      current.pageOfDay !== null && current.pagesOfDay !== null
        ? current.pagesOfDay - current.pageOfDay
        : 0;
    const isProbe = remainingOfDay === 0 && current.nextPage === null;
    let candidates: number[];

    if (remainingOfDay > 0) {
      candidates = range(current.pageNumber + 1, current.pageNumber + remainingOfDay);
    } else if (current.nextPage !== null) {
      // Pointing back (usually to page 1) marks the end of the plan.
      candidates = current.nextPage > current.pageNumber ? [current.nextPage] : [];
    } else if (current.pageOfDay === null) {
      // No hints at all: probe the next page.
      candidates = [current.pageNumber + 1];
    } else {
      candidates = [];
    }

    candidates = candidates.filter((pageNumber) => pageNumber <= MAX_PAGES);
    if (candidates.length === 0) {
      break;
    }

    const results = await mapWithConcurrency(candidates, PARALLEL_PAGE_LIMIT, (pageNumber) =>
      fetchPage(pageNumber),
    );
    current = null;

    for (const result of results) {
      highestPage = Math.max(highestPage, result.pageNumber);

      if (result.kind === "ok") {
        const parsed = withInheritedDate(
          parseSubstitutionPage(result.html, result.pageNumber),
          pages[pages.length - 1],
        );

        if (isLeftoverPage(parsed, referenceStand)) {
          if (!isProbe) {
            warnings.push(`Seite ${result.pageNumber} ist veraltet und wurde ignoriert.`);
          }
          current = null;
          break;
        }

        pages.push(parsed);
        current = parsed.meta;
        continue;
      }

      if (isProbe && result.kind === "missing") {
        break;
      }

      failedPages += 1;
      warnings.push(
        result.kind === "missing"
          ? `Seite ${result.pageNumber} war beim Abruf leer oder nicht vorhanden.`
          : `Seite ${result.pageNumber} konnte nicht geladen werden.`,
      );
      // Without this page's refresh link, try the page after it.
      current = {
        pageNumber: result.pageNumber,
        pageOfDay: null,
        pagesOfDay: null,
        nextPage: null,
        date: null,
        dayLabel: null,
        weekLabel: null,
        sourceUpdatedAt: null,
        notices: [],
      };
    }
  }

  return { pages, failedPages, pageCount: highestPage };
}

/**
 * Self-check: compares the parse result with an independent row count and
 * looks for missing basics. Problems mean the plan may be shown incompletely,
 * typically because the school's Untis export changed its format.
 */
export function checkParsedPages(pages: ParsedPage[]) {
  const problems: string[] = [];
  const notes: string[] = [];

  pages.forEach(({ meta, entries, stats }) => {
    const label = `Seite ${meta.pageNumber}`;

    if (!meta.date) {
      problems.push(`${label}: Datum nicht erkannt.`);
    }

    if (!stats.headerFound) {
      if (stats.tableRows > 0) {
        problems.push(`${label}: Tabellenformat nicht erkannt.`);
      }
    } else if (entries.length !== stats.tableRows) {
      problems.push(
        `${label}: ${stats.tableRows} Zeilen auf der Seite, aber ${entries.length} gelesen.`,
      );
    }

    // A lesson without a number means the columns were mapped wrongly.
    const implausible = entries.filter(
      (entry) => !entry.className || !/\d/.test(entry.lesson),
    ).length;
    if (implausible > 0) {
      problems.push(`${label}: ${implausible} Einträge ohne gültige Klasse oder Stunde.`);
    }

    stats.unknownColumns.forEach((column) => {
      notes.push(`${label}: Unbekannte Spalte „${column}“ wird nicht angezeigt.`);
    });
  });

  return { problems, notes: Array.from(new Set(notes)) };
}

export async function fetchSubstitutionData(): Promise<SubstitutionPayload> {
  const warnings: string[] = [];
  const firstPage = await fetchPage(1);

  if (firstPage.kind !== "ok") {
    return toFailurePayload(
      "Die erste Vertretungsplan-Seite konnte nicht geladen werden.",
    );
  }

  const { pages: fetchedPages, failedPages, pageCount } = await collectPages(
    parseSubstitutionPage(firstPage.html, 1),
    warnings,
  );

  const { problems, notes } = checkParsedPages(fetchedPages);
  const diagnostics = [...problems, ...notes];
  if (diagnostics.length > 0) {
    console.warn("[substitution] Selbstkontrolle:", diagnostics.join(" "));
  }
  await reportPlanProblems(diagnostics);

  const allEntries = sortEntries(
    fetchedPages.flatMap((page) => page.entries).filter((entry) => entry.className),
  );
  const classes = Array.from(
    new Set(allEntries.map((entry) => entry.className).filter(Boolean)),
  ).sort((left, right) =>
    left.localeCompare(right, "de-DE", { numeric: true }),
  );
  const noticeMap = new Map<string, DayNotice>();
  fetchedPages.forEach(({ meta }) => {
    meta.notices.forEach((text) => {
      noticeMap.set(`${meta.date}|${text}`, { date: meta.date, text });
    });
  });
  const notices = Array.from(noticeMap.values());
  const dayMap = new Map<string, PlanDay>();
  fetchedPages.forEach(({ meta }) => {
    if (meta.date && !dayMap.has(meta.date)) {
      dayMap.set(meta.date, {
        date: meta.date,
        dayLabel: meta.dayLabel,
        weekLabel: meta.weekLabel,
      });
    }
  });
  const days = Array.from(dayMap.values()).sort((left, right) =>
    left.date.localeCompare(right.date),
  );
  const latestSourceUpdatedAt =
    fetchedPages
      .map((page) => page.meta.sourceUpdatedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
  const now = new Date().toISOString();

  return {
    success: true,
    stale: false,
    days,
    diagnostics,
    sourceUrl: buildPageUrl(1),
    pageCount,
    fetchedPages: fetchedPages.length,
    lastUpdated: now,
    lastSuccessfulUpdate: now,
    sourceUpdatedAt: latestSourceUpdatedAt,
    classes,
    entries: allEntries,
    notices,
    warnings: [...warnings, ...problems],
    error:
      problems.length > 0
        ? "Der Plan konnte nicht vollständig gelesen werden."
        : failedPages > 0
          ? "Ein Teil der Seiten konnte nicht geladen werden."
          : null,
  };
}
