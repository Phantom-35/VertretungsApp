import { afterEach, describe, expect, it, vi } from "vitest";
import { describeDevice } from "@/lib/device-info";
import { feedbackMailto, feedbackText, feedbackTitle, parseFeedback } from "@/lib/feedback";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPHONE_APP =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const SAMSUNG =
  "Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
const WINDOWS_EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";
const FIREFOX = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0";

describe("describeDevice", () => {
  it("names device, system and browser in plain words", () => {
    expect(describeDevice(IPHONE)).toEqual({ device: "iPhone · iOS 18.0", browser: "Safari 18.0" });
    expect(describeDevice(IPHONE_APP)).toEqual({ device: "iPhone · iOS 17.5.1", browser: "Safari" });
    expect(describeDevice(ANDROID)).toEqual({ device: "Android 14", browser: "Chrome 130" });
    expect(describeDevice(SAMSUNG)).toEqual({ device: "Android 13 (SM-S911B)", browser: "Samsung Internet 23.0" });
    expect(describeDevice(MAC)).toEqual({ device: "Mac · macOS", browser: "Safari 18.1" });
    // An iPad asks for the desktop page; only touch gives it away.
    expect(describeDevice(MAC, true).device).toBe("iPad · iPadOS");
    expect(describeDevice(WINDOWS_EDGE)).toEqual({ device: "PC · Windows 10/11", browser: "Edge 130" });
    expect(describeDevice(FIREFOX).browser).toBe("Firefox 131");
    expect(describeDevice("curl/8.0")).toEqual({ device: "Unbekannt", browser: "Unbekannt" });
  });
});

describe("parseFeedback", () => {
  const valid = { category: "bug", problem: "plan", message: " 9B fehlt ", contact: "", details: { schoolClass: "9B" } };

  it("accepts a complete message and tidies it up", () => {
    expect(parseFeedback(valid)).toEqual({
      category: "bug",
      problem: "plan",
      message: "9B fehlt",
      contact: "",
      details: { schoolClass: "9B" },
    });
  });

  it("refuses what is missing or wrong", () => {
    expect(parseFeedback(null)).toBeNull();
    expect(parseFeedback({ ...valid, category: "spam" })).toBeNull();
    expect(parseFeedback({ ...valid, message: "   " })).toBeNull();
    expect(parseFeedback({ ...valid, contact: "keine-adresse" })).toBeNull();
  });

  it("keeps only known details, short and on one line", () => {
    const parsed = parseFeedback({
      ...valid,
      problem: "unknown",
      message: "a\u0000b",
      details: { schoolClass: "9B\n<script>", evil: "x", device: "y".repeat(1000) },
    })!;
    expect(parsed.problem).toBeNull();
    expect(parsed.message).toBe("ab");
    expect(parsed.details).toEqual({ schoolClass: "9B <script>", device: "y".repeat(400) });
    expect(parseFeedback({ ...valid, message: "x".repeat(5000) })!.message).toHaveLength(2000);
    // The problem only belongs to errors.
    expect(parseFeedback({ ...valid, category: "idea" })!.problem).toBeNull();
  });
});

describe("message text", () => {
  const feedback = {
    category: "bug" as const,
    problem: "notifications" as const,
    message: "Kommt nichts",
    contact: "a@b.de",
    details: { device: "iPhone · iOS 18.0", schoolClass: "9B" },
  };

  it("has a title with the topic and the details at the end", () => {
    expect(feedbackTitle(feedback)).toBe("🐞 Fehler: Benachrichtigungen kommen nicht");
    expect(feedbackTitle({ category: "idea", problem: null })).toBe("💡 Idee oder Wunsch");
    expect(feedbackText(feedback)).toBe(
      "Kommt nichts\n\nAntwort an: a@b.de\n\n---\nGerät: iPhone · iOS 18.0\nKlasse: 9B",
    );
    expect(feedbackText({ ...feedback, contact: "", details: {} })).toBe("Kommt nichts");
  });

  it("always fits into one push as readable text", () => {
    const long = {
      ...feedback,
      message: "Ä".repeat(2000),
      details: { device: "x".repeat(400), browser: "y".repeat(400), userAgent: "z".repeat(400) },
    };
    const text = feedbackText(long, 3_800);
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(3_800);
    // The details go first, the message is only shortened when needed.
    expect(text).not.toContain("Kennung:");
    expect(text.startsWith("Ä")).toBe(true);
    expect(text).toContain("Antwort an: a@b.de");
    // Short messages stay whole.
    expect(feedbackText(feedback, 3_800)).toBe(feedbackText(feedback));
  });

  it("is the same as an e-mail", () => {
    const mailto = feedbackMailto(feedback);
    expect(mailto.startsWith("mailto:phandevstudios@gmx.de?subject=")).toBe(true);
    const url = new URL(mailto);
    expect(url.searchParams.get("subject")).toBe("KAG Vertretungsplan – Fehler: Benachrichtigungen kommen nicht");
    expect(url.searchParams.get("body")).toBe(feedbackText(feedback));
  });
});

