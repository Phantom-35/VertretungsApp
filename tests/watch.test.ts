import { describe, expect, it, vi } from "vitest";
import { runPushCheck } from "@/lib/push/check";
import { MemoryStore } from "@/lib/push/store";
import {
  SPARSE_WAIT_MS,
  countSchoolDays,
  isSparse,
  parseSparseState,
  roomPlanNote,
  sendDeviceReport,
  sendReminders,
  sparseProblem,
  usualCount,
  WATCH_META,
  watchPlanSize,
  yearlyDataReminders,
} from "@/lib/push/watch";
import type { KeyedEntry } from "@/lib/seen";
import type { SubstitutionEntry, SubstitutionPayload } from "@/lib/types";

const entry = (overrides: Partial<KeyedEntry>): KeyedEntry => ({
  date: "2026-10-08",
  className: "05A",
  lesson: "3",
  type: "Entfall",
  substitute: "",
  teacher: "ABC",
  room: "101",
  subject: "",
  text: "",
  ...overrides,
});

/** `count` different entries on `date`. */
const many = (date: string, count: number) =>
  Array.from({ length: count }, (_, index) => entry({ date, lesson: String((index % 9) + 1), teacher: `T${index}` }));

// Thursday 08.10.2026, 10:00 in Germany.
const NOW = Date.parse("2026-10-08T10:00:00+02:00");
const HOUR = 3_600_000;

function teller() {
  const messages: { message: string; kind: string }[] = [];
  const tell = vi.fn(async (message: string, kind: "warning" | "reminder") => {
    messages.push({ message, kind });
    return true;
  });
  return { messages, tell };
}

/** A store that has seen five ordinary school days with about 40 entries each. */
async function storeWithHistory() {
  const store = new MemoryStore();
  await store.setMeta(
    WATCH_META,
    JSON.stringify({ counts: { "2026-10-01": 38, "2026-10-02": 41, "2026-10-05": 40, "2026-10-06": 44, "2026-10-07": 39 } }),
  );
  return store;
}

describe("counting a plan's entries per school day", () => {
  it("counts each row once, only school days from today on", () => {
    const entries = [...many("2026-10-08", 3), many("2026-10-08", 1)[0], ...many("2026-10-07", 5)];
    // 10.10. is a Saturday, 03.10. a public holiday.
    expect(countSchoolDays(entries, ["2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"], "2026-10-08")).toEqual({
      "2026-10-08": 3,
      "2026-10-09": 0,
    });
    expect(countSchoolDays([], ["2026-10-19"], "2026-10-19")).toEqual({});
  });

  it("knows what is usual only after a few days", () => {
    expect(usualCount({ a: 10, b: 20 })).toBeNull();
    expect(usualCount({ a: 10, b: 50, c: 40, d: 30, e: 20 })).toBe(30);
    expect(usualCount({ a: 10, b: 50, c: 40, d: 30, e: 20, f: 60 })).toBe(35);
  });

  it("calls a plan too empty only when every school day is far below the usual", () => {
    const history = { a: 40, b: 40, c: 40, d: 40, e: 40 };
    expect(isSparse({ x: 3, y: 2 }, history)).toBe(true);
    expect(isSparse({ x: 3, y: 12 }, history)).toBe(false);
    expect(isSparse({}, history)).toBe(false);
    // Without history only an empty plan.
    expect(isSparse({ x: 0 }, {})).toBe(true);
    expect(isSparse({ x: 1 }, {})).toBe(false);
  });
});

