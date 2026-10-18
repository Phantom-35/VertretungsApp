import { useCallback, useEffect, useRef, useState } from "react";
import type { SubstitutionPayload } from "@/lib/types";

const DATA_STORAGE_KEY = "kag:substitution-cache:v3";
const LEGACY_DATA_STORAGE_KEYS = [
  "kag:substitution-cache",
  "kag:substitution-cache:v2",
];
/** Refresh in the background this often while the app is open. */
const AUTO_REFRESH_MS = 5 * 60_000;
/** Automatic refreshes (focus, visibility, online) are skipped if the last attempt is more recent. */
const MIN_AUTO_REFRESH_GAP_MS = 30_000;
/** Server-rendered data younger than this is not re-fetched on mount. */
const INITIAL_DATA_MAX_AGE_MS = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
/**
 * A home-screen app that wakes up from the background often has no network
 * for a moment, so failed requests are retried before an error is shown.
 */
const RETRY_DELAYS_MS = [1_000, 3_000];

const OFFLINE_MESSAGE = "Keine Verbindung. Ist das Internet an?";
const SCHOOL_DOWN_MESSAGE = "Die Seite der Schule ist gerade nicht erreichbar.";

export type LoadStatus = "idle" | "loading" | "refreshing";

type State = {
  data: SubstitutionPayload | null;
  /** Data restored from this device, not yet confirmed by the server. */
  fromDevice: boolean;
  status: LoadStatus;
  /** The app's own server could not be reached or had no data at all. */
  connectionError: string | null;
  /**
   * The server answered, but could not read the school's plan (its pages
   * missing or down): not the device being offline.
   */
  schoolDown: boolean;
};

function readStoredPayload() {
  try {
    LEGACY_DATA_STORAGE_KEYS.forEach((key) =>
      window.localStorage.removeItem(key),
    );
    const raw = window.localStorage.getItem(DATA_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const payload = JSON.parse(raw) as SubstitutionPayload;
    return payload.success && Array.isArray(payload.days) ? payload : null;
  } catch {
    return null;
  }
}

function storePayload(payload: SubstitutionPayload) {
  try {
    window.localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage full or unavailable: the app still works without it.
  }
}

function isNewer(
  candidate: SubstitutionPayload,
  current: SubstitutionPayload | null,
) {
  if (!current) {
    return true;
  }
  return (candidate.lastUpdated ?? "") > (current.lastUpdated ?? "");
}

/**
 * Cached answers (CDN, server instance) lag behind by a few minutes at most;
 * a copy far ahead of the server's is not trusted to win forever.
 */
const MAX_CACHED_LAG_MS = 15 * 60_000;

function ageGap(newer: SubstitutionPayload, older: SubstitutionPayload) {
  return Date.parse(newer.lastUpdated ?? "") - Date.parse(older.lastUpdated ?? "");
}

/**
 * The data to show after a successful answer. When the school website is down,
 * the server falls back to its own last copy, which can be older than the one
 * already on screen (e.g. a freshly started server instance). Then the newer
 * copy stays, marked as stale. An older copy from the CDN (e.g. right after a
 * pull to refresh) never replaces a newer one either.
 */
export function pickDisplayedPayload(
  payload: SubstitutionPayload,
  current: SubstitutionPayload | null,
): SubstitutionPayload {
  if (payload.stale && current && !isNewer(payload, current)) {
    return { ...current, stale: true, error: payload.error };
  }
  if (current && isNewer(current, payload) && ageGap(current, payload) < MAX_CACHED_LAG_MS) {
    return current;
  }
  return payload;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPayload(force: boolean) {
  const url = force ? "/api/substitution?force=1" : "/api/substitution";

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      return (await response.json()) as SubstitutionPayload;
    } catch (error) {
      if (attempt >= RETRY_DELAYS_MS.length) {
        throw error;
      }
      await wait(RETRY_DELAYS_MS[attempt]);
    }
  }
}

