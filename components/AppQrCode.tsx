"use client";

import Link from "next/link";
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

const steps = [
  "Code mit der Handy-Kamera scannen.",
  "Klasse wählen.",
  "Als App auf den Home-Bildschirm legen – fertig.",
];

/** How a friend gets the app from the code, in three steps. */
export function ShareSteps() {
  return (
    <ol className="mx-auto mt-6 max-w-xs space-y-2 print:mt-10 print:max-w-lg print:space-y-4">
      {steps.map((step, index) => (
        <li key={step} className="flex gap-3 text-sm leading-6 text-foreground print:text-2xl print:text-black">
          <span
            aria-hidden
            className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold leading-none text-white print:size-9 print:border-2 print:border-black print:bg-transparent print:text-lg print:text-black"
          >
            {index + 1}
          </span>
          {step}
        </li>
      ))}
    </ol>
  );
}

/**
 * The app's address as a QR code, with buttons to share or print it. In the
 * settings, printing opens the page made for it (`printHref`): printing a
 * sheet over the app would print the app as well.
 */
export function AppQrCode({ printHref }: { printHref?: string } = {}) {
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
        {printHref ? (
          <Link
            href={printHref}
            className="rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-accent-strong transition active:scale-95"
          >
            Aushang drucken
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-accent-strong transition active:scale-95"
          >
            Aushang drucken
          </button>
        )}
      </div>
    </>
  );
}
