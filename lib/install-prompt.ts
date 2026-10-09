import { useSyncExternalStore } from "react";

/** Chrome/Android's install prompt (not in the TypeScript DOM types). */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

// Kept from the moment this module loads: the browser offers the prompt once,
// usually shortly after the page has loaded.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether the browser can install the app with one tap (Chrome, Edge, Android). */
export function useCanPromptInstall() {
  return useSyncExternalStore(
    subscribe,
    () => deferred !== null,
    () => false,
  );
}

/** Shows the browser's install dialog; true if the app was installed. */
export async function promptInstall() {
  const event = deferred;
  if (!event) {
    return false;
  }
  deferred = null;
  notify();
  await event.prompt();
  return (await event.userChoice).outcome === "accepted";
}
