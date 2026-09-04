import { NextResponse } from "next/server";
import { getCachedSubstitutionData } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "1";

  const payload = await getCachedSubstitutionData({ force });
  const status = payload.success ? 200 : 503;

  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": force
        ? "no-store"
        : "public, max-age=60, s-maxage=600, stale-while-revalidate=300",
    },
  });
}
