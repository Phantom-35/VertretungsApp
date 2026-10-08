import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";

/**
 * Real Untis pages saved on 08.10.2026. They never change, so tests built on
 * them give the same result on every day. Content:
 * - 001–003: Donnerstag 08.10. (Seite 1–3 / 3)
 * - 004–005: Freitag 09.10. (Seite 1–2 / 2), 005 links back to 001
 * - 006–008: outdated leftovers from earlier uploads (Stand 07.10. / 03.09.),
 *   007 contains "Nachrichten zum Tag"
 */
const FIXTURE_DIR = join(__dirname, "fixtures", "untis-2026-10-08");

export function loadFixture(pageNumber: number) {
  const bytes = readFileSync(
    join(FIXTURE_DIR, `subst_${pageNumber.toString().padStart(3, "0")}.htm`),
  );
  return new TextDecoder("windows-1252").decode(bytes);
}

export function allFixturePages() {
  return Object.fromEntries(
    readdirSync(FIXTURE_DIR).map((file) => {
      const pageNumber = Number(file.slice(6, 9));
      return [pageNumber, loadFixture(pageNumber)];
    }),
  ) as Record<number, string>;
}

/** Replaces the page title and the link to the next page. */
export function retitle(html: string, title: string, nextPage: number | null) {
  const withTitle = html.replace(/(<div class="mon_title">)[^<]*/, `$1${title}`);
  const withoutLink = withTitle.replace(/<meta http-equiv="refresh"[^>]*>/i, "");
  return nextPage === null
    ? withoutLink
    : withTitle.replace(/URL=subst_\d+\.htm/i, `URL=subst_${nextPage.toString().padStart(3, "0")}.htm`);
}

export function setStand(html: string, stand: string) {
  return html.replace(/Stand: [\d.]+ [\d:]+/, `Stand: ${stand}`);
}

type DaySpec = { date: string; weekday: string; pages: number };

/**
 * Builds a plan with any split of days and pages from the real fixture pages,
 * linked like the Untis monitor (last page links back to page 1).
 */
export function buildPlan(days: DaySpec[]) {
  const titles = days.flatMap(({ date, weekday, pages }) =>
    Array.from({ length: pages }, (_, index) => ({
      date,
      title: `${date} ${weekday}, Woche B (Seite ${index + 1} / ${pages})`,
    })),
  );

  return Object.fromEntries(
    titles.map(({ title }, index) => {
      const pageNumber = index + 1;
      const nextPage = pageNumber < titles.length ? pageNumber + 1 : 1;
      return [pageNumber, retitle(loadFixture((index % 5) + 1), title, nextPage)];
    }),
  ) as Record<number, string>;
}

/** An outdated page as the school server keeps them after the plan's end. */
export function leftoverPage() {
  return setStand(
    retitle(loadFixture(1), "1.9.2026 Dienstag, Woche A (Seite 1 / 1)", 1),
    "01.09.2026 07:00",
  );
}

/**
 * Serves the given pages instead of the school website. Missing pages answer
 * 404, `"down"` simulates a network error. Returns the requested page numbers.
 */
export function mockSchoolServer(pages: Record<number, string | "down">) {
  const requested: number[] = [];

  vi.stubGlobal("fetch", async (url: string) => {
    const pageNumber = Number(String(url).match(/subst_(\d+)\.htm/)?.[1]);
    requested.push(pageNumber);
    const page = pages[pageNumber];

    if (page === "down") {
      throw new TypeError("fetch failed");
    }
    if (page === undefined) {
      return new Response("Not Found", { status: 404 });
    }

    const bytes = Uint8Array.from(page, (char) => {
      const code = char.charCodeAt(0);
      return code < 256 ? code : 63;
    });
    return new Response(bytes, {
      headers: { "content-type": "text/html; charset=iso-8859-1" },
    });
  });

  return requested;
}
