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

  it("keeps rows without a class when they name a lesson and a teacher", async () => {
    // As on the live plan of 03.11.2026: two cancelled lessons of JUN, no class.
    const row = (lesson: string, teacher: string, text = "&nbsp;") =>
      `<tr class='list odd'><td class="list" align="center">&nbsp;</td><td class="list" align="center">${lesson}</td><td class="list" align="center">Entfall</td><td class="list" align="center">---</td><td class="list">${text}</td><td class="list" align="center">${teacher}</td><td class="list" align="center">---</td></tr>`;
    const pages = allFixturePages();
    pages[1] = pages[1].replace(/(<tr class='list odd'>)/, `${row("3", "JUN")}${row("4", "JUN")}${row("", "&nbsp;", "Hinweis")}$1`);
    mockSchoolServer(pages);
    const data = await fetchSubstitutionData();
    const classless = data.entries.filter((entry) => !entry.className);
    expect(classless.map((entry) => [entry.lesson, entry.teacher])).toEqual([
      ["3", "JUN"],
      ["4", "JUN"],
    ]);
    // Not a class to choose.
    expect(data.classes).not.toContain("");
    // The self-check counts only the row without a lesson and a teacher, not the two.
    expect(data.diagnostics).toEqual(["Seite 1: 1 Einträge ohne gültige Klasse oder Stunde."]);
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

describe("an upload in progress", () => {
  it("is incomplete while a page announced for a day still belongs to another one", async () => {
    // Monday has two pages now, but page 2 is still the old Tuesday file.
    const plan = buildPlan([
      { date: "12.10.2026", weekday: "Montag", pages: 2 },
      { date: "13.10.2026", weekday: "Dienstag", pages: 1 },
    ]);
    plan[2] = retitle(loadFixture(2), "13.10.2026 Dienstag, Woche B (Seite 1 / 1)", 1);
    mockSchoolServer(plan);
    const data = await fetchSubstitutionData();
    expect(data.error).toBe("Ein Teil der Seiten konnte nicht geladen werden.");
    expect(data.warnings).toContain("Seite 2 gehört zu einem anderen Tag (Upload läuft?).");
  });
});

describe("the school's second website as a stand-in", () => {
  /** monitor2020 answers with `primary`, the second copy with the saved plan. */
  function twoSites(primary: "missing" | "down" | "ok") {
    const requested: string[] = [];
    const pages = allFixturePages();
    vi.stubGlobal("fetch", async (url: string) => {
      const address = String(url);
      const host = new URL(address).host;
      requested.push(`${host} ${address.match(/subst_\d+/)?.[0]}`);
      if (host === "monitor2020.meckenheim-kag.com" && primary !== "ok") {
        if (primary === "down") throw new TypeError("fetch failed");
        return new Response("Not Found", { status: 404 });
      }
      const page = pages[Number(address.match(/subst_(\d+)\.htm/)?.[1])];
      if (page === undefined || page === "down") return new Response("Not Found", { status: 404 });
      const bytes = Uint8Array.from(page, (char) => (char.charCodeAt(0) < 256 ? char.charCodeAt(0) : 63));
      return new Response(bytes, { headers: { "content-type": "text/html; charset=iso-8859-1" } });
    });
    return requested;
  }

  it("always takes monitor2020 when it answers, without asking the other one", async () => {
    const requested = twoSites("ok");
    const data = await fetchSubstitutionData();
    expect(data.success).toBe(true);
    expect(data.sourceUrl).toBe("https://monitor2020.meckenheim-kag.com/schueler/subst_001.htm");
    expect(requested.every((item) => item.startsWith("monitor2020."))).toBe(true);
  });

  it("takes the second website when monitor2020 has no plan or does not answer", async () => {
    for (const failure of ["missing", "down"] as const) {
      const requested = twoSites(failure);
      const data = await fetchSubstitutionData();
      expect(data.success).toBe(true);
      expect(data.sourceUrl).toBe("https://vertretung.meckenheim-kag.com/subst_001.htm");
      expect(data.days.map((day) => day.date)).toEqual(["2026-10-08", "2026-10-09"]);
      // monitor2020 first, every time.
      expect(requested[0]).toBe("monitor2020.meckenheim-kag.com subst_001");
    }
  });
});

describe("the message about the source", () => {
  it("never holds up the plan, also when Redis hangs", async () => {
    vi.resetModules();
    vi.doMock("@/lib/source-switch", () => ({ reportPlanSource: () => new Promise(() => undefined) }));
    try {
      mockSchoolServer(allFixturePages());
      const { fetchSubstitutionData: fetchWithHangingRedis } = await import("@/lib/scraper");
      const started = Date.now();
      const data = await fetchWithHangingRedis();
      expect(data.success).toBe(true);
      expect(Date.now() - started).toBeLessThan(4_000);
    } finally {
      vi.doUnmock("@/lib/source-switch");
      vi.resetModules();
    }
  });
});
