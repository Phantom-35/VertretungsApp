import { useCallback, useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY, type ThemePreference } from "@/lib/theme";

const listeners = new Set<() => void>();
// Fallback when localStorage is unavailable (e.g. private mode).
let memoryValue: ThemePreference = "system";

function parsePreference(value: string | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

function getPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === null ? memoryValue : parsePreference(stored);
  } catch {
    return memoryValue;
  }
}

/** The theme actually shown, as set on <html> by the theme script. */
function getResolved(): "light" | "dark" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function subscribe(listener: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  // Re-apply first, so that the snapshot never reads a stale data-theme.
  const onChange = () => {
    window.__kagApplyTheme?.();
    listener();
  };
  listeners.add(listener);
  window.addEventListener("storage", onChange);
  media.addEventListener("change", onChange);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onChange);
    media.removeEventListener("change", onChange);
  };
}

/** The user's theme choice and the theme currently shown. */
export function useTheme() {
  const preference = useSyncExternalStore(subscribe, getPreference, () => "system" as const);
  const resolved = useSyncExternalStore(subscribe, getResolved, () => "light" as const);

  const setPreference = useCallback((value: ThemePreference) => {
    memoryValue = value;
    window.__kagThemePreference = value;
    try {
      if (value === "system") {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        window.localStorage.setItem(THEME_STORAGE_KEY, value);
      }
    } catch {
      // Keep the in-memory value; the page still switches below.
    }
    window.__kagApplyTheme?.();
    listeners.forEach((listener) => listener());
  }, []);

  return { preference, resolved, setPreference };
}
