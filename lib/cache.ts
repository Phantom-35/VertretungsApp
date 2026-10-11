import { fetchSubstitutionData } from "@/lib/scraper";
import type { SubstitutionPayload } from "@/lib/types";

/** How long a successful result is served without asking the school server. */
const CACHE_TTL_MS = 5 * 60_000;
/** Forced refreshes ("pull to refresh") are honoured at most this often. */
const FORCE_COOLDOWN_MS = 30_000;
/** After a failed fetch, wait this long before hitting the school server again. */
const FAILURE_BACKOFF_MS = 30_000;

type CacheState = {
  expiresAt: number;
  lastAttemptAt: number;
  inFlight: Promise<SubstitutionPayload> | null;
  lastSuccess: SubstitutionPayload | null;
  lastFailure: SubstitutionPayload | null;
};

const globalCache = globalThis as typeof globalThis & {
  __substitutionCache?: CacheState;
};

const cache =
  globalCache.__substitutionCache ??
  (globalCache.__substitutionCache = {
    expiresAt: 0,
    lastAttemptAt: 0,
    inFlight: null,
    lastSuccess: null,
    lastFailure: null,
  });

function buildStalePayload(
  payload: SubstitutionPayload,
  error: string,
): SubstitutionPayload {
  return {
    ...payload,
    success: true,
    stale: true,
    error,
  };
}

function resultForFailure(failure: SubstitutionPayload) {
  if (cache.lastSuccess) {
    return buildStalePayload(
      cache.lastSuccess,
      failure.error ?? "Vertretungsplan momentan nicht erreichbar.",
    );
  }

  return failure;
}

async function refreshCache() {
  cache.lastAttemptAt = Date.now();
  const payload = await fetchSubstitutionData();

  if (payload.success) {
    cache.lastSuccess = payload;
    cache.lastFailure = null;
    // Pages missing (e.g. one timed out): try again soon, not in 5 minutes.
    cache.expiresAt = Date.now() + (payload.error ? FAILURE_BACKOFF_MS : CACHE_TTL_MS);
    return payload;
  }

  cache.lastFailure = payload;
  return resultForFailure(payload);
}

export async function getCachedSubstitutionData(options?: { force?: boolean }) {
  const force = options?.force ?? false;
  const now = Date.now();

  if (cache.inFlight) {
    return cache.inFlight;
  }

  const isFresh = cache.lastSuccess !== null && cache.expiresAt > now;
  const forceAllowed = now - cache.lastAttemptAt >= FORCE_COOLDOWN_MS;

  if (isFresh && (!force || !forceAllowed)) {
    return cache.lastSuccess!;
  }

  // Do not hammer an unreachable school server: answer from the last state
  // until the backoff has passed.
  if (cache.lastFailure && now - cache.lastAttemptAt < FAILURE_BACKOFF_MS) {
    return resultForFailure(cache.lastFailure);
  }

  cache.inFlight = refreshCache().finally(() => {
    cache.inFlight = null;
  });

  return cache.inFlight;
}

/**
 * Always asks the school website (for the push check) and keeps the result:
 * the app opened from a notification then shows the change it announced.
 */
export function fetchFreshSubstitutionData() {
  if (!cache.inFlight) {
    cache.inFlight = refreshCache().finally(() => {
      cache.inFlight = null;
    });
  }
  return cache.inFlight;
}
