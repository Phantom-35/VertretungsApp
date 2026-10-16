"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { LAST_RELOAD_KEY } from "@/components/PwaRegistrar";
import { isStandalone } from "@/lib/device";

/** The reload for a new version follows at once (see PwaRegistrar). */
const UPDATE_RELOAD_MS = 30_000;
let firstView = true;

/**
 * The quick reload for a new version is the same visit, not another page
 * view (it would count twice after every update). Only the first view of
 * the page can be it; nothing new is stored for this.
 */
function isUpdateReload() {
  if (!firstView) {
    return false;
  }
  firstView = false;
  try {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const last = Number(sessionStorage.getItem(LAST_RELOAD_KEY)) || 0;
    return navigation?.type === "reload" && Date.now() - last < UPDATE_RELOAD_MS;
  } catch {
    return false;
  }
}

/**
 * Pages are counted as "/app" (opened from the home screen) or "/browser",
 * without "?day=…": the dashboard then shows how many use the installed app.
 */
export function countAs(event: BeforeSendEvent): BeforeSendEvent | null {
  if (isUpdateReload()) {
    return null;
  }
  const url = new URL(event.url);
  url.search = "";
  if (url.pathname === "/") {
    url.pathname = isStandalone() ? "/app" : "/browser";
  }
  return { ...event, url: url.href };
}

/**
 * Anonymous page views (Vercel Web Analytics): no cookies, nothing stored on
 * the device, visitors are not recognised across days.
 */
export function UsageStats() {
  return <Analytics beforeSend={countAs} />;
}
