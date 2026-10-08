import { normalizeWhitespace, parseSubstitutionPage } from "@/lib/parser";
import type {
  DayNotice,
  FetchedPage,
  SubstitutionEntry,
  SubstitutionPayload,
} from "@/lib/types";

const BASE_URL = "https://monitor2020.meckenheim-kag.com/schueler/subst_";
const REQUEST_TIMEOUT_MS = 6_000;
const RETRY_DELAY_MS = 400;
const MAX_ATTEMPTS = 2;
const PARALLEL_PAGE_LIMIT = 3;
const MAX_FALLBACK_PAGES = 16;

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

function lessonStart(lesson: string) {
  return Number(lesson.match(/\d+/)?.[0] ?? Number.MAX_SAFE_INTEGER);
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
    date: null,
    dates: [],
    dayLabel: null,
    weekLabel: null,
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

export async function fetchSubstitutionData(): Promise<SubstitutionPayload> {
  const warnings: string[] = [];
  const firstPage = await fetchPage(1);

  if (firstPage.kind !== "ok") {
    return toFailurePayload(
      "Die erste Vertretungsplan-Seite konnte nicht geladen werden.",
    );
  }

  const parsedFirstPage = parseSubstitutionPage(firstPage.html, 1);
  let pageCount = parsedFirstPage.meta.totalPages ?? 1;
  const fetchedPages = [parsedFirstPage];

  if (!parsedFirstPage.meta.totalPages) {
    for (let pageNumber = 2; pageNumber <= MAX_FALLBACK_PAGES; pageNumber += 1) {
      const result = await fetchPage(pageNumber);

      if (result.kind === "missing") {
        pageCount = pageNumber - 1;
        break;
      }

      if (result.kind === "error") {
        warnings.push(`Seite ${pageNumber} konnte nicht geprüft werden.`);
        pageCount = pageNumber - 1;
        break;
      }

      fetchedPages.push(parseSubstitutionPage(result.html, pageNumber));
      pageCount = pageNumber;
    }
  } else if (pageCount > 1) {
    const remainingPages = Array.from(
      { length: pageCount - 1 },
      (_, index) => index + 2,
    );
    const results = await mapWithConcurrency(
      remainingPages,
      PARALLEL_PAGE_LIMIT,
      (pageNumber) => fetchPage(pageNumber),
    );

    results.forEach((result) => {
      if (result.kind === "ok") {
        fetchedPages.push(parseSubstitutionPage(result.html, result.pageNumber));
        return;
      }

      warnings.push(
        result.kind === "missing"
          ? `Seite ${result.pageNumber} war beim Abruf leer oder nicht vorhanden.`
          : `Seite ${result.pageNumber} konnte nicht geladen werden.`,
      );
    });
  }

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
  const dates = Array.from(
    new Set(
      fetchedPages
        .map((page) => page.meta.date)
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort();
  const latestSourceUpdatedAt =
    fetchedPages
      .map((page) => page.meta.sourceUpdatedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
  const firstMeta =
    fetchedPages.find((page) => page.meta.date === dates[0])?.meta ??
    fetchedPages[0]?.meta;
  const now = new Date().toISOString();

  return {
    success: true,
    stale: false,
    date: dates[0] ?? null,
    dates,
    dayLabel: firstMeta?.dayLabel ?? null,
    weekLabel: firstMeta?.weekLabel ?? null,
    pageCount,
    fetchedPages: fetchedPages.length,
    lastUpdated: now,
    lastSuccessfulUpdate: now,
    sourceUpdatedAt: latestSourceUpdatedAt,
    classes,
    entries: allEntries,
    notices,
    warnings,
    error:
      warnings.length > 0 && fetchedPages.length < pageCount
        ? "Ein Teil der Seiten konnte nicht geladen werden."
        : null,
  };
}