describe("watching the plan's size", () => {
  const empty = { entries: [], dates: ["2026-10-08", "2026-10-09"] };

  it("tells the maintainer once after two hours, and again when it is over", async () => {
    const store = await storeWithHistory();
    const { messages, tell } = teller();
    expect(await watchPlanSize(store, empty, NOW, tell)).toBe("sparse");
    expect(await watchPlanSize(store, empty, NOW + HOUR, tell)).toBe("sparse");
    expect(messages).toEqual([]);
    expect(await watchPlanSize(store, empty, NOW + SPARSE_WAIT_MS, tell)).toBe("alerted");
    expect(await watchPlanSize(store, empty, NOW + SPARSE_WAIT_MS + HOUR, tell)).toBe("sparse");
    expect(messages).toHaveLength(1);
    expect(messages[0].kind).toBe("warning");
    expect(messages[0].message).toContain("auffällig leer (08.10.: 0, 09.10.: 0 Einträge, üblich sind etwa 40)");

    const full = { entries: many("2026-10-08", 35), dates: ["2026-10-08"] };
    expect(await watchPlanSize(store, full, NOW + 4 * HOUR, tell)).toBe("recovered");
    expect(messages.at(-1)?.message).toContain("wieder so viele Einträge");
    expect(parseSparseState(await store.getMeta(WATCH_META))).toBeNull();
  });

  it("stays quiet about a short gap (an upload in progress)", async () => {
    const store = await storeWithHistory();
    const { messages, tell } = teller();
    await watchPlanSize(store, empty, NOW, tell);
    expect(await watchPlanSize(store, { entries: many("2026-10-08", 30), dates: ["2026-10-08"] }, NOW + HOUR, tell)).toBe("ok");
    expect(await watchPlanSize(store, empty, NOW + 2 * HOUR, tell)).toBe("sparse");
    expect(messages).toEqual([]);
  });

  it("does not learn an empty plan as usual", async () => {
    const store = await storeWithHistory();
    const { tell } = teller();
    await watchPlanSize(store, empty, NOW, tell);
    expect(JSON.parse((await store.getMeta(WATCH_META))!).counts).not.toHaveProperty("2026-10-08");
    await watchPlanSize(store, { entries: many("2026-10-08", 30), dates: ["2026-10-08"] }, NOW, tell);
    expect(JSON.parse((await store.getMeta(WATCH_META))!).counts).toMatchObject({ "2026-10-08": 30 });
  });

  it("tries again when the message could not be sent", async () => {
    const store = await storeWithHistory();
    const tell = vi.fn(async () => false);
    await watchPlanSize(store, empty, NOW, tell);
    expect(await watchPlanSize(store, empty, NOW + SPARSE_WAIT_MS, tell)).toBe("sparse");
    expect(await watchPlanSize(store, empty, NOW + SPARSE_WAIT_MS + 600_000, tell)).toBe("sparse");
    expect(tell).toHaveBeenCalledTimes(2);
  });

  it("shows up in the health check after the wait", () => {
    expect(parseSparseState("2026-10-08T08:00:00.000Z")).toBeNull();
    expect(parseSparseState("")).toBeNull();
    const state = parseSparseState(JSON.stringify({ counts: {}, sparse: { since: new Date(NOW).toISOString() } }));
    expect(sparseProblem(state, NOW + HOUR)).toBeNull();
    expect(sparseProblem(state, NOW + 3 * HOUR)).toBe("Plan seit 3 Stunden auffällig leer (Format der Schulseite geändert?).");
  });

  it("runs with every complete push check, not with an incomplete one", async () => {
    const store = await storeWithHistory();
    const { messages, tell } = teller();
    const send = vi.fn(async () => "sent" as const);
    const plan = (entries: SubstitutionEntry[], overrides: Partial<SubstitutionPayload> = {}) =>
      ({
        success: true,
        stale: false,
        error: null,
        entries,
        days: [{ date: "2026-10-08", dayLabel: "", weekLabel: "" }],
        ...overrides,
      }) as SubstitutionPayload;
    await runPushCheck({ store, send, loadPlan: async () => plan([]), now: NOW, tell });
    expect(parseSparseState(await store.getMeta(WATCH_META))).not.toBeNull();
    await runPushCheck({ store, send, loadPlan: async () => plan([], { stale: true }), now: NOW + 3 * HOUR, tell });
    expect(messages).toEqual([]);
    await runPushCheck({ store, send, loadPlan: async () => plan([]), now: NOW + 3 * HOUR, tell });
    expect(messages).toHaveLength(1);
  });
});

