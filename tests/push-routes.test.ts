import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body), headers });

describe("push API", () => {
  it("is switched off until Redis and VAPID keys are configured", async () => {
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("PUSH_STORE", "");
    const { GET } = await import("@/app/api/push/config/route");
    expect(await (await GET()).json()).toEqual({ enabled: false });
    const { POST } = await import("@/app/api/push/subscribe/route");
    expect((await POST(post({}))).status).toBe(503);
  });

  it("hands out the public key once configured", async () => {
    vi.stubEnv("PUSH_STORE", "memory");
    vi.stubEnv("VAPID_PUBLIC_KEY", "public-key");
    vi.stubEnv("VAPID_PRIVATE_KEY", "private-key");
    const { GET } = await import("@/app/api/push/config/route");
    expect(await (await GET()).json()).toEqual({ enabled: true, publicKey: "public-key" });
    const { POST } = await import("@/app/api/push/subscribe/route");
    const response = await POST(post({ subscription: { endpoint: "https://evil.example/x" }, schoolClass: "5A" }));
    expect(response.status).toBe(400);
  });

  it("only runs the check with the right secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    const { GET } = await import("@/app/api/push/check/route");
    const call = (authorization?: string) =>
      GET(new Request("http://localhost/api/push/check", { headers: authorization ? { authorization } : {} }));
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect((await call("Bearer s3cret-valuX")).status).toBe(401);

    vi.stubEnv("CRON_SECRET", "");
    const missing = await call("Bearer ");
    expect(missing.status).toBe(503);
    expect((await missing.json()).error).toMatch(/CRON_SECRET/);
  });

  it("ignores spaces and line breaks around the pasted secret", async () => {
    vi.stubEnv("CRON_SECRET", " s3cret-value\n");
    vi.stubEnv("PUSH_STORE", "memory");
    const { GET } = await import("@/app/api/push/check/route");
    const response = await GET(
      new Request("http://localhost/api/push/check", { headers: { authorization: "Bearer s3cret-value" } }),
    );
    expect(response.status).not.toBe(401);
  });
});
