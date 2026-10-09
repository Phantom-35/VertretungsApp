import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Only the check against the school's real website (`npm run check:live`). */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["tests/live/**/*.live.ts"],
    // Show the summary of the live plan also when the check passes.
    silent: false,
    reporters: ["verbose"],
  },
});
