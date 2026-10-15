import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => JSON.parse(readFileSync(join(__dirname, "..", file), "utf8"));

describe("app version", () => {
  it("is a version like 1.5.1, the same in package.json and package-lock.json", () => {
    const { version } = read("package.json") as { version: string };
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    // Set with `npm version`, which changes both (see AGENTS.md).
    expect(read("package-lock.json").version).toBe(version);
    expect(version.split(".").map(Number)[0]).toBeGreaterThanOrEqual(1);
  });
});
