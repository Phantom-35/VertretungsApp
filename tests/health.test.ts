import { afterEach, describe, expect, it, vi } from "vitest";
import type { SubstitutionPayload } from "@/lib/types";

const payload = (overrides: Partial<SubstitutionPayload>): SubstitutionPayload => ({
  success: true,
  stale: false,
  days: [],
  pageCount: 5,
  fetchedPages: 5,
  lastUpdated: "2026-10-08T06:00:00.000Z",
  lastSuccessfulUpdate: "2026-10-08T06:00:00.000Z",
  sourceUpdatedAt: "2026-10-08T05:44:00.000Z",
  classes: [],
  entries: [],
  notices: [],
  warnings: [],
  diagnostics: [],
  sourceUrl: "https://example.com/subst_001.htm",
  error: null,
  ...overrides,
});

async function health(data: SubstitutionPayload, lastCheck?: string | null) {
  vi.resetModules();
  vi.doMock("@/lib/cache", () => ({ getCachedSubstitutionData: async () => data }));
  if (lastCheck !== undefined) {
    vi.stubEnv("CRON_SECRET", "secret");
    vi.doMock("@/lib/push/service", () => ({
      getPushService: () => ({ store: { getMeta: async () => lastCheck } }),
    }));
  }
  const { GET } = await import("@/app/api/health/route");
  const response = await GET();
  return { status: response.status, body: await response.json() };
}

afterEach(() => {
  vi.doUnmock("@/lib/cache");
  vi.doUnmock("@/lib/push/service");
  vi.unstubAllEnvs();
});

describe("GET /api/health", () => {
  it("is ok while the plan is read completely", async () => {
    const { status, body } = await health(payload({}));
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, problems: [], fetchedPages: 5 });
  });

  it("reports format problems", async () => {
    const problem = "Seite 2: Tabellenformat nicht erkannt.";
    const { status, body } = await health(
      payload({ diagnostics: [problem], warnings: [problem], error: "Der Plan konnte nicht vollständig gelesen werden." }),
    );
    expect(status).toBe(503);
    expect(body.problems).toEqual([problem]);
  });

  it("lists harmless notes without failing", async () => {
    const note = "Seite 4: 1 Einträge ohne gültige Klasse oder Stunde.";
    const { status, body } = await health(payload({ diagnostics: [note] }));
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, problems: [], notes: [note] });
  });

  it("still reports real problems next to notes", async () => {
    const problem = "Seite 2: Tabellenformat nicht erkannt.";
    const note = "Seite 4: Unbekannte Spalte „x“ wird nicht angezeigt.";
    const { status, body } = await health(
      payload({
        diagnostics: [problem, note],
        warnings: [problem],
        error: "Der Plan konnte nicht vollständig gelesen werden.",
      }),
    );
    expect(status).toBe(503);
    expect(body.problems).toEqual([problem]);
    expect(body.notes).toEqual([note]);
  });

  it("reports when the push check has not run for a while", async () => {
    const recent = await health(payload({}), new Date(Date.now() - 5 * 60_000).toISOString());
    expect(recent.status).toBe(200);

    const overdue = await health(payload({}), new Date(Date.now() - 45 * 60_000).toISOString());
    expect(overdue.status).toBe(503);
    expect(overdue.body.problems[0]).toMatch(/^Push-Check lief zuletzt vor 45 Minuten/);

    const never = await health(payload({}), null);
    expect(never.body.problems[0]).toMatch(/^Push-Check lief noch nie/);
  });

  it("reports an unreachable school website", async () => {
    const { status, body } = await health(payload({ stale: true, error: "Die erste Vertretungsplan-Seite konnte nicht geladen werden." }));
    expect(status).toBe(503);
    expect(body.problems[0]).toMatch(/^Schulseite nicht erreichbar/);

    const down = await health(payload({ success: false, error: "Die erste Vertretungsplan-Seite konnte nicht geladen werden." }));
    expect(down.status).toBe(503);
  });
});

describe("GET /api/health and the holiday data", () => {
  afterEach(() => vi.useRealTimers());

  it("reports in time that the holidays must be extended", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2029-11-15T10:00:00+01:00"));
    const { status, body } = await health(payload({}));
    expect(status).toBe(503);
    expect(body.problems).toEqual(["Ferien sind nur bis 27.04.2030 eingetragen (lib/holidays.ts ergänzen)."]);
  });
});
