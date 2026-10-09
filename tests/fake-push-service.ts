import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import type { IncomingHttpHeaders } from "node:http";
import { createServer } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type ReceivedPush = { path: string; headers: IncomingHttpHeaders; body: Buffer };

/** Self-signed certificate for 127.0.0.1 (web-push only speaks HTTPS). */
export function createCertificate() {
  const dir = mkdtempSync(join(tmpdir(), "push-cert-"));
  const key = join(dir, "key.pem");
  const cert = join(dir, "cert.pem");
  execFileSync(
    "openssl",
    ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes",
     "-keyout", key, "-out", cert, "-days", "2", "-subj", "/CN=127.0.0.1"],
    { stdio: "ignore" },
  );
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

/**
 * Stands in for a browser push service (FCM, Apple, …): records every
 * notification and answers with `status`.
 */
export async function startFakePushService(status = 201) {
  const received: ReceivedPush[] = [];
  const server = createServer(createCertificate(), (request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push({ path: request.url ?? "", headers: request.headers, body: Buffer.concat(chunks) });
      response.writeHead(status).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `https://127.0.0.1:${port}`,
    received,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
