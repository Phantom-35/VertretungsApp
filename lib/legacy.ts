import { SCHOOL_PLAN_URL } from "@/lib/school";

/**
 * Next.js 16 (and with it this app) needs Safari 16.4 or a current Chrome,
 * Firefox or Edge. On older devices (e.g. an iPhone 7 with iOS 15) the app
 * would load without working, ending up with a misleading "no connection".
 * This script, written for old browsers (no arrow functions, no modern
 * syntax), recognises them by features they lack (lookbehind in regular
 * expressions: Safari 16.4; AbortSignal.timeout, used to load the plan) and
 * says so plainly, with a link to the school's own plan. "Trotzdem
 * versuchen" closes it for good on this device (kag:old-device-dismissed),
 * in case a browser is wrongly recognised.
 */
export const OLD_DEVICE_DISMISSED_KEY = "kag:old-device-dismissed";

export const OLD_DEVICE_SCRIPT = `(function(){
try{new RegExp("(?<=a)b");if(typeof AbortSignal!=="undefined"&&AbortSignal.timeout)return}catch(e){}
try{if(localStorage.getItem("${OLD_DEVICE_DISMISSED_KEY}"))return}catch(e){}
function show(){
if(document.getElementById("kag-old-device"))return;
var d=document.createElement("div");
d.id="kag-old-device";d.setAttribute("role","alertdialog");d.setAttribute("aria-labelledby","kag-old-device-title");
d.style.cssText="position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483647;overflow:auto;padding:24px;background:var(--background,#f5efe2);color:var(--foreground,#172126);font-family:var(--font-sans,sans-serif)";
d.innerHTML='<div style="max-width:28rem;margin:10vh auto 0">'
+'<p style="margin:0;font-size:.72rem;font-weight:600;letter-spacing:.28em;text-transform:uppercase;color:var(--accent-strong,#0f4b49)">KAG Vertretungsplan</p>'
+'<h1 id="kag-old-device-title" style="margin:16px 0 8px;font-size:1.6rem;line-height:1.2">Dein Gerät ist zu alt für die App</h1>'
+'<p style="margin:0;line-height:1.6;color:var(--muted,#56646a)">Die App braucht ein iPhone oder iPad mit iOS 16.4 oder neuer bzw. einen aktuellen Browser (Chrome, Firefox, Edge oder Safari). Den Vertretungsplan kannst du trotzdem direkt auf der Seite der Schule ansehen.</p>'
+'<a href="${SCHOOL_PLAN_URL}" style="display:block;margin-top:24px;padding:12px 16px;border-radius:999px;background:var(--accent,#1f6b67);color:#fff;text-align:center;font-weight:600;text-decoration:none">Plan der Schule öffnen</a>'
+'<button type="button" style="display:block;margin:12px auto 0;padding:8px;background:none;border:0;color:var(--muted,#56646a);text-decoration:underline;font:inherit;cursor:pointer">Trotzdem versuchen</button>'
+'</div>';
d.getElementsByTagName("button")[0].onclick=function(){try{localStorage.setItem("${OLD_DEVICE_DISMISSED_KEY}","1")}catch(e){}d.parentNode.removeChild(d)};
// At the end of <body>: React 19 skips such foreign elements when it takes over the page.
document.body.appendChild(d);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",show);else show();
})()`;
