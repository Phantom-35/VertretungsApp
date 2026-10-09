// Serves the saved Untis pages (tests/fixtures) as a stand-in for the school
// website, so that the browser tests always see the same plan.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const PORT = Number(process.env.FIXTURE_PORT ?? 3199);
const DIR = join(import.meta.dirname, "..", "tests", "fixtures", "untis-2026-10-08");

createServer(async (request, response) => {
  const name = new URL(request.url ?? "/", "http://localhost").pathname.slice(1);
  if (!/^subst_\d{3}\.htm$/.test(name)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(join(DIR, name));
    response.writeHead(200, { "content-type": "text/html; charset=iso-8859-1" }).end(body);
  } catch {
    response.writeHead(404).end();
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Fixture server on http://127.0.0.1:${PORT}`);
});
