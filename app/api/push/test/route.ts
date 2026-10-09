import { after } from "next/server";
import { json, notConfigured, readJson } from "@/lib/push/http";
import { getPushService, prepareTest } from "@/lib/push/service";
import { parseEndpoint } from "@/lib/push/validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// The delayed send runs after the response; it needs a little time.
export const maxDuration = 30;

/**
 * The test notification comes a few seconds after the tap, so the app can
 * be closed first: then it arrives exactly like a real one.
 */
function testDelayMs() {
  const value = Number(process.env.PUSH_TEST_DELAY_MS);
  return Number.isFinite(value) && value >= 0 ? value : 10_000;
}

const statusFor = { unknown: 404, "too-soon": 429 } as const;

/** Sends a test notification to this device. */
export async function POST(request: Request) {
  const service = getPushService();
  if (!service) {
    return notConfigured();
  }
  const endpoint = parseEndpoint(await readJson(request));
  if (!endpoint) {
    return json({ error: "Ungültige Anfrage." }, 400);
  }
  const prepared = await prepareTest(service, endpoint);
  if (prepared.result !== "scheduled") {
    return json({ result: prepared.result }, statusFor[prepared.result]);
  }
  const delay = testDelayMs();
  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, delay));
    await prepared.deliver();
  });
  return json({ result: "scheduled", delaySeconds: Math.round(delay / 1000) }, 202);
}
