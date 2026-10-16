import { afterEach, describe, expect, it, vi } from "vitest";

/** The browser as the counting sees it: how the page was loaded, the reload mark. */
async function load(type: "navigate" | "reload", reloadedAgoMs: number | null) {
  vi.resetModules();
  const storage = new Map<string, string>();
  if (reloadedAgoMs !== null) storage.set("kag:update-reload", String(Date.now() - reloadedAgoMs));
  vi.stubGlobal("sessionStorage", { getItem: (key: string) => storage.get(key) ?? null });
  vi.stubGlobal("performance", { getEntriesByType: () => [{ type }] });
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false }), navigator: {} });
  vi.stubGlobal("navigator", {});
  const { countAs } = await import("@/components/UsageStats");
  return (url: string) => countAs({ type: "pageview", url });
}

afterEach(() => vi.unstubAllGlobals());

describe("usage statistics", () => {
  it("counts a start, without the day in the address", async () => {
    const count = await load("navigate", null);
    expect(count("https://vertretung-kag.vercel.app/?day=2026-10-09")).toEqual({
      type: "pageview",
      url: "https://vertretung-kag.vercel.app/browser",
    });
  });

  it("does not count the reload for a new version a second time", async () => {
    const count = await load("reload", 2_000);
    expect(count("https://vertretung-kag.vercel.app/")).toBeNull();
    // Only that first view: going on to another page counts again.
    expect(count("https://vertretung-kag.vercel.app/teilen")).toMatchObject({ url: "https://vertretung-kag.vercel.app/teilen" });
  });

  it("still counts a reload by hand and an update reload long ago", async () => {
    expect((await load("reload", null))("https://vertretung-kag.vercel.app/")).not.toBeNull();
    expect((await load("reload", 10 * 60_000))("https://vertretung-kag.vercel.app/")).not.toBeNull();
    expect((await load("navigate", 2_000))("https://vertretung-kag.vercel.app/")).not.toBeNull();
  });
});