export function useSubstitutionData(initialData: SubstitutionPayload | null) {
  const [state, setState] = useState<State>({
    data: initialData,
    fromDevice: false,
    status: initialData ? "idle" : "loading",
    connectionError: null,
    schoolDown: false,
  });
  const inFlightRef = useRef<Promise<void> | null>(null);
  const inFlightForcedRef = useRef(false);
  const lastAttemptRef = useRef(0);

  const refresh = useCallback((force = false) => {
    const start = (force: boolean): Promise<void> => {
      if (inFlightRef.current) {
        // A pull-to-refresh during a background refresh must still ask the
        // school website, not just receive the server's cached copy.
        return force && !inFlightForcedRef.current
          ? inFlightRef.current.then(() => start(true))
          : inFlightRef.current;
      }

      const run = async () => {
        lastAttemptRef.current = Date.now();
        const stored = readStoredPayload();

        setState((current) => {
          // Show the device's copy while loading if it is newer than what is on
          // screen (e.g. an old page from the service worker cache).
          if (stored && isNewer(stored, current.data)) {
            return {
              ...current,
              data: stored,
              fromDevice: true,
              status: "refreshing",
            };
          }
          return {
            ...current,
            status: current.data ? "refreshing" : "loading",
          };
        });

        try {
          const payload = await fetchPayload(force);

          if (payload.success) {
            setState((current) => ({
              data: pickDisplayedPayload(payload, current.data),
              fromDevice: false,
              status: "idle",
              connectionError: null,
              schoolDown: false,
            }));
            if (!payload.stale && pickDisplayedPayload(payload, readStoredPayload()) === payload) {
              storePayload(payload);
            }
          } else {
            setState((current) => ({
              ...current,
              status: "idle",
              // The details ("Seite 1 …") are for /api/health, not for students.
              connectionError: SCHOOL_DOWN_MESSAGE,
              schoolDown: true,
            }));
          }
        } catch {
          setState((current) => ({
            ...current,
            status: "idle",
            connectionError: OFFLINE_MESSAGE,
            schoolDown: false,
          }));
        } finally {
          lastAttemptRef.current = Date.now();
          inFlightRef.current = null;
          inFlightForcedRef.current = false;
        }
      };

      inFlightForcedRef.current = force;
      inFlightRef.current = run();
      return inFlightRef.current;
    };

    return start(force);
  }, []);

  useEffect(() => {
    const refreshIfDue = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastAttemptRef.current >= MIN_AUTO_REFRESH_GAP_MS
      ) {
        void refresh();
      }
    };

    // The page may come from the service worker cache or a restored tab,
    // so only trust server-rendered data if it is really fresh.
    const initialAge = initialData?.lastUpdated
      ? Date.now() - new Date(initialData.lastUpdated).getTime()
      : Number.POSITIVE_INFINITY;
    // Opened from a notification ("?day="): the change it announced may be
    // newer than any cached copy, so ask the school website itself.
    const fromNotification = new URLSearchParams(window.location.search).has("day");
    if (fromNotification || initialAge > INITIAL_DATA_MAX_AGE_MS) {
      void refresh(fromNotification);
    } else {
      lastAttemptRef.current = Date.now();
    }

    // Home-screen apps are frozen in the background and resumed later without
    // a reload: refresh whenever the app becomes visible again.
    document.addEventListener("visibilitychange", refreshIfDue);
    window.addEventListener("focus", refreshIfDue);
    window.addEventListener("online", refreshIfDue);
    window.addEventListener("pageshow", refreshIfDue);
    const intervalId = window.setInterval(refreshIfDue, AUTO_REFRESH_MS);

    return () => {
      document.removeEventListener("visibilitychange", refreshIfDue);
      window.removeEventListener("focus", refreshIfDue);
      window.removeEventListener("online", refreshIfDue);
      window.removeEventListener("pageshow", refreshIfDue);
      window.clearInterval(intervalId);
    };
  }, [initialData, refresh]);

  return { ...state, refresh };
}
