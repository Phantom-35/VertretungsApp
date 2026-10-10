import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * For containers that ship their own Chromium and cannot download the one
 * Playwright expects (e.g. cloud sessions): `npm run test:e2e:container`.
 * CHROMIUM_PATH overrides the browser; otherwise the first one found is used.
 */
const candidates = [
  process.env.CHROMIUM_PATH,
  "/opt/pw-browsers/chromium",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter((path): path is string => Boolean(path));
const executablePath = candidates.find((path) => existsSync(path));

export default defineConfig({
  ...base,
  use: {
    ...base.use,
    // The full browser's own channel is not installed here.
    channel: undefined,
    launchOptions: executablePath ? { executablePath } : {},
  },
});
