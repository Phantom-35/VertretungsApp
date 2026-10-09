import { NextResponse } from "next/server";
import { getCachedSubstitutionData } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * For an uptime monitor (e.g. UptimeRobot): 200 while the plan is read
 * completely, 503 with the reasons otherwise.
 */
export async function GET() {
  const payload = await getCachedSubstitutionData();
  const problems: string[] = [];

  if (!payload.success) {
    problems.push(payload.error ?? "Vertretungsplan nicht erreichbar.");
  } else {
    if (payload.stale) {
      problems.push(`Schulseite nicht erreichbar: ${payload.error ?? "unbekannter Fehler"}`);
    }
    problems.push(...payload.diagnostics);
    if (!payload.stale && payload.error) {
      problems.push(...payload.warnings);
    }
  }

  const unique = Array.from(new Set(problems));
  return NextResponse.json(
    {
      ok: unique.length === 0,
      problems: unique,
      sourceUpdatedAt: payload.sourceUpdatedAt,
      lastSuccessfulUpdate: payload.lastSuccessfulUpdate,
      fetchedPages: payload.fetchedPages,
      entries: payload.entries.length,
    },
    {
      status: unique.length === 0 ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
