import { timingSafeEqual } from "node:crypto";
import { runPushCheck } from "@/lib/push/check";
import { json, notConfigured } from "@/lib/push/http";
import { getPushService } from "@/lib/push/service";
import { fetchSubstitutionData } from "@/lib/scraper";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Fixed clock for the browser tests; only with the in-memory test store. */
function testNow() {
  const value = process.env.PUSH_TEST_NOW;
  return process.env.PUSH_STORE === "memory" && value ? Date.parse(value) : null;
}

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) {
    return false;
  }
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
  if (!authorized(request)) {
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
    loadPlan: fetchSubstitutionData,
    now: testNow() ?? Date.now(),
  });
  return json(result);
}

export const GET = handle;
export const POST = handle;
