import { json, notConfigured, readJson } from "@/lib/push/http";
import { getPushService, sendTest } from "@/lib/push/service";
import { parseEndpoint } from "@/lib/push/validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const statusFor = { sent: 200, unknown: 404, "too-soon": 429, gone: 410, failed: 502 } as const;

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
  const result = await sendTest(service, endpoint);
  return json({ result }, statusFor[result]);
}
