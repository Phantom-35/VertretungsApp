import { NextResponse } from "next/server";

const MAX_BODY_BYTES = 8 * 1024;

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** The request body as JSON, or null if it is missing, too large or broken. */
export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text().catch(() => "");
  if (!text || text.length > MAX_BODY_BYTES) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const notConfigured = () =>
  json({ error: "Benachrichtigungen sind auf diesem Server nicht eingerichtet." }, 503);
