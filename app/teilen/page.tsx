import type { Metadata } from "next";
import Link from "next/link";
import { AppQrCode } from "@/components/AppQrCode";

export const metadata: Metadata = {
  title: "App weitergeben · KAG Vertretungsplan",
};

const steps = [
  "Code mit der Handy-Kamera scannen.",
  "Klasse wählen.",
  "Als App auf den Home-Bildschirm legen – fertig.",
];

/** A QR code to show friends or to print as a notice for the school. */
export default function SharePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-5 print:max-w-none print:pt-[2cm]">
      <Link
        href="/"
        className="self-start rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-semibold text-accent-strong print:hidden"
      >
        ← Zurück zur App
      </Link>
      <section className="rounded-[1.75rem] border border-line bg-card p-6 shadow-[0_18px_45px_rgba(18,41,39,0.07)] print:border-0 print:bg-white print:shadow-none">
        <h1 className="text-center text-2xl font-semibold tracking-[-0.03em] text-foreground print:text-5xl print:text-black">
          KAG Vertretungsplan
        </h1>
        <p className="mt-1 mb-5 text-center text-sm leading-6 text-muted print:mb-10 print:text-2xl print:text-black">
          Die Vertretungen deiner Klasse, immer aktuell auf dem Handy.
        </p>
        <AppQrCode />
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
      </section>
    </main>
  );
}
