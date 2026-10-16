import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { UsageStats } from "@/components/UsageStats";
import { OLD_DEVICE_SCRIPT } from "@/lib/legacy";
import { THEME_COLORS, THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "KAG Vertretungsplan",
  description:
    "Mobile Web-App für den aktuellen Vertretungsplan des Konrad-Adenauer-Gymnasiums Meckenheim.",
  manifest: "/manifest.webmanifest",
  applicationName: "KAG Vertretungsplan",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Vertretungsplan",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    // Overridden by THEME_SCRIPT when a theme is chosen in the app.
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Set by proxy.ts: the inline scripts below may only run with it (CSP).
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    // The theme script sets data-theme before React hydrates.
    <html lang="de" className="h-full" data-theme="light" suppressHydrationWarning>
      <head>
        {/* The deploy this page belongs to (see public/sw.js, PwaRegistrar). */}
        <meta name="kag-build" content={process.env.KAG_BUILD_ID} />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: OLD_DEVICE_SCRIPT }} />
      </head>
      <body className="min-h-full">
        {children}
        {/* Only on Vercel, where the counting endpoint exists. */}
        {process.env.VERCEL === "1" ? <UsageStats /> : null}
      </body>
    </html>
  );
}
