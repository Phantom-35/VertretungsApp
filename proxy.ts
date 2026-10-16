import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy } from "@/lib/csp";

/**
 * A fresh nonce for every page: Next.js adds it to its own scripts (it
 * reads it from the CSP request header), app/layout.tsx to the inline ones.
 */
export function proxy(request: NextRequest) {
  // Web APIs only, so it runs in any runtime the proxy may be moved to.
  const nonce = btoa(crypto.randomUUID());
  const policy = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  // The pages only; data, icons and build files need no policy.
  matcher: [
    {
      source: "/((?!api|_next|_vercel|icon|apple-icon|manifest|sw\\.js|favicon\\.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
