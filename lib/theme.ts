export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "kag:theme";

/** Browser bar colours, matching `--background` in globals.css. */
export const THEME_COLORS = { light: "#f5efe2", dark: "#12191b" } as const;

/**
 * Runs in <head> before the first paint: resolves the saved preference (or the
 * system setting) to `data-theme="light|dark"` on <html>, so that there is no
 * flash of the wrong theme. Also follows system changes while "system" is
 * chosen, and exposes `window.__kagApplyTheme` for the theme switch.
 */
export const THEME_SCRIPT = `(function(){
var d=document.documentElement,m=window.matchMedia("(prefers-color-scheme: dark)");
function apply(){
var p=null;try{p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})}catch(e){}
var t=p==="light"||p==="dark"?p:(m.matches?"dark":"light");
d.setAttribute("data-theme",t);d.style.colorScheme=t;
var c=t==="dark"?${JSON.stringify(THEME_COLORS.dark)}:${JSON.stringify(THEME_COLORS.light)};
var ms=document.querySelectorAll('meta[name="theme-color"]');
for(var i=0;i<ms.length;i++)ms[i].setAttribute("content",c);
}
apply();
window.__kagApplyTheme=apply;
if(m.addEventListener)m.addEventListener("change",apply);
document.addEventListener("DOMContentLoaded",apply);
})()`;

declare global {
  interface Window {
    __kagApplyTheme?: () => void;
  }
}
