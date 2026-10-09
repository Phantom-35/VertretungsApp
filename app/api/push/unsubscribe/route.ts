import { json, notConfigured, readJson } from "@/lib/push/http";
import { getPushService, unsubscribe } from "@/lib/push/service";
import { parseEndpoint } from "@/lib/push/validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const service = getPushService();
  if (!service) {
    return notConfigured();
  }
  const endpoint = parseEndpoint(await readJson(request));
  if (!endpoint) {
    return json({ error: "Ungültige Anfrage." }, 400);
  }
  await unsubscribe(service, endpoint);
  return json({ ok: true });
}
