import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sent: { url: string; body: string }[] = [];

beforeEach(() => {
  vi.resetModules();
  sent.length = 0;
  delete (globalThis as { __planSource?: unknown }).__planSource;
  delete (globalThis as { __pushMemoryStore?: unknown }).__pushMemoryStore;
  vi.stubEnv("KV_REST_API_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("PUSH_STORE", "memory");
  vi.stubEnv("FEEDBACK_WEBHOOK_URL", "https://ntfy.sh/kag-geheim-test");
  vi.stubGlobal("fetch", async (url: URL | string, init: RequestInit) => {
    sent.push({ url: String(url), body: String(init.body) });
    return new Response(null, { status: 200 });
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** As if a new server instance started (memory gone, Redis kept). */
async function freshInstance() {
  delete (globalThis as { __planSource?: unknown }).__planSource;
  vi.resetModules();
  return (await import("@/lib/source-switch")).reportPlanSource;
}

describe("reportPlanSource", () => {
  it("tells the maintainer once when monitor2020 fails, and once when it is back", async () => {
    let report = await freshInstance();
    // The normal case: nothing to say.
    expect(await report("primary")).toBe("unchanged");
    expect(sent).toHaveLength(0);

    expect(await report("fallback", "HTTP 404")).toBe("sent");
    expect(new URL(sent[0].url).searchParams.get("title")).toBe("⚠️ monitor2020 ist ausgefallen");
    expect(sent[0].body).toContain("(HTTP 404)");
    expect(sent[0].body).toContain("vertretung.meckenheim-kag.com");
    // Every further fetch on the stand-in: no more messages, also not from another instance.
    expect(await report("fallback")).toBe("unchanged");
    report = await freshInstance();
    expect(await report("fallback")).toBe("unchanged");
    expect(sent).toHaveLength(1);

    expect(await report("primary")).toBe("sent");
    expect(new URL(sent[1].url).searchParams.get("title")).toBe("✅ monitor2020 ist wieder da");
    report = await freshInstance();
    expect(await report("primary")).toBe("unchanged");
    expect(sent).toHaveLength(2);
    // Only to the maintainer's own channel.
    expect(sent.every((item) => item.url.startsWith("https://ntfy.sh/kag-geheim-test"))).toBe(true);
  });

  it("tries again when the message could not be sent, instead of losing it", async () => {
    let fail = true;
    vi.stubGlobal("fetch", async (url: URL | string, init: RequestInit) => {
      if (fail) return new Response(null, { status: 500 });
      sent.push({ url: String(url), body: String(init.body) });
      return new Response(null, { status: 200 });
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const report = await freshInstance();
    expect(await report("fallback")).toBe("failed");
    fail = false;
    expect(await report("fallback")).toBe("sent");
    expect(sent).toHaveLength(1);
    expect(await report("fallback")).toBe("unchanged");
  });

  it("keeps quiet without a channel and never throws", async () => {
    vi.stubEnv("FEEDBACK_WEBHOOK_URL", "");
    vi.stubEnv("ALERT_WEBHOOK_URL", "");
    const report = await freshInstance();
    expect(await report("fallback")).toBe("disabled");
    expect(sent).toHaveLength(0);
  });
});
