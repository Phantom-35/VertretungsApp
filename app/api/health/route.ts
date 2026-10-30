import { NextResponse } from "next/server";
import { getCachedSubstitutionData } from "@/lib/cache";
import { holidayDataProblem, schoolDaysOffNote } from "@/lib/holidays";
import { SCHOOL_PLAN_FALLBACK_BASE_URL } from "@/lib/school";
import { LAST_CHECK_META } from "@/lib/push/check";
import { getPushService } from "@/lib/push/service";
import { schoolToday } from "@/lib/time";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The scheduler calls the push check every 10 minutes. */
const CHECK_OVERDUE_MS = 30 * 60_000;

/** With notifications set up: whether the scheduler still calls the check. */
async function pushCheckProblem(now: number) {
  // The in-memory store is for tests, which have no scheduler.
  const service = process.env.CRON_SECRET && process.env.PUSH_STORE !== "memory" ? getPushService() : null;
  if (!service) {
    return null;
  }
  try {
    const last = await service.store.getMeta(LAST_CHECK_META);
    const age = last ? now - Date.parse(last) : Number.POSITIVE_INFINITY;
    if (age > CHECK_OVERDUE_MS) {
      return last
        ? `Push-Check lief zuletzt vor ${Math.round(age / 60_000)} Minuten (cron-job.org prüfen).`
        : "Push-Check lief noch nie (cron-job.org prüfen).";
    }
  } catch {
    return "Push-Speicher (Redis) nicht erreichbar.";
  }
  return null;
}

/**
 * For an uptime monitor (e.g. UptimeRobot): 200 while the plan is read
 * completely (and, with notifications, the push check runs), 503 with the
 * reasons otherwise.
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
    // Only real findings of the self-check (they are also warnings); notes such
    // as a single all-day row do not make the plan incomplete.
    problems.push(...payload.diagnostics.filter((item) => payload.warnings.includes(item)));
    if (!payload.stale && payload.error) {
      problems.push(...payload.warnings);
    }
  }

  const pushProblem = await pushCheckProblem(Date.now());
  if (pushProblem) {
    problems.push(pushProblem);
  }
  const holidayProblem = holidayDataProblem(schoolToday(Date.now()));
  if (holidayProblem) {
    problems.push(holidayProblem);
  }

  const unique = Array.from(new Set(problems));
  return NextResponse.json(
    {
      ok: unique.length === 0,
      problems: unique,
      // For information only, they do not change the status.
      notes: [
        ...payload.diagnostics.filter((item) => !payload.warnings.includes(item)),
        ...[schoolDaysOffNote(schoolToday(Date.now()))].filter((note): note is string => note !== null),
        ...(payload.success && payload.sourceUrl.startsWith(SCHOOL_PLAN_FALLBACK_BASE_URL)
          ? ["Notlösung aktiv: monitor2020 liefert nicht, der Plan kommt von vertretung.meckenheim-kag.com."]
          : []),
      ],
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
