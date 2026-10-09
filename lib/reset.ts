const STORAGE_PREFIX = "kag:";

/**
 * Forgets everything this device stored (class, teachers, settings, offline
 * copy) and switches notifications off, then reloads the app.
 */
export async function resetDevice() {
  try {
    const registration = await Promise.race([
      navigator.serviceWorker?.ready,
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 3_000)),
    ]);
    const subscription = await registration?.pushManager?.getSubscription();
    if (subscription) {
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      }).catch(() => undefined);
      await subscription.unsubscribe().catch(() => undefined);
    }
  } catch {
    // Without a service worker there are no notifications to switch off.
  }

  for (const storage of ["localStorage", "sessionStorage"] as const) {
    try {
      Object.keys(window[storage])
        .filter((key) => key.startsWith(STORAGE_PREFIX))
        .forEach((key) => window[storage].removeItem(key));
    } catch {
      // Storage unavailable: nothing was stored.
    }
  }
  window.location.replace("/");
}
