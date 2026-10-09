import { useCallback, useEffect, useRef, useState } from "react";

export type PushStatus =
  /** Still finding out. */
  | "checking"
  /** Server has no notifications set up: the feature stays hidden. */
  | "unavailable"
  /** This browser cannot receive web push. */
  | "unsupported"
  /** iPhone/iPad: only works from the home-screen app. */
  | "install"
  | "denied"
  | "off"
  | "on";

const SERVICE_WORKER_TIMEOUT_MS = 8_000;

function isIos() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function supportsPush() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** The app's service worker; it is registered only in production builds. */
async function serviceWorker() {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Service Worker nicht bereit")), SERVICE_WORKER_TIMEOUT_MS),
    ),
  ]);
}

function urlBase64ToBytes(value: string) {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

async function post(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string; result?: string };
  return { status: response.status, ok: response.ok, data };
}

type Audience = { schoolClass: string | null; teachers: readonly string[] };

/**
 * Web push for the selected class (and courses). Keeps the server's copy of
 * class and teachers in sync while notifications are on.
 */
export function usePushNotifications({ schoolClass, teachers }: Audience) {
  const [status, setStatus] = useState<PushStatus>("checking");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Looked up in advance: on iOS the subscription must start right on the tap.
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  // Updates are sent one after another, so the last class chosen wins.
  const syncChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const teachersKey = teachers.join(",");

  useEffect(() => {
    let cancelled = false;
    const update = (value: PushStatus) => {
      if (!cancelled) {
        setStatus(value);
      }
    };

    (async () => {
      const config = (await fetch("/api/push/config")
        .then((response) => response.json())
        .catch(() => ({ enabled: false }))) as { enabled: boolean; publicKey?: string };
      if (!config.enabled || !config.publicKey) {
        return update("unavailable");
      }
      if (!cancelled) {
        setPublicKey(config.publicKey);
      }
      if (isIos() && !isStandalone()) {
        return update("install");
      }
      if (!supportsPush()) {
        return update("unsupported");
      }
      if (Notification.permission === "denied") {
        return update("denied");
      }
      try {
        const registration = await serviceWorker();
        registrationRef.current = registration;
        const subscription = await registration.pushManager.getSubscription();
        update(subscription && Notification.permission === "granted" ? "on" : "off");
      } catch {
        update("unsupported");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // While on: tell the server about the current class and teachers (also
  // re-registers the device if the server lost it).
  useEffect(() => {
    if (status !== "on" || !schoolClass) {
      return;
    }
    let cancelled = false;
    const sync = async () => {
      const subscription = await (await serviceWorker()).pushManager.getSubscription();
      if (!subscription || cancelled) {
        return;
      }
      const result = await post("/api/push/subscribe", {
        subscription: subscription.toJSON(),
        schoolClass,
        teachers: teachersKey ? teachersKey.split(",") : [],
      });
      if (result.status === 410 && !cancelled) {
        await subscription.unsubscribe().catch(() => undefined);
        setStatus("off");
        setMessage("Die Anmeldung war abgelaufen. Bitte Benachrichtigungen neu einschalten.");
      }
    };
    syncChainRef.current = syncChainRef.current.then(sync).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [status, schoolClass, teachersKey]);

  const enable = useCallback(async () => {
    const registration = registrationRef.current;
    if (!publicKey || !schoolClass || !registration) {
      return;
    }
    setBusy(true);
    setMessage(null);
    let subscription: PushSubscription;
    try {
      // First thing after the tap: Safari asks for permission only in direct
      // response to it. subscribe() shows the permission prompt itself and
      // returns the existing subscription if there is one.
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBytes(publicKey),
      });
    } catch {
      setBusy(false);
      if (Notification.permission === "denied") {
        setStatus("denied");
      } else {
        setMessage("Benachrichtigungen wurden nicht erlaubt.");
      }
      return;
    }
    try {
      const result = await post("/api/push/subscribe", {
        subscription: subscription.toJSON(),
        schoolClass,
        teachers,
      });
      if (!result.ok) {
        await subscription.unsubscribe().catch(() => undefined);
        setMessage(result.data.error ?? "Einschalten hat nicht geklappt. Bitte später erneut versuchen.");
        return;
      }
      setStatus("on");
      setMessage("Eingeschaltet. Eine Bestätigung ist unterwegs.");
    } catch {
      setMessage("Einschalten hat nicht geklappt. Bitte später erneut versuchen.");
    } finally {
      setBusy(false);
    }
  }, [publicKey, schoolClass, teachers]);

  const disable = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const subscription = await (await serviceWorker()).pushManager.getSubscription();
      if (subscription) {
        await post("/api/push/unsubscribe", { endpoint: subscription.endpoint }).catch(() => undefined);
        await subscription.unsubscribe();
      }
      setStatus("off");
      setMessage("Ausgeschaltet.");
    } catch {
      setMessage("Ausschalten hat nicht geklappt.");
    } finally {
      setBusy(false);
    }
  }, []);

  const sendTest = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const subscription = await (await serviceWorker()).pushManager.getSubscription();
      if (!subscription) {
        setStatus("off");
        return;
      }
      const { data } = await post("/api/push/test", { endpoint: subscription.endpoint });
      setMessage(
        data.result === "sent"
          ? "Testnachricht gesendet."
          : data.result === "too-soon"
            ? "Bitte eine Minute bis zur nächsten Testnachricht warten."
            : "Testnachricht konnte nicht gesendet werden. Bitte Benachrichtigungen aus- und wieder einschalten.",
      );
    } catch {
      setMessage("Testnachricht konnte nicht gesendet werden.");
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, busy, message, enable, disable, sendTest };
}
