// Serves the saved Untis pages (tests/fixtures) as a stand-in for the school
// website, so that the browser tests always see the same plan. Tests can
// change a page, as if the school uploaded a new plan:
//   POST /__override  {"page": 4, "find": "…", "replace": "…"}
//   POST /__reset
// It also stands in for the maintainer's webhook of "Hilfe & Kontakt":
//   POST /__feedback  (from the app) – GET /__feedback lists what arrived
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const PORT = Number(process.env.FIXTURE_PORT ?? 3199);
const DIR = join(import.meta.dirname, "..", "tests", "fixtures", "untis-2026-10-08");
const LATIN1 = new TextDecoder("windows-1252");

/** page number -> list of [find, replace] */
let overrides = new Map();
/** Messages from "Hilfe & Kontakt", as the webhook received them. */
let feedback = [];

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function servePage(name, response) {
  const page = Number(name.slice(6, 9));
  const bytes = await readFile(join(DIR, name));
  const changes = overrides.get(page);
  if (!changes) {
    response.writeHead(200, { "content-type": "text/html; charset=iso-8859-1" }).end(bytes);
    return;
  }
  let html = LATIN1.decode(bytes);
  for (const [find, replace] of changes) html = html.replaceAll(find, replace);
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
}

createServer(async (request, response) => {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  try {
    if (request.method === "POST" && path === "/__override") {
      const { page, find, replace } = JSON.parse(await readBody(request));
      overrides.set(page, [...(overrides.get(page) ?? []), [find, replace]]);
      response.writeHead(204).end();
      return;
    }
    if (path === "/__feedback") {
      if (request.method === "POST") {
        feedback.push(JSON.parse(await readBody(request)));
        response.writeHead(200).end();
      } else {
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(feedback));
      }
      return;
    }
    if (request.method === "POST" && path === "/__reset") {
      overrides = new Map();
      feedback = [];
      response.writeHead(204).end();
      return;
    }
    const name = path.slice(1);
    if (!/^subst_\d{3}\.htm$/.test(name)) {
      response.writeHead(404).end();
      return;
    }
    await servePage(name, response);
  } catch {
    response.writeHead(404).end();
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Fixture server on http://127.0.0.1:${PORT}`);
});
