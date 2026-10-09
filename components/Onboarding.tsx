import { useEffect, useRef, useState, type ReactNode } from "react";
import { FadingStatus } from "@/components/FadingStatus";
import type { PushControls } from "@/hooks/usePushNotifications";
import { SCHOOL_CLASSES, isCourseClass } from "@/lib/entries";

type OnboardingProps = {
  myClass: string | null;
  onChooseClass: (value: string) => void;
  push: PushControls;
  onFinish: () => void;
};

type Step = "welcome" | "class" | "notifications" | "tips";

/** One row per grade ("5A" … "5D"), then the upper school. */
const CLASS_ROWS = [
  ...[5, 6, 7, 8, 9, 10].map((grade) =>
    SCHOOL_CLASSES.filter((schoolClass) => schoolClass.slice(0, -1) === String(grade)),
  ),
  SCHOOL_CLASSES.filter(isCourseClass),
];

const primaryButton =
  "w-full rounded-full bg-accent px-5 py-3 text-base font-semibold text-white transition active:scale-[0.98] disabled:opacity-50";
const secondaryButton = "w-full rounded-full px-5 py-2.5 text-sm font-semibold text-muted";

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-strong"
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-sm leading-5 text-muted">{children}</span>
      </span>
    </li>
  );
}

const iconProps = {
  viewBox: "0 0 24 24",
  className: "size-5",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function NotificationStep({ push, myClass }: { push: PushControls; myClass: string | null }) {
  const { status, busy, message, enable } = push;

  let content: ReactNode;
  switch (status) {
    case "on":
      content = (
        <p className="rounded-2xl border border-accent/15 bg-accent-soft px-4 py-3 text-sm font-semibold text-accent-strong">
          ✓ Eingeschaltet für {myClass}
        </p>
      );
      break;
    case "off":
      content = (
        <button
          type="button"
          onClick={() => void enable()}
          disabled={busy || !myClass}
          className={primaryButton}
        >
          {busy ? "Wird eingeschaltet …" : "Benachrichtigungen einschalten"}
        </button>
      );
      break;
    case "install":
      content = (
        <p className="rounded-2xl border border-line bg-card px-4 py-3 text-sm leading-6 text-foreground">
          Auf dem iPhone gehen Benachrichtigungen nur in der App auf dem Home-Bildschirm: in Safari
          unten auf „Teilen“ tippen, „Zum Home-Bildschirm“ wählen und die App von dort öffnen. Danach
          kannst du sie unter „Meine Klasse“ einschalten.
        </p>
      );
      break;
    case "denied":
      content = (
        <p className="rounded-2xl border border-warn/15 bg-warn-soft px-4 py-3 text-sm leading-6 text-warn">
          Benachrichtigungen sind auf diesem Gerät blockiert. Du kannst sie in den Einstellungen des
          Geräts erlauben.
        </p>
      );
      break;
    case "unsupported":
      content = (
        <p className="rounded-2xl border border-line bg-card px-4 py-3 text-sm leading-6 text-muted">
          Dieser Browser kann leider keine Benachrichtigungen empfangen.
        </p>
      );
      break;
    default:
      content = <p className="text-sm text-muted">Einen Moment …</p>;
  }

  return (
    <div className="space-y-3">
      {content}
      <FadingStatus message={message} className="text-center" />
    </div>
  );
}

/**
 * Introduction on the first start: what the app does, the student's own
 * class and notifications. Shown once per device.
 */
export function Onboarding({ myClass, onChooseClass, push, onFinish }: OnboardingProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Without notifications on the server, that step is left out.
  const steps: Step[] =
    push.status === "unavailable"
      ? ["welcome", "class", "tips"]
      : ["welcome", "class", "notifications", "tips"];
  const [step, setStep] = useState<Step>("welcome");
  const index = Math.max(0, steps.indexOf(step));
  const next = () => setStep(steps[Math.min(index + 1, steps.length - 1)]);

  // Only rendered while needed: open right away.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  // Each step starts at the top, with the focus on the page itself (not a
  // ring around the first button).
  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
    dialogRef.current?.scrollTo({ top: 0 });
  }, [step]);

  return (
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      aria-labelledby="onboarding-title"
      // Escape skips the introduction; it does not come back.
      onCancel={onFinish}
      className="onboarding fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto border-0 outline-none overscroll-contain bg-background p-0 text-foreground backdrop:bg-background"
    >
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-accent-strong/70">
            KAG Vertretungsplan
          </p>
          <div className="flex gap-1.5" aria-label={`Schritt ${index + 1} von ${steps.length}`} role="img">
            {steps.map((item, itemIndex) => (
              <span
                key={item}
                className={`h-1.5 rounded-full transition-all ${
                  itemIndex === index ? "w-5 bg-accent" : "w-1.5 bg-line"
                }`}
              />
            ))}
          </div>
        </div>

        {step === "welcome" ? (
          <>
            <div className="mt-10 flex-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- the app's own generated icon */}
              <img src="/icon/192" alt="" width={72} height={72} className="size-18 rounded-[1.4rem] shadow-[0_18px_40px_rgba(18,41,39,0.18)]" />
              <h2 id="onboarding-title" className="mt-6 text-3xl font-semibold tracking-[-0.04em]">
                Willkommen!
              </h2>
              <p className="mt-2 text-base leading-7 text-muted">
                Der Vertretungsplan des KAG – übersichtlich auf dem Handy, nur mit dem, was dich
                betrifft.
              </p>
              <ul className="mt-8 space-y-5">
                <Feature
                  title="Immer aktuell"
                  icon={
                    <svg {...iconProps}>
                      <path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5" />
                    </svg>
                  }
                >
                  Der Plan kommt direkt von der Schule. Zum Aktualisieren oben nach unten ziehen.
                </Feature>
                <Feature
                  title="Neues auf einen Blick"
                  icon={
                    <svg {...iconProps}>
                      <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z" />
                    </svg>
                  }
                >
                  Was seit deinem letzten Besuch dazugekommen ist, ist mit „Neu“ markiert.
                </Feature>
                <Feature
                  title="Teilen"
                  icon={
                    <svg {...iconProps}>
                      <path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
                    </svg>
                  }
                >
                  Die Änderungen eines Tages mit einem Tipp an Freunde oder Eltern schicken.
                </Feature>
              </ul>
            </div>
            <div className="mt-10">
              <button type="button" onClick={next} className={primaryButton}>
                Los geht’s
              </button>
            </div>
          </>
        ) : null}

        {step === "class" ? (
          <>
            <div className="mt-10 flex-1">
              <h2 id="onboarding-title" className="text-3xl font-semibold tracking-[-0.04em]">
                Deine Klasse
              </h2>
              <p className="mt-2 text-base leading-7 text-muted">
                Die App öffnet immer mit deiner Klasse, und Benachrichtigungen kommen für sie. Andere
                Klassen kannst du jederzeit ansehen, das ändert daran nichts.
              </p>
              <div role="radiogroup" aria-label="Deine Klasse" className="mt-6 space-y-2">
                {CLASS_ROWS.map((row) => (
                    <div key={row.join()} className="grid grid-cols-4 gap-2">
                      {row.map((schoolClass) => {
                        const active = schoolClass === myClass;
                        return (
                          <button
                            key={schoolClass}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => onChooseClass(schoolClass)}
                            className={`rounded-2xl border py-3 text-base font-semibold transition active:scale-95 ${
                              active
                                ? "border-accent bg-accent text-white"
                                : "border-line bg-card text-foreground"
                            }`}
                          >
                            {schoolClass}
                          </button>
                        );
                      })}
                    </div>
                ))}
              </div>
              {myClass && isCourseClass(myClass) ? (
                <p className="mt-4 rounded-2xl border border-line bg-card px-4 py-3 text-sm leading-6 text-foreground">
                  Oberstufe: In den Einstellungen kannst du die Lehrkräfte deiner Kurse festlegen.
                  Dann siehst du nur deine Kurse.
                </p>
              ) : null}
            </div>
            <div className="mt-8 space-y-1">
              <button type="button" onClick={next} disabled={!myClass} className={primaryButton}>
                Weiter
              </button>
              {!myClass ? (
                <button type="button" onClick={next} className={secondaryButton}>
                  Später festlegen
                </button>
              ) : null}
            </div>
          </>
        ) : null}

        {step === "notifications" ? (
          <>
            <div className="mt-10 flex-1">
              <span
                aria-hidden
                className="flex size-16 items-center justify-center rounded-[1.4rem] bg-accent-soft text-accent-strong"
              >
                <svg {...iconProps} className="size-8">
                  <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
              </span>
              <h2 id="onboarding-title" className="mt-6 text-3xl font-semibold tracking-[-0.04em]">
                Nichts mehr verpassen
              </h2>
              <p className="mt-2 text-base leading-7 text-muted">
                {myClass
                  ? `Eine Mitteilung aufs Handy, sobald sich der Plan für die ${myClass} ändert – auch wenn die App geschlossen ist. Nachts bleibt es ruhig.`
                  : "Lege zuerst deine Klasse fest, dann kannst du Benachrichtigungen einschalten."}
              </p>
              <div className="mt-8">
                <NotificationStep push={push} myClass={myClass} />
              </div>
            </div>
            <div className="mt-8">
              {push.status === "on" ? (
                <button type="button" onClick={next} className={primaryButton}>
                  Weiter
                </button>
              ) : (
                <button type="button" onClick={next} className={secondaryButton}>
                  {push.status === "off" && myClass ? "Später" : "Weiter"}
                </button>
              )}
            </div>
          </>
        ) : null}

        {step === "tips" ? (
          <>
            <div className="mt-10 flex-1">
              <h2 id="onboarding-title" className="text-3xl font-semibold tracking-[-0.04em]">
                Gut zu wissen
              </h2>
              <ul className="mt-8 space-y-5">
                <Feature
                  title="Einstellungen"
                  icon={
                    <svg {...iconProps}>
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
                    </svg>
                  }
                >
                  Über das Zahnrad oben änderst du deine Klasse, Benachrichtigungen, Darstellung und
                  mehr.
                </Feature>
                <Feature
                  title="Andere Klasse ansehen"
                  icon={
                    <svg {...iconProps}>
                      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  }
                >
                  Über die Klassenauswahl, z. B. für Geschwister. Beim nächsten Öffnen ist wieder
                  deine Klasse da.
                </Feature>
                <Feature
                  title="Noch offene Vertretungen"
                  icon={
                    <svg {...iconProps}>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />
                    </svg>
                  }
                >
                  Steht noch keine Vertretung fest, zeigt die App „noch offen“. Schau dann später
                  nochmal rein.
                </Feature>
              </ul>
            </div>
            <div className="mt-10">
              <button type="button" onClick={onFinish} className={primaryButton}>
                Fertig
              </button>
            </div>
          </>
        ) : null}
      </div>
    </dialog>
  );
}
