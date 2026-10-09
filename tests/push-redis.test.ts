import { afterEach, describe, expect, it, vi } from "vitest";
import { runPushCheck } from "@/lib/push/check";
import type { PushPayload } from "@/lib/push/message";
import { subscriberId } from "@/lib/push/sender";
import { getPushStore, type Subscriber } from "@/lib/push/store";
import type { SubstitutionEntry, SubstitutionPayload } from "@/lib/types";
import { startFakeUpstash } from "./fake-upstash";

afterEach(() => {
  vi.unstubAllEnvs();
});

const subscriber = (name: string, schoolClass: string): Subscriber => {
  const endpoint = `https://web.push.apple.com/${name}`;
  return {
    id: subscriberId(endpoint),
    subscription: { endpoint, keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } },
    schoolClass,
    teachers: ["RUK"],
    createdAt: "2026-10-08T08:00:00.000Z",
    updatedAt: "2026-10-08T08:00:00.000Z",
  };
};

describe("Redis push store (Upstash REST)", () => {
  it.each([
    ["Vercel KV variables", "KV_REST_API_URL", "KV_REST_API_TOKEN"],
    ["Upstash variables", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
  ])("stores subscribers, plan state and locks (%s)", async (_, urlVariable, tokenVariable) => {
    const upstash = await startFakeUpstash();
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv(urlVariable, upstash.url);
    vi.stubEnv(tokenVariable, "token");
    try {
      const store = getPushStore()!;
      expect(store).not.toBeNull();

      const five = subscriber("five", "5A");
      const q1 = subscriber("q1", "Q1");
      await store.saveSubscriber(five);
      await store.saveSubscriber(q1);
      expect(await store.countSubscribers()).toBe(2);
      expect(await store.getSubscriber(five.id)).toEqual(five);
      expect((await store.listSubscribers()).map((item) => item.id).sort()).toEqual([five.id, q1.id].sort());
      await store.saveSubscriber({ ...five, schoolClass: "6B" });
      expect((await store.getSubscriber(five.id))?.schoolClass).toBe("6B");
      await store.deleteSubscriber(q1.id);
      expect(await store.getSubscriber(q1.id)).toBeNull();
      expect(await store.countSubscribers()).toBe(1);

      expect(await store.getPlanState()).toBeNull();
      const state = { keys: ["2026-10-09|05A|3|Entfall|||||Text mit | Strich"], missing: [], updatedAt: "x" };
      await store.savePlanState(state);
      expect(await store.getPlanState()).toEqual(state);

      expect(await store.getMeta("summary-day")).toBeNull();
      await store.setMeta("summary-day", "2026-10-09");
      expect(await store.getMeta("summary-day")).toBe("2026-10-09");

      expect(await store.acquireLock("check", 60)).toBe(true);
      expect(await store.acquireLock("check", 60)).toBe(false);
      await store.releaseLock("check");
      expect(await store.acquireLock("check", 60)).toBe(true);
    } finally {
      await upstash.close();
    }
  });

  it("runs a whole check against Redis", async () => {
    const upstash = await startFakeUpstash();
    vi.stubEnv("KV_REST_API_URL", upstash.url);
    vi.stubEnv("KV_REST_API_TOKEN", "token");
    try {
      const store = getPushStore()!;
      await store.saveSubscriber(subscriber("five", "5A"));
      const sent: PushPayload[] = [];
      const send = async (_: unknown, payload: PushPayload) => {
        sent.push(payload);
        return "sent" as const;
      };
      const entry = (type: string) =>
        ({ className: "05A", lesson: "2", type, substitute: "", teacher: "ABC", room: "", subject: "", text: "", date: "2026-10-09", id: "", page: 1 }) as SubstitutionEntry;
      const plan = (entries: SubstitutionEntry[]) =>
        ({ success: true, stale: false, error: null, entries }) as SubstitutionPayload;
      const now = Date.parse("2026-10-08T10:00:00+02:00");

      expect(await runPushCheck({ store, send, loadPlan: async () => plan([entry("Vertretung")]), now })).toMatchObject({ status: "initialized" });
      expect(await runPushCheck({ store, send, loadPlan: async () => plan([entry("Entfall")]), now })).toMatchObject({ status: "checked", notified: 1 });
      expect(sent.map((item) => item.body)).toEqual(["Jetzt: Entfall · ABC (vorher Vertretung)"]);
      // The lock was released after each run.
      expect(await store.acquireLock("check", 1)).toBe(true);
      expect(upstash.commands.some(([name]) => name.toUpperCase() === "SET")).toBe(true);
    } finally {
      await upstash.close();
    }
  });
});
