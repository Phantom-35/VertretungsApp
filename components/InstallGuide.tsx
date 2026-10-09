import { useSyncExternalStore, type ReactNode } from "react";
import { isIos } from "@/lib/device";
import { promptInstall, useCanPromptInstall } from "@/lib/install-prompt";

const noSubscribe = () => () => undefined;

const iconProps = {
  "aria-hidden": true,
  viewBox: "0 0 24 24",
  className: "inline-block size-[1.15em] -translate-y-px align-middle",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Safari's share symbol: a box with an arrow pointing up. */
function ShareSymbol() {
  return (
    <svg {...iconProps}>
      <path d="M12 3v12M7 8l5-5 5 5" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

function AddSymbol() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function MenuSymbol() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** A highlighted label in the steps, like the button the user looks for. */
function Key({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-line bg-surface px-1.5 py-0.5 font-semibold text-foreground">
      {children}
    </span>
  );
}

function Steps({ steps }: { steps: ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => (
        <li key={index} className="flex gap-3 text-sm leading-7 text-foreground">
          <span
            aria-hidden
            className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold leading-none text-white"
          >
            {index + 1}
          </span>
          <span className="min-w-0">{step}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * How to put the app on the home screen: steps with the symbols to look for
 * on iPhones, a one-tap button where the browser offers installing.
 */
export function InstallGuide() {
  const onIos = useSyncExternalStore(noSubscribe, isIos, () => false);
  // Once declined, the browser does not offer it again: the steps show then.
  const canPrompt = useCanPromptInstall();

  if (onIos) {
    return (
      <Steps
        steps={[
          <>
            In Safari auf{" "}
            <Key>
              <ShareSymbol /> Teilen
            </Key>{" "}
            tippen (je nach Ansicht erst auf <Key>···</Key>).
          </>,
          <>
            <Key>
              <AddSymbol /> Zum Home-Bildschirm
            </Key>{" "}
            wählen und „Hinzufügen“ tippen.
          </>,
          <>Die App ab jetzt über das neue Symbol auf dem Home-Bildschirm öffnen.</>,
        ]}
      />
    );
  }

  if (canPrompt) {
    return (
      <button
        type="button"
        onClick={() => void promptInstall()}
        className="w-full rounded-full bg-accent px-5 py-3 text-base font-semibold text-white transition active:scale-[0.98]"
      >
        App installieren
      </button>
    );
  }

  return (
    <Steps
      steps={[
        <>
          Im Browser das Menü{" "}
          <Key>
            <MenuSymbol />
          </Key>{" "}
          öffnen.
        </>,
        <>
          <Key>App installieren</Key> oder <Key>Zum Startbildschirm hinzufügen</Key> wählen.
        </>,
        <>Die App ab jetzt über das neue Symbol öffnen.</>,
      ]}
    />
  );
}