describe("reminders for a new school year", () => {
  it("asks for the room plan once its school year is over", () => {
    expect(roomPlanNote("2027-07-31", 2026)).toBeNull();
    expect(roomPlanNote("2027-08-01", 2026)).toContain("Raumplan und Klassenräume");
    expect(yearlyDataReminders("2026-11-02")).toEqual([]);
    const reminders = yearlyDataReminders("2027-08-02");
    expect(reminders).toHaveLength(2);
    expect(reminders.join(" ")).toContain("Schulfreie Tage");
  });

  it("sends them once a week in the daytime until they are done", async () => {
    const store = new MemoryStore();
    const { messages, tell } = teller();
    // Monday 02.08.2027.
    const monday = Date.parse("2027-08-02T10:00:00+02:00");
    expect(await sendReminders(store, Date.parse("2027-08-02T07:00:00+02:00"), tell)).toBe(false);
    expect(await sendReminders(store, monday, tell)).toBe(true);
    expect(await sendReminders(store, monday + HOUR, tell)).toBe(false);
    expect(await sendReminders(store, monday + 6 * 24 * HOUR, tell)).toBe(false);
    expect(await sendReminders(store, monday + 7 * 24 * HOUR, tell)).toBe(true);
    expect(messages).toHaveLength(2);
    expect(messages[0].kind).toBe("reminder");
    expect(messages[0].message).toMatch(/^Bitte fürs neue Schuljahr nachtragen lassen[^\n]*\n• /);
    // Nothing left to add: nothing sent.
    expect(await sendReminders(new MemoryStore(), Date.parse("2026-11-02T10:00:00+01:00"), tell)).toBe(false);
  });
});

describe("the weekly device report", () => {
  // Monday 09.11.2026.
  const MONDAY = Date.parse("2026-11-09T10:00:00+01:00");
  const WEEK = 7 * 24 * HOUR;

  async function storeWith(devices: number) {
    const store = new MemoryStore();
    for (let index = 0; index < devices; index += 1) {
      await store.saveSubscriber({
        id: `d${index}`,
        subscription: { endpoint: `https://web.push.apple.com/d${index}`, keys: { p256dh: "B", auth: "A" } },
        schoolClass: "5A",
        teachers: [],
        createdAt: "",
        updatedAt: "",
      });
    }
    return store;
  }

  it("counts the devices once on Mondays in the daytime, with the change since last week", async () => {
    const store = await storeWith(3);
    const { messages, tell } = teller();
    // Not on other days, not early in the morning: then nothing is read at all.
    const getMeta = vi.spyOn(store, "getMeta");
    expect(await sendDeviceReport(store, MONDAY - 24 * HOUR, tell)).toBe(false);
    expect(await sendDeviceReport(store, Date.parse("2026-11-09T07:00:00+01:00"), tell)).toBe(false);
    expect(getMeta).not.toHaveBeenCalled();

    expect(await sendDeviceReport(store, MONDAY, tell)).toBe(true);
    expect(await sendDeviceReport(store, MONDAY + HOUR, tell)).toBe(false);
    expect(messages).toEqual([{ message: "Wochenbericht: 3 Geräte haben Benachrichtigungen eingeschaltet.", kind: "reminder" }]);

    await store.deleteSubscriber("d0");
    expect(await sendDeviceReport(store, MONDAY + WEEK, tell)).toBe(true);
    expect(messages.at(-1)?.message).toBe("Wochenbericht: 2 Geräte haben Benachrichtigungen eingeschaltet (−1 seit letzter Woche).");
    expect(await sendDeviceReport(store, MONDAY + 3 * WEEK, tell)).toBe(true);
    expect(messages.at(-1)?.message).toBe(
      "Wochenbericht: 2 Geräte haben Benachrichtigungen eingeschaltet (unverändert seit dem 16.11.).",
    );
  });

  it("tries again at the next check when the message could not be sent", async () => {
    const store = await storeWith(1);
    const tell = vi.fn(async () => false);
    expect(await sendDeviceReport(store, MONDAY, tell)).toBe(false);
    const { messages, tell: working } = teller();
    expect(await sendDeviceReport(store, MONDAY + 600_000, working)).toBe(true);
    expect(messages[0].message).toBe("Wochenbericht: 1 Gerät hat Benachrichtigungen eingeschaltet.");
  });
});
