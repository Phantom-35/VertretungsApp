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

async function health(data: SubstitutionPayload) {
  vi.resetModules();
  vi.doMock("@/lib/cache", () => ({ getCachedSubstitutionData: async () => data }));
  const { GET } = await import("@/app/api/health/route");
  const response = await GET();
  return { status: response.status, body: await response.json() };
}

afterEach(() => {
  vi.doUnmock("@/lib/cache");
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

  it("reports an unreachable school website", async () => {
    const { status, body } = await health(payload({ stale: true, error: "Die erste Vertretungsplan-Seite konnte nicht geladen werden." }));
    expect(status).toBe(503);
    expect(body.problems[0]).toMatch(/^Schulseite nicht erreichbar/);

    const down = await health(payload({ success: false, error: "Die erste Vertretungsplan-Seite konnte nicht geladen werden." }));
    expect(down.status).toBe(503);
  });
});
