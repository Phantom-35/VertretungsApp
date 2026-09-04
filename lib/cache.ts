import { fetchSubstitutionData } from "@/lib/scraper";
import type { SubstitutionPayload } from "@/lib/types";

const CACHE_TTL_MS = 600_000;

type CacheState = {
  expiresAt: number;
  inFlight: Promise<SubstitutionPayload> | null;
  lastSuccess: SubstitutionPayload | null;
};

const globalCache = globalThis as typeof globalThis & {
  __substitutionCache?: CacheState;
};

const cache =
  globalCache.__substitutionCache ??
  (globalCache.__substitutionCache = {
    expiresAt: 0,
    inFlight: null,
    lastSuccess: null,
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

async function refreshCache() {
  const payload = await fetchSubstitutionData();

  if (payload.success) {
    cache.lastSuccess = payload;
    cache.expiresAt = Date.now() + CACHE_TTL_MS;
    return payload;
  }

  if (cache.lastSuccess) {
    return buildStalePayload(
      cache.lastSuccess,
      payload.error ?? "Vertretungsplan momentan nicht erreichbar.",
    );
  }

  return payload;
}

export async function getCachedSubstitutionData(options?: { force?: boolean }) {
  const force = options?.force ?? false;

  if (!force && cache.lastSuccess && cache.expiresAt > Date.now()) {
    return cache.lastSuccess;
  }

  if (cache.inFlight) {
    return cache.inFlight;
  }

  cache.inFlight = refreshCache().finally(() => {
    cache.inFlight = null;
  });

  return cache.inFlight;
}
