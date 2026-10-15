import { useSyncExternalStore } from "react";

/**
 * Large screens (computer, tablet in landscape) get their own view. Same
 * query as the `wide:` variant in app/globals.css: the height keeps every
 * phone out, also in landscape.
 */
export const WIDE_SCREEN_QUERY = "(min-width: 1024px) and (min-height: 600px)";

function subscribe(listener: () => void) {
  const query = window.matchMedia(WIDE_SCREEN_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

const getSnapshot = () => window.matchMedia(WIDE_SCREEN_QUERY).matches;

/** Whether the large-screen view applies; false on the server and on phones. */
export function useWideScreen() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
