/**
 * A readable description of the device from its user agent, for messages
 * on the "Hilfe & Kontakt" page: "iPhone · iOS 18.0", "Safari 18.0".
 */

export type DeviceInfo = { device: string; browser: string };

/** "18_0_1" or "18.0.1" -> "18.0.1" */
const version = (value: string | undefined) => (value ? value.replace(/_/g, ".") : "");

function describeSystem(userAgent: string, touch: boolean) {
  const ios = userAgent.match(/(iPhone|iPad|iPod)[^)]*OS (\d+[_.]\d+(?:[_.]\d+)?)/);
  if (ios) {
    return `${ios[1]} · iOS ${version(ios[2])}`;
  }
  // iPads ask for the desktop page and look like a Mac, except for touch.
  const mac = userAgent.match(/Mac OS X (\d+[_.]\d+(?:[_.]\d+)?)/);
  if (mac && touch) {
    return "iPad · iPadOS";
  }
  const android = userAgent.match(/Android (\d+(?:\.\d+)?)(?:;\s*([^;)]+))?/);
  if (android) {
    // Chrome only says "K" instead of the model nowadays.
    const model = android[2] && android[2].trim() !== "K" && !/^wv$/.test(android[2].trim()) ? ` (${android[2].trim()})` : "";
    return `Android ${android[1]}${model}`;
  }
  if (/Windows NT 10/.test(userAgent)) {
    return "PC · Windows 10/11";
  }
  if (/Windows/.test(userAgent)) {
    return "PC · Windows";
  }
  if (/CrOS/.test(userAgent)) {
    return "Chromebook";
  }
  if (mac) {
    return "Mac · macOS";
  }
  if (/Linux/.test(userAgent)) {
    return "PC · Linux";
  }
  return "Unbekannt";
}

function describeBrowser(userAgent: string) {
  const checks: [RegExp, string][] = [
    [/EdgA?\/(\d+)/, "Edge"],
    [/SamsungBrowser\/(\d+(?:\.\d+)?)/, "Samsung Internet"],
    [/OPR\/(\d+)/, "Opera"],
    [/FxiOS\/(\d+)/, "Firefox"],
    [/Firefox\/(\d+)/, "Firefox"],
    [/CriOS\/(\d+)/, "Chrome"],
    [/Chrome\/(\d+)/, "Chrome"],
  ];
  for (const [pattern, name] of checks) {
    const match = userAgent.match(pattern);
    if (match) {
      return `${name} ${match[1]}`;
    }
  }
  const safari = userAgent.match(/Version\/(\d+(?:\.\d+)?).*Safari/);
  if (safari) {
    return `Safari ${safari[1]}`;
  }
  // Installed web apps on iOS leave "Safari" out.
  if (/AppleWebKit/.test(userAgent)) {
    return "Safari";
  }
  return "Unbekannt";
}

export function describeDevice(userAgent: string, touch = false): DeviceInfo {
  return { device: describeSystem(userAgent, touch), browser: describeBrowser(userAgent) };
}
