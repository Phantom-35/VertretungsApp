import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Alert = typeof import("@/lib/alert");

const HOUR = 60 * 60_000;

async function loadAlert(): Promise<Alert> {
  delete (globalThis as { __substitutionAlert?: unknown }).__substitutionAlert;
  vi.resetModules();
  return import("@/lib/alert");
}

function mockWebhook(status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response("", { status });
    }),
  );
  return calls;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("reportPlanProblems", () => {
  it("does nothing without a configured webhook", async () => {
    const calls = mockWebhook();
    const { reportPlanProblems } = await loadAlert();
    expect(await reportPlanProblems(["Seite 2: Datum nicht erkannt."])).toBe("disabled");
    expect(calls).toHaveLength(0);
  });

  it("reports a problem once, again after hours, and when it is gone", async () => {
    vi.stubEnv("ALERT_WEBHOOK_URL", "https://hooks.example.com/abc");
    const calls = mockWebhook();
    const { reportPlanProblems } = await loadAlert();
    const start = Date.parse("2026-10-08T06:00:00Z");

    expect(await reportPlanProblems(["Seite 2: Tabellenformat nicht erkannt."], start)).toBe("sent");
    // Same problem on another page, minutes later: not again.
    expect(await reportPlanProblems(["Seite 3: Tabellenformat nicht erkannt."], start + 5 * 60_000)).toBe("skipped");
    expect(await reportPlanProblems(["Seite 2: Tabellenformat nicht erkannt."], start + 7 * HOUR)).toBe("sent");
    expect(await reportPlanProblems([], start + 8 * HOUR)).toBe("sent");
    expect(await reportPlanProblems([], start + 9 * HOUR)).toBe("skipped");

    expect(calls).toHaveLength(3);
    const first = JSON.parse(String(calls[0].init.body));
    expect(first.text).toContain("Tabellenformat nicht erkannt");
    expect(first.content).toBe(first.text);
    expect(JSON.parse(String(calls[2].init.body)).text).toContain("wieder vollständig");
  });

  it("reports a different problem right away", async () => {
    vi.stubEnv("ALERT_WEBHOOK_URL", "https://hooks.example.com/abc");
    const calls = mockWebhook();
    const { reportPlanProblems } = await loadAlert();
    await reportPlanProblems(["Seite 1: Datum nicht erkannt."], 0);
    expect(await reportPlanProblems(["Seite 1: Unbekannte Spalte „Fach“ wird nicht angezeigt."], 60_000)).toBe("sent");
    expect(calls).toHaveLength(2);
  });

  it("sends plain text to ntfy", async () => {
    vi.stubEnv("ALERT_WEBHOOK_URL", "https://ntfy.sh/kag-plan-test");
    const calls = mockWebhook();
    const { reportPlanProblems } = await loadAlert();
    await reportPlanProblems(["Seite 1: Datum nicht erkannt."]);
    expect(String(calls[0].init.body)).toMatch(/^KAG Vertretungsplan: .*\nSeite 1: Datum nicht erkannt\.$/);
    expect((calls[0].init.headers as Record<string, string>)["content-type"]).toContain("text/plain");
  });

  it("tries again on the next refresh when sending failed", async () => {
    vi.stubEnv("ALERT_WEBHOOK_URL", "https://hooks.example.com/abc");
    mockWebhook(500);
    const { reportPlanProblems } = await loadAlert();
    expect(await reportPlanProblems(["Seite 1: Datum nicht erkannt."], 0)).toBe("failed");
    mockWebhook(200);
    expect(await reportPlanProblems(["Seite 1: Datum nicht erkannt."], 60_000)).toBe("sent");
  });
});

describe("tellMaintainer", () => {
  it("sends warnings to the warning channel and reminders to the maintainer's own", async () => {
    const calls = mockWebhook();
    vi.stubEnv("ALERT_WEBHOOK_URL", "https://ntfy.sh/warnings-test");
    vi.stubEnv("FEEDBACK_WEBHOOK_URL", "https://ntfy.sh/own-test");
    const { tellMaintainer } = await loadAlert();
    expect(await tellMaintainer("Plan leer", "warning")).toBe(true);
    expect(await tellMaintainer("Neues Schuljahr", "reminder")).toBe(true);
    expect(calls.map((call) => String(call.url))).toEqual(["https://ntfy.sh/warnings-test", "https://ntfy.sh/own-test"]);
    expect(calls[0].init.body).toBe("KAG Vertretungsplan: Plan leer");
  });

  it("uses the other channel when only one is set, and never throws", async () => {
    mockWebhook(500);
    vi.stubEnv("FEEDBACK_WEBHOOK_URL", "https://ntfy.sh/own-test");
    const { tellMaintainer } = await loadAlert();
    expect(await tellMaintainer("Plan leer", "warning")).toBe(false);
    vi.stubEnv("FEEDBACK_WEBHOOK_URL", "");
    const calls = mockWebhook();
    expect(await tellMaintainer("Plan leer", "warning")).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
