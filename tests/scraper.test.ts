import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSubstitutionData } from "@/lib/scraper";
import {
  allFixturePages,
  buildPlan,
  leftoverPage,
  loadFixture,
  mockSchoolServer,
  retitle,
} from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

function entriesPerDay(entries: { date: string }[]) {
  return entries.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.date] = (counts[entry.date] ?? 0) + 1;
    return counts;
  }, {});
}

describe("fetchSubstitutionData", () => {
  it("loads all days of the saved real plan and ignores the leftover pages", async () => {
    const requested = mockSchoolServer(allFixturePages());
    const data = await fetchSubstitutionData();

    expect(data.days).toEqual([
      { date: "2026-10-08", dayLabel: "Donnerstag", weekLabel: "Woche A" },
      { date: "2026-10-09", dayLabel: "Freitag", weekLabel: "Woche A" },
    ]);
    expect(data.fetchedPages).toBe(5);
    expect(requested.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(entriesPerDay(data.entries)).toEqual({ "2026-10-08": 49, "2026-10-09": 38 });
    expect(data.error).toBeNull();
    expect(data.diagnostics).toEqual([]);
  });

  // The split of days and pages changes every day; none of it is hard-coded.
  it.each([
    {
      name: "one day, one page",
      days: [{ date: "8.10.2026", weekday: "Donnerstag", pages: 1 }],
    },
    {
      name: "Friday, then Monday and Tuesday across the weekend",
      days: [
        { date: "9.10.2026", weekday: "Freitag", pages: 1 },
        { date: "12.10.2026", weekday: "Montag", pages: 2 },
        { date: "13.10.2026", weekday: "Dienstag", pages: 1 },
      ],
    },
    {
      name: "a long first day and a short second day",
      days: [
        { date: "8.10.2026", weekday: "Donnerstag", pages: 4 },
        { date: "9.10.2026", weekday: "Freitag", pages: 1 },
      ],
    },
  ])("follows the page chain: $name", async ({ days }) => {
    const plan = buildPlan(days);
    const pageCount = Object.keys(plan).length;
    const requested = mockSchoolServer({ ...plan, [pageCount + 1]: leftoverPage() });
    const data = await fetchSubstitutionData();

    expect(data.days.map((day) => day.dayLabel)).toEqual(days.map((day) => day.weekday));
    expect(data.fetchedPages).toBe(pageCount);
    expect(requested).not.toContain(pageCount + 1);
    expect(data.error).toBeNull();
  });

  it("keeps loading after a missing page and reports it", async () => {
    const pages = allFixturePages();
    delete pages[2];
    mockSchoolServer(pages);
    const data = await fetchSubstitutionData();

    expect(data.days).toHaveLength(2);
    expect(data.fetchedPages).toBe(4);
    expect(data.error).toBe("Ein Teil der Seiten konnte nicht geladen werden.");
    expect(data.warnings).toContain("Seite 2 war beim Abruf leer oder nicht vorhanden.");
  });

  it("still finds the next day when the last page of a day is missing", async () => {
    const pages = allFixturePages();
    delete pages[3];
    mockSchoolServer(pages);
    const data = await fetchSubstitutionData();

    expect(data.days.map((day) => day.date)).toEqual(["2026-10-08", "2026-10-09"]);
    expect(data.fetchedPages).toBe(4);
  });

  it("stops at the end of the plan when the last page has no link", async () => {
    const pages = allFixturePages();
    pages[5] = retitle(pages[5], "9.10.2026 Freitag, Woche A (Seite 2 / 2)", null);
    const requested = mockSchoolServer(pages);
    const data = await fetchSubstitutionData();

    expect(data.fetchedPages).toBe(5);
    expect(requested).not.toContain(6);
  });

  it("rejects leftover pages by their 'Stand' when the pages give no hints", async () => {
    const pages = allFixturePages();
    // No "Seite x / y" and no links: the scraper has to probe page by page.
    const stripped = Object.fromEntries(
      Object.entries(pages).map(([pageNumber, html]) => [
        pageNumber,
        html.replace(/\s*\(Seite \d+ \/ \d+\)/, "").replace(/<meta http-equiv="refresh"[^>]*>/i, ""),
      ]),
    );
    mockSchoolServer(stripped);
    const data = await fetchSubstitutionData();

    expect(data.fetchedPages).toBe(5);
    expect(data.days).toHaveLength(2);
  });

  it("assigns notices to their day", async () => {
    const pages = allFixturePages();
    const notices = loadFixture(7).match(/<table class="info" >[\s\S]*?<\/table>/)![0];
    pages[4] = pages[4].replace('<table class="mon_list" >', `${notices}<table class="mon_list" >`);
    mockSchoolServer(pages);
    const data = await fetchSubstitutionData();

    expect(data.notices).toEqual([{ date: "2026-10-09", text: "Unterrichtsfrei – 7-11 Std." }]);
  });

  it("reports a plan it could not read completely", async () => {
    const pages = allFixturePages();
    pages[4] = pages[4].replace(">Klasse(n)<", ">Kurs<");
    mockSchoolServer(pages);
    const data = await fetchSubstitutionData();

    expect(data.success).toBe(true);
    expect(data.error).toBe("Der Plan konnte nicht vollständig gelesen werden.");
    expect(data.diagnostics).toContain("Seite 4: Tabellenformat nicht erkannt.");
  });

  it("fails cleanly when the school website is down", async () => {
    mockSchoolServer({ 1: "down" });
    const data = await fetchSubstitutionData();

    expect(data.success).toBe(false);
    expect(data.entries).toEqual([]);
  });
});
