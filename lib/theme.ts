export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "kag:theme";
/** Settings (hooks/useSettings.ts); the script below reads the text size. */
export const SETTINGS_STORAGE_KEY = "kag:settings";

/** Browser bar colours, matching `--background` in globals.css. */
export const THEME_COLORS = { light: "#f5efe2", dark: "#12191b" } as const;

/**
 * Runs in <head> before the first paint: resolves the saved preference (or the
 * system setting) to `data-theme="light|dark"` on <html>, so that there is no
 * flash of the wrong theme (and sets the chosen text size). Also follows system changes while "system" is
 * chosen, and exposes `window.__kagApplyTheme` for the theme switch.
 *
 * If anything resets the attribute later (e.g. React rebuilding the page
 * after a hydration mismatch on a cold start of the iPhone app), the observer
 * puts the chosen theme back before the next paint.
 */
export const THEME_SCRIPT = `(function(){
var d=document.documentElement,m=window.matchMedia("(prefers-color-scheme: dark)");
function apply(){
var p=window.__kagThemePreference;if(!p){try{p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})}catch(e){}}
var t=p==="light"||p==="dark"?p:(m.matches?"dark":"light");
if(d.getAttribute("data-theme")!==t)d.setAttribute("data-theme",t);
if(d.style.colorScheme!==t)d.style.colorScheme=t;
var c=t==="dark"?${JSON.stringify(THEME_COLORS.dark)}:${JSON.stringify(THEME_COLORS.light)};
var ms=document.querySelectorAll('meta[name="theme-color"]');
for(var i=0;i<ms.length;i++)ms[i].setAttribute("content",c);
var f=window.__kagFontSize;if(f===undefined){try{f=JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_STORAGE_KEY)})||"{}").textSize==="large"?"112.5%":""}catch(e){}}
if(f!==undefined&&d.style.fontSize!==f)d.style.fontSize=f;
}
apply();
window.__kagApplyTheme=apply;
if(window.MutationObserver)new MutationObserver(apply).observe(d,{attributes:true,attributeFilter:["data-theme","style"]});
if(m.addEventListener)m.addEventListener("change",apply);
document.addEventListener("DOMContentLoaded",apply);
})()`;

declare global {
  interface Window {
    __kagApplyTheme?: () => void;
    /** Choices made in this session; win over storage, which can fail. */
    __kagThemePreference?: ThemePreference;
    __kagFontSize?: string;
  }
}
