import { timingSafeEqual } from "node:crypto";
import { runPushCheck } from "@/lib/push/check";
import { json, notConfigured } from "@/lib/push/http";
import { getPushService } from "@/lib/push/service";
import { fetchFreshSubstitutionData } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Fixed clock for the browser tests (`?now=` or PUSH_TEST_NOW); only with the
 * in-memory test store, never in production.
 */
function testNow(request: Request) {
  if (process.env.PUSH_STORE !== "memory") {
    return null;
  }
  const value = new URL(request.url).searchParams.get("now") ?? process.env.PUSH_TEST_NOW;
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(time) ? null : time;
}

// Trimmed: a pasted secret often carries a trailing space or line break.
const cronSecret = () => process.env.CRON_SECRET?.trim() ?? "";

function authorized(request: Request, secret: string) {
  const header = request.headers.get("authorization")?.trim() ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Called every few minutes by a scheduler (GitHub Actions, see
 * .github/workflows/push-check.yml, or Vercel Cron) with
 * `Authorization: Bearer $CRON_SECRET`.
 */
async function handle(request: Request) {
  const secret = cronSecret();
  if (!secret) {
    // Says so plainly, otherwise this looks like a wrong secret in the scheduler.
    return json({ error: "CRON_SECRET ist auf dem Server nicht gesetzt." }, 503);
  }
  if (!authorized(request, secret)) {
    return json({ error: "Nicht berechtigt." }, 401);
  }
  const service = getPushService();
  if (!service) {
    return notConfigured();
  }
  const result = await runPushCheck({
    store: service.store,
    send: service.send,
    // Always fresh from the school website, not from the app's 5-minute cache.
    loadPlan: fetchFreshSubstitutionData,
    now: testNow(request) ?? Date.now(),
  });
  return json(result);
}

export const GET = handle;
export const POST = handle;
