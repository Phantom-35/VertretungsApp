import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KAG Vertretungsplan",
  description:
    "Mobile Web-App fuer den aktuellen Vertretungsplan des Konrad-Adenauer-Gymnasiums Meckenheim.",
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
  icons: {
    icon: [
      { url: "/icon?size=192", sizes: "192x192", type: "image/png" },
      { url: "/icon?size=512", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#f5efe2",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
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
