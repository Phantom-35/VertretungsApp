import { json, notConfigured, readJson } from "@/lib/push/http";
import { getPushService, resubscribe } from "@/lib/push/service";
import { parseEndpoint, parseSubscription } from "@/lib/push/validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Called by the service worker when the browser renews a push subscription. */
export async function POST(request: Request) {
  const service = getPushService();
  if (!service) {
    return notConfigured();
  }
  const body = (await readJson(request)) as { oldEndpoint?: unknown; subscription?: unknown } | null;
  const oldEndpoint = parseEndpoint({ endpoint: body?.oldEndpoint });
  const subscription = parseSubscription(body?.subscription);
  if (!oldEndpoint || !subscription) {
    return json({ error: "Ungültige Anfrage." }, 400);
  }
  const result = await resubscribe(service, oldEndpoint, { subscription });
  return result.ok ? json({ ok: true }) : json({ error: result.error }, result.status);
}
