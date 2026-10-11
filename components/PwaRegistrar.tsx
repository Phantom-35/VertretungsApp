"use client";

import { useEffect } from "react";

/** Right after opening, a new version is shown at once (a quick reload). */
const RELOAD_WINDOW_MS = 8_000;
/** Never more often than this, whatever the service worker reports. */
const MIN_RELOAD_GAP_MS = 60_000;
const LAST_RELOAD_KEY = "kag:update-reload";

/** The deploy this page belongs to (from the page itself, see app/layout.tsx). */
function shownBuild() {
  return document.querySelector('meta[name="kag-build"]')?.getAttribute("content") ?? "";
}

/** Asks the service worker whether a newer version is cached (or online). */
function checkForNewVersion(fetchLatest: boolean) {
  navigator.serviceWorker.controller?.postMessage({
    type: "check-update",
    build: shownBuild(),
    fetch: fetchLatest,
  });
}

function reloadForUpdate() {
  try {
    const last = Number(sessionStorage.getItem(LAST_RELOAD_KEY)) || 0;
    if (Date.now() - last < MIN_RELOAD_GAP_MS) {
      return;
    }
    sessionStorage.setItem(LAST_RELOAD_KEY, String(Date.now()));
  } catch {
    // Without storage no guard against loops: better not reload.
    return;
  }
  window.location.reload();
}

export function PwaRegistrar() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    let registration: ServiceWorkerRegistration | undefined;
    const openedAt = Date.now();
    let touched = false;
    let updatePending = false;

    const onInteraction = () => {
      touched = true;
    };

    // The app opens at once with the cached version; the service worker
    // fetches the newest one in the background and reports a new deploy.
    // Shown at once when the app was only just opened (nothing to lose),
    // otherwise when the user leaves it, so nothing is interrupted.
    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string } | null)?.type !== "app-updated") {
        return;
      }
      if (!touched && Date.now() - openedAt < RELOAD_WINDOW_MS && document.visibilityState === "visible") {
        reloadForUpdate();
      } else {
        updatePending = true;
      }
    };

    // Installed apps can stay open for days: look for a new version whenever
    // the app comes back to the foreground.
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (updatePending) {
          // Out of sight: the next look already shows the new version.
          reloadForUpdate();
        }
        return;
      }
      registration?.update().catch(() => undefined);
      checkForNewVersion(true);
    };

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((result) => {
        registration = result;
      })
      .catch(() => {
        // Registration failure should never break the app shell.
      });

    navigator.serviceWorker.addEventListener("message", onMessage);
    // The update of this start may have finished before this listened.
    checkForNewVersion(false);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pointerdown", onInteraction, { once: true });
    window.addEventListener("keydown", onInteraction, { once: true });
    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pointerdown", onInteraction);
      window.removeEventListener("keydown", onInteraction);
    };
  }, []);

  return null;
}
