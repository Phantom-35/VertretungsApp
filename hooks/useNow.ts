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
