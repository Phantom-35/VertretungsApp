"use client";

import { useEffect } from "react";

export function PwaRegistrar() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    let registration: ServiceWorkerRegistration | undefined;

    // Installed apps can stay open for days: look for a new version whenever
    // the app comes back to the foreground.
    const checkForUpdate = () => {
      if (document.visibilityState === "visible") {
        registration?.update().catch(() => undefined);
      }
    };

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((result) => {
        registration = result;
      })
      .catch(() => {
        // Registration failure should never break the app shell.
      });

    document.addEventListener("visibilitychange", checkForUpdate);
    return () => document.removeEventListener("visibilitychange", checkForUpdate);
  }, []);

  return null;
}
