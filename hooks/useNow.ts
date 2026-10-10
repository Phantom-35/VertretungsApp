import { useSyncExternalStore } from "react";

const TICK_MS = 30_000;

let now = 0;
let timerId: number | undefined;
const listeners = new Set<() => void>();

function tick() {
  now = Date.now();
  listeners.forEach((listener) => listener());
}

function onVisibilityChange() {
  if (document.visibilityState === "visible") {
    tick();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  if (listeners.size === 1) {
    now = Date.now();
    timerId = window.setInterval(tick, TICK_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0) {
      window.clearInterval(timerId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}

function getSnapshot() {
  return now || (now = Date.now());
}

function getServerSnapshot() {
  return null;
}

/**
 * The current time, updated every 30 seconds and whenever the app becomes
 * visible again. `null` during server rendering and hydration, so that
 * time-relative labels never cause hydration mismatches.
 */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

type Opened = {
  /** When the page was loaded. */
  first: number;
  /** When the app was last brought to the front (or loaded). */
  last: number;
};

let opened: Opened | null = null;
const openedListeners = new Set<() => void>();

function onOpenedVisibility() {
  if (document.visibilityState === "visible" && opened) {
    opened = { ...opened, last: Date.now() };
    openedListeners.forEach((listener) => listener());
  }
}

function subscribeOpened(listener: () => void) {
  openedListeners.add(listener);
  if (openedListeners.size === 1) {
    document.addEventListener("visibilitychange", onOpenedVisibility);
  }
  return () => {
    openedListeners.delete(listener);
    if (openedListeners.size === 0) {
      document.removeEventListener("visibilitychange", onOpenedVisibility);
    }
  };
}

function getOpenedSnapshot() {
  if (!opened) {
    const timestamp = Date.now();
    opened = { first: timestamp, last: timestamp };
  }
  return opened;
}

/**
 * When the app was loaded and when it was last brought to the front. Things
 * decided "on opening" (like the day shown by default) use `last`, so they do
 * not change under the user's finger while the app is open. `null` during
 * server rendering and hydration.
 */
export function useOpened(): Opened | null {
  return useSyncExternalStore(subscribeOpened, getOpenedSnapshot, getServerSnapshot);
}
