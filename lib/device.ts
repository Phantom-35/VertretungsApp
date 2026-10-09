/** iPhone or iPad (iPadOS reports itself as a Mac with touch). */
export function isIos() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Opened as an installed app from the home screen, not in the browser. */
export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export type BrowserPlatform = "ios" | "android" | "desktop";
export type BrowserName =
  | "safari"
  | "chrome"
  | "firefox"
  | "edge"
  | "samsung"
  | "opera"
  | "brave"
  | "duckduckgo"
  | "in-app"
  | "other";
export type BrowserInfo = { platform: BrowserPlatform; browser: BrowserName };

/**
 * Which browser the page is open in, to show the matching way to install
 * it. In-app browsers (Instagram, TikTok, …) cannot install pages at all.
 */
export function describeBrowser(
  userAgent: string,
  { touchMac = false }: { touchMac?: boolean } = {},
): BrowserInfo {
  const ua = userAgent;
  const platform: BrowserPlatform =
    /iPad|iPhone|iPod/.test(ua) || touchMac ? "ios" : /Android/.test(ua) ? "android" : "desktop";

  if (/FBAN|FBAV|Instagram|Snapchat|musical_ly|BytedanceWebview|TikTok|Line\/|GSA\/|; wv\)/.test(ua)) {
    return { platform, browser: "in-app" };
  }
  if (platform === "ios") {
    const browser: BrowserName = /CriOS/.test(ua)
      ? "chrome"
      : /FxiOS/.test(ua)
        ? "firefox"
        : /EdgiOS/.test(ua)
          ? "edge"
          : /OPiOS|OPT\//.test(ua)
            ? "opera"
            : /Ddg\/|DuckDuckGo/.test(ua)
              ? "duckduckgo"
              : /Safari/.test(ua)
              ? "safari"
              : "other";
    return { platform, browser };
  }
  const browser: BrowserName = /SamsungBrowser/.test(ua)
    ? "samsung"
    : /Edg(A|e)?\//.test(ua)
      ? "edge"
      : /OPR\/|Opera/.test(ua)
        ? "opera"
        : /Firefox\//.test(ua)
          ? "firefox"
          : /Chrome\/|Chromium\//.test(ua)
            ? "chrome"
            : /Safari\//.test(ua)
              ? "safari"
              : "other";
  return { platform, browser };
}

/** The browser this page runs in. */
export function currentBrowser(): BrowserInfo {
  const info = describeBrowser(navigator.userAgent, {
    touchMac: navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1,
  });
  // Brave uses the same user agent as Safari or Chrome, but tells itself apart.
  const brave = (navigator as Navigator & { brave?: unknown }).brave !== undefined;
  return brave && info.browser !== "in-app" ? { ...info, browser: "brave" } : info;
}

/** Names for the browsers, as people know them. */
export const BROWSER_NAMES: Record<BrowserName, string> = {
  safari: "Safari",
  chrome: "Chrome",
  firefox: "Firefox",
  edge: "Edge",
  samsung: "Samsung Internet",
  opera: "Opera",
  brave: "Brave",
  duckduckgo: "DuckDuckGo",
  "in-app": "App-Browser (z. B. Instagram)",
  other: "Anderer Browser",
};

/** The browsers to choose from on each platform, when the guess is wrong. */
export const BROWSERS_BY_PLATFORM: Record<BrowserPlatform, BrowserName[]> = {
  ios: ["safari", "chrome", "firefox", "edge", "brave", "duckduckgo", "opera", "in-app", "other"],
  android: ["chrome", "samsung", "firefox", "edge", "brave", "opera", "in-app", "other"],
  desktop: ["chrome", "edge", "safari", "firefox", "brave", "opera", "other"],
};
