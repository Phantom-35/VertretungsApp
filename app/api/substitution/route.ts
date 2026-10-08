import { NextResponse } from "next/server";
import { getCachedSubstitutionData } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "1";

  const payload = await getCachedSubstitutionData({ force });
  const status = payload.success ? 200 : 503;
  // Only fresh, complete results may be cached by browsers or a CDN. Errors and
  // stale fallbacks must never outlive the outage.
  const cacheable = payload.success && !payload.stale && !payload.error && !force;

  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": cacheable
        ? "public, max-age=0, s-maxage=60, stale-while-revalidate=240"
        : "no-store",
    },
  });
}
