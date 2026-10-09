import { defineConfig } from "@playwright/test";
import webpush from "web-push";
import { APP_PORT, CRON_SECRET, FIXTURE_PORT, PUSH_TEST_NOW } from "./e2e/constants";

// Fresh keys per run; the app hands out the public one via /api/push/config.
const VAPID = webpush.generateVAPIDKeys();

/**
 * Browser tests against the production build (`npm run build` first) with the
 * saved Untis pages instead of the school website.
 */
export default defineConfig({
  testDir: "e2e",
  // The push tests change the plan served by the fixture server.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    browserName: "chromium",
    // Full Chromium (new headless mode): the default headless shell has no
    // notifications, which the push tests need.
    channel: "chromium",
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
      env: {
        SUBSTITUTION_BASE_URL: `http://127.0.0.1:${FIXTURE_PORT}/subst_`,
        // Notifications with an in-memory store and a fake push service.
        PUSH_STORE: "memory",
        PUSH_ALLOW_ANY_ENDPOINT: "1",
        PUSH_TEST_NOW,
        VAPID_PUBLIC_KEY: VAPID.publicKey,
        VAPID_PRIVATE_KEY: VAPID.privateKey,
        VAPID_SUBJECT: "https://kag.example",
        CRON_SECRET,
        // The fake push service uses a self-signed certificate.
        NODE_TLS_REJECT_UNAUTHORIZED: "0",
      },
      reuseExistingServer: false,
    },
  ],
});
