import { json, notConfigured, readJson } from "@/lib/push/http";
import { getPushService, subscribe } from "@/lib/push/service";
import { parseSubscribeRequest } from "@/lib/push/validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Registers this device, or updates its class and teachers. */
export async function POST(request: Request) {
  const service = getPushService();
  if (!service) {
    return notConfigured();
  }
  const parsed = parseSubscribeRequest(await readJson(request));
  if (typeof parsed === "string") {
    return json({ error: parsed }, 400);
  }
  const result = await subscribe(service, parsed);
  return result.ok ? json(result) : json({ error: result.error }, result.status);
}
