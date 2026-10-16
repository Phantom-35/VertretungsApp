import { NextResponse } from "next/server";
import { getPushService } from "@/lib/push/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Kept by Vercel's CDN for a day: the answer is the same for everyone and
 * only changes with the keys, which take a new deploy (that empties the CDN
 * cache). Browsers still ask each time (max-age=0), so they never keep it
 * longer. Saves a function call on every start of the app.
 */
const CACHE_CONTROL = "public, max-age=0, s-maxage=86400";

/** Whether notifications are available, and the key the browser subscribes with. */
export async function GET() {
  const service = getPushService();
  return NextResponse.json(service ? { enabled: true, publicKey: service.publicKey } : { enabled: false }, {
    headers: { "Cache-Control": CACHE_CONTROL },
  });
}
