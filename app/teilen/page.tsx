import type { Metadata } from "next";
import Link from "next/link";
import { AppQrCode, ShareSteps } from "@/components/AppQrCode";

export const metadata: Metadata = {
  title: "App weitergeben · KAG Vertretungsplan",
};

/**
 * The notice to print for the school (opened from the settings, where the
 * code is shown to friends). Back leads to the settings again.
 */
export default function SharePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-5 print:max-w-none print:pt-[2cm]">
      <Link
        href="/?einstellungen=teilen"
        className="self-start rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-semibold text-accent-strong print:hidden"
      >
        ← Zurück
      </Link>
      <section className="rounded-[1.75rem] border border-line bg-card p-6 shadow-[0_18px_45px_rgba(18,41,39,0.07)] print:border-0 print:bg-white print:shadow-none">
        <h1 className="text-center text-2xl font-semibold tracking-[-0.03em] text-foreground print:text-5xl print:text-black">
          KAG Vertretungsplan
        </h1>
        <p className="mt-1 mb-5 text-center text-sm leading-6 text-muted print:mb-10 print:text-2xl print:text-black">
          Die Vertretungen deiner Klasse, immer aktuell auf dem Handy.
        </p>
        <AppQrCode />
        <ShareSteps />
      </section>
    </main>
  );
}
