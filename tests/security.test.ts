import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "@/lib/csp";
import { OLD_DEVICE_SCRIPT } from "@/lib/legacy";
import { SCHOOL_PLAN_URL } from "@/lib/school";

describe("content security policy", () => {
  it("lets only scripts with the nonce run, and the service worker register", () => {
    const policy = contentSecurityPolicy("abc123");
    expect(policy).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(policy).toContain("worker-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain("unsafe-eval");
    // React needs eval while developing only.
    expect(contentSecurityPolicy("abc123", true)).toContain("'unsafe-eval'");
  });
});

describe("hint for too old devices", () => {
  it("is written for old browsers, which could not even read modern syntax", () => {
    for (const modern of ["=>", "`", "let ", "const ", "?.", "??", "...", "class "]) {
      expect(OLD_DEVICE_SCRIPT, modern).not.toContain(modern);
    }
    expect(() => new Function(OLD_DEVICE_SCRIPT)).not.toThrow();
  });

  it("links the school's own plan", () => {
    expect(OLD_DEVICE_SCRIPT).toContain(`href="${SCHOOL_PLAN_URL}"`);
  });
});
