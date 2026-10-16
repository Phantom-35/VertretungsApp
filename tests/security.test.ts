import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "@/lib/csp";
import { OLD_DEVICE_DISMISSED_KEY, OLD_DEVICE_SCRIPT } from "@/lib/legacy";
import { config } from "@/proxy";
import { SCHOOL_PLAN_URL } from "@/lib/school";

describe("content security policy", () => {
  it("lets only scripts with the nonce run, and the service worker register", () => {
    const policy = contentSecurityPolicy("abc123");
    // 'unsafe-inline' only counts in very old browsers without nonces.
    expect(policy).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic' 'unsafe-inline'");
    expect(policy).toContain("worker-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain("unsafe-eval");
    // React needs eval while developing only.
    expect(contentSecurityPolicy("abc123", true)).toContain("'unsafe-eval'");
  });
});

describe("pages with the policy", () => {
  it("are all pages, but not data, icons or build files", () => {
    const pattern = new RegExp(`^${config.matcher[0].source}$`);
    for (const page of ["/", "/teilen", "/icons-info", "/apps", "/manifesto"]) {
      expect(pattern.test(page), page).toBe(true);
    }
    for (const file of ["/api/substitution", "/_next/static/a.js", "/_vercel/insights/view", "/icon/192", "/apple-icon", "/manifest.webmanifest", "/sw.js", "/favicon.ico"]) {
      expect(pattern.test(file), file).toBe(false);
    }
  });
});

describe("hint for too old devices", () => {
  it("is written for old browsers, which could not even read modern syntax", () => {
    for (const modern of ["=>", "`", "let ", "const ", "?.", "??", "...", "class "]) {
      expect(OLD_DEVICE_SCRIPT, modern).not.toContain(modern);
    }
    expect(() => new Function(OLD_DEVICE_SCRIPT)).not.toThrow();
  });

  it("links the school's own plan, and remembers when it was closed", () => {
    expect(OLD_DEVICE_SCRIPT).toContain(`href="${SCHOOL_PLAN_URL}"`);
    expect(OLD_DEVICE_DISMISSED_KEY.startsWith("kag:")).toBe(true);
    expect(OLD_DEVICE_SCRIPT.match(new RegExp(OLD_DEVICE_DISMISSED_KEY, "g"))).toHaveLength(2);
  });
});
