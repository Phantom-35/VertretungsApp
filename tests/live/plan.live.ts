import { appendFileSync } from "node:fs";
import { expect, it } from "vitest";
import { fetchSubstitutionData } from "@/lib/scraper";

/**
 * Reads the school's real plan and fails if the self-check finds anything.
 * Runs every school morning in GitHub Actions (.github/workflows/live-check.yml),
 * so that a changed Untis format is noticed even when nobody uses the app.
 */
it("reads the live plan completely", async () => {
  const data = await fetchSubstitutionData();

  const summary = [
    `Erfolg: ${data.success ? "ja" : "nein"}`,
    `Stand Schule: ${data.sourceUpdatedAt ?? "unbekannt"}`,
    `Tage: ${data.days.map((day) => day.date).join(", ") || "keine"}`,
    `Seiten: ${data.fetchedPages}, Einträge: ${data.entries.length}`,
    ...data.diagnostics.map((item) => `Selbstkontrolle: ${item}`),
    ...data.warnings.map((item) => `Hinweis: ${item}`),
    data.error ? `Fehler: ${data.error}` : null,
  ].filter(Boolean);
  console.log(summary.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Vertretungsplan live\n\n${summary.map((line) => `- ${line}`).join("\n")}\n`,
    );
  }

  expect(data.success, data.error ?? "").toBe(true);
  expect(data.error).toBeNull();
}, 120_000);
