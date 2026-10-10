"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { isStandalone } from "@/lib/device";

/**
 * Pages are counted as "/app" (opened from the home screen) or "/browser",
 * without "?day=…": the dashboard then shows how many use the installed app.
 */
function countAs(event: BeforeSendEvent): BeforeSendEvent {
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
