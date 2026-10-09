import { json } from "@/lib/push/http";
import { getPushService } from "@/lib/push/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Whether notifications are available, and the key the browser subscribes with. */
export async function GET() {
  const service = getPushService();
  return json(service ? { enabled: true, publicKey: service.publicKey } : { enabled: false });
}
