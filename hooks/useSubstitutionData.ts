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

const OFFLINE_MESSAGE = "Keine Verbindung zum Server.";

export type LoadStatus = "idle" | "loading" | "refreshing";

type State = {
  data: SubstitutionPayload | null;
  /** Data restored from this device, not yet confirmed by the server. */
  fromDevice: boolean;
  status: LoadStatus;
  /** The app's own server could not be reached or had no data at all. */
  connectionError: string | null;
};

function readStoredPayload() {
  try {
    LEGACY_DATA_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
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
  });
  const inFlightRef = useRef<Promise<void> | null>(null);
  const lastAttemptRef = useRef(0);

  const refresh = useCallback((force = false) => {
    if (inFlightRef.current) {
      return inFlightRef.current;
    }

    const run = async () => {
      lastAttemptRef.current = Date.now();
      const stored = readStoredPayload();

      setState((current) => {
        if (current.data) {
          return { ...current, status: "refreshing" };
        }
        // Show the last copy from this device while loading.
        return stored
          ? { ...current, data: stored, fromDevice: true, status: "refreshing" }
          : { ...current, status: "loading" };
      });

      try {
        const payload = await fetchPayload(force);

        if (payload.success) {
          setState({
            data: payload,
            fromDevice: false,
            status: "idle",
            connectionError: null,
          });
          if (!payload.stale) {
            storePayload(payload);
          }
        } else {
          setState((current) => ({
            ...current,
            status: "idle",
            connectionError:
              payload.error ?? "Vertretungsplan momentan nicht erreichbar.",
          }));
        }
      } catch {
        setState((current) => ({
          ...current,
          status: "idle",
          connectionError: OFFLINE_MESSAGE,
        }));
      } finally {
        lastAttemptRef.current = Date.now();
        inFlightRef.current = null;
      }
    };

    inFlightRef.current = run();
    return inFlightRef.current;
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
    if (initialAge > INITIAL_DATA_MAX_AGE_MS) {
      void refresh();
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
