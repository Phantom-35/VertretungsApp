import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * For containers that ship their own Chromium and cannot download the one
 * Playwright expects (e.g. cloud sessions): `npm run test:e2e:container`.
 * The browser is CHROMIUM_PATH, or else the preinstalled Playwright build
 * in /opt/pw-browsers. Fails clearly instead of falling back to another
 * browser.
 */
const PREINSTALLED = "/opt/pw-browsers/chromium";

function findBrowser() {
  const chosen = process.env.CHROMIUM_PATH?.trim();
  if (chosen) {
    if (!existsSync(chosen)) {
      throw new Error(`CHROMIUM_PATH=${chosen} gibt es nicht.`);
    }
    return chosen;
  }
  if (!existsSync(PREINSTALLED)) {
    throw new Error(
      `Kein Chromium unter ${PREINSTALLED}. CHROMIUM_PATH setzen oder ` +
        "`npx playwright install chromium` und `npm run test:e2e` verwenden.",
    );
  }
  return PREINSTALLED;
}

/** Warns when the browser build differs from the one this Playwright expects. */
function warnOnOtherBuild(executablePath: string) {
  const built = realpathSync(executablePath).match(/chromium-(\d+)/)?.[1];
  try {
    const file = join(__dirname, "node_modules", "playwright-core", "browsers.json");
    const browsers = JSON.parse(readFileSync(file, "utf8")) as {
      browsers: { name: string; revision: string }[];
    };
    const expected = browsers.browsers.find((browser) => browser.name === "chromium")?.revision;
    // The config is loaded again in each worker: warn once.
    if (built && expected && built !== expected && !process.env.KAG_E2E_BUILD_WARNED) {
      process.env.KAG_E2E_BUILD_WARNED = "1";
      console.warn(
        `[e2e] Chromium-Build ${built} statt ${expected} (erwartet von dieser Playwright-Version). ` +
          "Bei Protokollfehlern den passenden Browser installieren.",
      );
    }
  } catch {
    // Unknown layout: no warning.
  }
}

const executablePath = findBrowser();
warnOnOtherBuild(executablePath);

export default defineConfig({
  ...base,
  use: {
    ...base.use,
    // The full browser's own channel is not installed here.
    channel: undefined,
    launchOptions: { executablePath },
  },
});
