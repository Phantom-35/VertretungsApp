import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KAG Vertretungsplan",
    short_name: "Vertretungsplan",
    description:
      "Installierbare Mobile Web-App fuer den aktuellen Vertretungsplan des KAG Meckenheim.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5efe2",
    theme_color: "#f5efe2",
    lang: "de-DE",
    orientation: "portrait",
    icons: [
      {
        src: "/icon?size=192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon?size=512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
