import type { Metadata, Viewport } from "next";
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
    { media: "(prefers-color-scheme: light)", color: "#f5efe2" },
    { media: "(prefers-color-scheme: dark)", color: "#12191b" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
