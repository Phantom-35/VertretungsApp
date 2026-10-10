"use client";

import { useSyncExternalStore } from "react";
import { encode } from "uqr";
import { ShareButton } from "@/components/ShareButton";

const noSubscribe = () => () => undefined;
const appUrl = () => `${window.location.origin}/`;

/** The QR code as one SVG path: a 1×1 square per dark module. */
function QrCode({ text }: { text: string }) {
  const { data, size } = encode(text, { ecc: "M", border: 2 });
  let path = "";
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) {
        path += `M${x} ${y}h1v1h-1z`;
      }
    }),
  );
  return (
    <svg
      role="img"
      aria-label={`QR-Code für ${text}`}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="block size-full"
    >
      {/* Always black on white, also in dark mode: cameras read it best. */}
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

/** The app's address as a QR code, with buttons to share or print it. */
export function AppQrCode() {
  // The address the app runs at (production, preview or local).
  const url = useSyncExternalStore(noSubscribe, appUrl, () => null);
  if (!url) {
    return <div className="mx-auto aspect-square w-64 sm:w-72 print:w-[11cm]" />;
  }
  const address = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return (
    <>
      <div className="mx-auto aspect-square w-64 overflow-hidden rounded-2xl sm:w-72 print:w-[11cm]">
        <QrCode text={url} />
      </div>
      <p className="mt-3 break-all text-center text-base font-semibold text-foreground print:text-2xl print:text-black">
        {address}
      </p>
      <div className="mt-5 flex items-start justify-center gap-3 print:hidden">
        <ShareButton getText={() => `KAG Vertretungsplan – die Vertretungen deiner Klasse: ${url}`} size="large" label="Link teilen" />
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-accent-strong transition active:scale-95"
        >
          Aushang drucken
        </button>
      </div>
    </>
  );
}
