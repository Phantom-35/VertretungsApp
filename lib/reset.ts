const STORAGE_PREFIX = "kag:";

/**
 * Forgets everything this device stored (class, teachers, settings, offline
 * copy) and switches notifications off, then reloads the app.
 */
export async function resetDevice() {
  try {
    // The registration itself, without waiting for the worker to be ready:
    // the subscription is there either way.
    const registration = await navigator.serviceWorker?.getRegistration();
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

  // The service worker's copies of the app and the number on its icon too:
  // nothing of this device's use is left behind.
  try {
    const names = (await window.caches?.keys()) ?? [];
    await Promise.all(names.filter((name) => name.startsWith("kag-")).map((name) => window.caches.delete(name)));
    await navigator.clearAppBadge?.().catch(() => undefined);
  } catch {
    // No caches (or not allowed): nothing to delete.
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
