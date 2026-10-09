import { defineConfig } from "@playwright/test";

const APP_PORT = 3124;
const FIXTURE_PORT = 3199;

/**
 * Browser tests against the production build (`npm run build` first) with the
 * saved Untis pages instead of the school website.
 */
export default defineConfig({
  testDir: "e2e",
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    browserName: "chromium",
    viewport: { width: 390, height: 844 },
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node e2e/fixture-server.mjs",
      url: `http://127.0.0.1:${FIXTURE_PORT}/subst_001.htm`,
      env: { FIXTURE_PORT: String(FIXTURE_PORT) },
      reuseExistingServer: false,
    },
    {
      command: `npx next start -p ${APP_PORT}`,
      url: `http://localhost:${APP_PORT}/manifest.webmanifest`,
      env: { SUBSTITUTION_BASE_URL: `http://127.0.0.1:${FIXTURE_PORT}/subst_` },
      reuseExistingServer: false,
    },
  ],
});