describe("POST /api/feedback", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    delete (globalThis as { __feedbackLimits?: unknown }).__feedbackLimits;
  });

  const post = (body: unknown, headers: Record<string, string> = {}) =>
    new Request("https://vertretung-kag.vercel.app/api/feedback", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        host: "vertretung-kag.vercel.app",
        origin: "https://vertretung-kag.vercel.app",
        "x-forwarded-for": "203.0.113.7",
        ...headers,
      },
    });
  const message = { category: "question", message: "Geht das auch für Lehrer?", contact: "", details: {} };

  async function route(webhook = "https://ntfy.sh/kag-geheim-test") {
    vi.stubEnv("FEEDBACK_WEBHOOK_URL", webhook);
    vi.stubEnv("ALERT_WEBHOOK_URL", "");
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: URL | string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(null, { status: 200 });
    });
    const { POST } = await import("@/app/api/feedback/route");
    return { POST, calls };
  }

  it("passes the message on to the secret ntfy topic, title in the address", async () => {
    const { POST, calls } = await route();
    const response = await POST(post(message));
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    const target = new URL(calls[0].url);
    expect(`${target.origin}${target.pathname}`).toBe("https://ntfy.sh/kag-geheim-test");
    expect(target.searchParams.get("title")).toBe("❓ Frage");
    expect(calls[0].init.body).toBe("Geht das auch für Lehrer?");
  });

  it("is off without a webhook, and the address never reaches the page", async () => {
    vi.stubEnv("FEEDBACK_WEBHOOK_URL", "");
    vi.stubEnv("ALERT_WEBHOOK_URL", "");
    const { POST } = await import("@/app/api/feedback/route");
    const response = await POST(post(message));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("ntfy");
  });

  it("only takes messages from the app's own pages", async () => {
    const { POST, calls } = await route();
    expect((await POST(post(message, { origin: "https://evil.example" }))).status).toBe(403);
    const withoutOrigin = new Request("https://vertretung-kag.vercel.app/api/feedback", {
      method: "POST",
      body: JSON.stringify(message),
      headers: { host: "vertretung-kag.vercel.app" },
    });
    expect((await POST(withoutOrigin)).status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("refuses incomplete messages and quietly drops bots", async () => {
    const { POST, calls } = await route();
    expect((await POST(post({ ...message, message: "" }))).status).toBe(400);
    expect((await POST(post({ ...message, website: "https://spam.example" }))).status).toBe(200);
    expect(calls).toHaveLength(0);
  });

  it("counts all server instances together, too", async () => {
    vi.stubEnv("PUSH_STORE", "memory");
    delete (globalThis as { __pushMemoryStore?: unknown }).__pushMemoryStore;
    const { POST, calls } = await route();
    // 30 an hour from different addresses (and instances): then it stops.
    for (let index = 0; index < 30; index += 1) {
      delete (globalThis as { __feedbackLimits?: unknown }).__feedbackLimits;
      expect((await POST(post(message, { "x-forwarded-for": `198.51.100.${index}` }))).status).toBe(200);
    }
    delete (globalThis as { __feedbackLimits?: unknown }).__feedbackLimits;
    expect((await POST(post(message, { "x-forwarded-for": "203.0.113.99" }))).status).toBe(429);
    expect(calls).toHaveLength(30);
    delete (globalThis as { __pushMemoryStore?: unknown }).__pushMemoryStore;
  });

  it("slows down a flood: three per address in ten minutes", async () => {
    const { POST, calls } = await route();
    for (let index = 0; index < 3; index += 1) {
      expect((await POST(post(message))).status).toBe(200);
    }
    expect((await POST(post(message))).status).toBe(429);
    // Someone else is not affected.
    expect((await POST(post(message, { "x-forwarded-for": "198.51.100.2" }))).status).toBe(200);
    expect(calls).toHaveLength(4);
  });

  it("says so when the webhook does not answer", async () => {
    vi.stubEnv("FEEDBACK_WEBHOOK_URL", "https://ntfy.sh/kag-geheim-test");
    vi.stubGlobal("fetch", async () => new Response(null, { status: 500 }));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { POST } = await import("@/app/api/feedback/route");
    expect((await POST(post(message))).status).toBe(502);
  });
});
