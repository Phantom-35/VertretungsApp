/**
 * What the address asks the app for when it opens: a day ("?day=…", from a
 * notification), a class ("?klasse=7B", from a shared plan) and the code in
 * the settings ("?einstellungen=teilen", back from the notice to print). Read once per opening and then removed from the
 * address, so that a later reload (e.g. for a new version) does not ask again.
 */
type AddressRequest = { day: string | null; schoolClass: string | null; settings: string | null };

const KEYS = ["day", "klasse", "einstellungen"] as const;

let taken: AddressRequest | null = null;

/** "?day=2026-10-09" in a URL, e.g. one opened from a notification. */
export function dayFromUrl(url: string) {
  const day = new URL(url, "http://localhost").searchParams.get("day");
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

const NONE: AddressRequest = { day: null, schoolClass: null, settings: null };

/**
 * The request of this opening: read anew whenever the address carries one
 * (also when the app is reached again from another page), otherwise the one
 * taken before. The same object while nothing changes, as React expects of
 * a snapshot.
 */
export function addressRequest(): AddressRequest {
  const params = new URLSearchParams(window.location.search);
  if (KEYS.some((key) => params.has(key))) {
    const day = dayFromUrl(window.location.href);
    const schoolClass = params.get("klasse");
    const settings = params.get("einstellungen");
    if (!taken || taken.day !== day || taken.schoolClass !== schoolClass || taken.settings !== settings) {
      taken = { day, schoolClass, settings };
    }
  }
  return taken ?? NONE;
}

/** Takes the request out of the address (it stays readable via addressRequest). */
export function clearAddressRequest() {
  const url = new URL(window.location.href);
  if (!KEYS.some((key) => url.searchParams.has(key))) {
    return;
  }
  KEYS.forEach((key) => url.searchParams.delete(key));
  window.history.replaceState(window.history.state, "", url);
}

