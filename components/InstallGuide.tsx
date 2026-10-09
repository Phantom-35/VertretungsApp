import { useState, useSyncExternalStore, type ReactNode } from "react";
import { currentBrowser, type BrowserInfo } from "@/lib/device";
import { promptInstall, useCanPromptInstall } from "@/lib/install-prompt";

const noSubscribe = () => () => undefined;

// The browser does not change while the page is open; one object for React.
let browserInfo: BrowserInfo | null = null;
const getBrowser = () => (browserInfo ??= currentBrowser());

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

/** "⋮" (Chrome, Firefox on Android). */
function MenuSymbol() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** "···" (Safari's compact tab bar, Edge, in-app browsers). */
function MoreSymbol() {
  return (
    <svg {...iconProps}>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** "≡" (Firefox on iPhone, Samsung Internet). */
function LinesSymbol() {
  return (
    <svg {...iconProps}>
      <path d="M4 7h16M4 12h16M4 17h16" />
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

const share = (
  <Key>
    <ShareSymbol /> Teilen
  </Key>
);
const addToHomeScreen = (
  <Key>
    <AddSymbol /> Zum Home-Bildschirm
  </Key>
);
const confirmIos = <>„Hinzufügen“ tippen und die App ab jetzt über das neue Symbol öffnen.</>;
const confirmAndroid = <>Bestätigen und die App ab jetzt über das neue Symbol öffnen.</>;

/** Copies the address, to open it in a real browser. */
function CopyLink() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        void navigator.clipboard
          .writeText(`${window.location.origin}/`)
          .then(() => setCopied(true))
          .catch(() => undefined)
      }
      className="mt-3 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-semibold text-accent-strong transition active:scale-95"
    >
      {copied ? "Link kopiert" : "Link kopieren"}
    </button>
  );
}

/** The steps for one browser, or a note where steps do not apply. */
function stepsFor({ platform, browser }: BrowserInfo): ReactNode[] | ReactNode {
  if (browser === "in-app") {
    const target = platform === "ios" ? "Safari" : "Chrome";
    return (
      <div className="text-sm leading-6 text-foreground">
        <p>
          Aus dieser App heraus lässt sich die Seite nicht installieren. Öffne sie zuerst in{" "}
          {target}: oben im Menü{" "}
          <Key>
            <MoreSymbol />
          </Key>{" "}
          „In {target} öffnen“ oder „Im Browser öffnen“ wählen, oder den Link kopieren und dort
          einfügen.
        </p>
        <CopyLink />
      </div>
    );
  }

  if (platform === "ios") {
    switch (browser) {
      case "safari":
        return [
          <>
            Auf {share} tippen. Mit der neuen Tab-Leiste erst unten rechts auf{" "}
            <Key>
              <MoreSymbol />
            </Key>
            .
          </>,
          <>{addToHomeScreen} wählen (falls nötig etwas nach unten scrollen).</>,
          <>„Als Web-App öffnen“ eingeschaltet lassen, falls angezeigt. {confirmIos}</>,
        ];
      case "chrome":
        return [
          <>Oben in der Adressleiste auf {share} tippen.</>,
          <>{addToHomeScreen} wählen (falls nötig etwas nach unten scrollen).</>,
          confirmIos,
        ];
      case "firefox":
        return [
          <>
            Das Menü{" "}
            <Key>
              <LinesSymbol />
            </Key>{" "}
            öffnen und {share} tippen.
          </>,
          <>{addToHomeScreen} wählen.</>,
          confirmIos,
        ];
      case "edge":
        return [
          <>
            Unten auf{" "}
            <Key>
              <MoreSymbol />
            </Key>{" "}
            und dann auf {share} tippen.
          </>,
          <>{addToHomeScreen} wählen.</>,
          confirmIos,
        ];
      default:
        return [
          <>Im Menü des Browsers {share} suchen und antippen.</>,
          <>{addToHomeScreen} wählen. Klappt das nicht, die Seite in Safari öffnen.</>,
          confirmIos,
        ];
    }
  }

  if (platform === "android") {
    switch (browser) {
      case "samsung":
        return [
          <>
            Unten rechts das Menü{" "}
            <Key>
              <LinesSymbol />
            </Key>{" "}
            öffnen.
          </>,
          <>
            <Key>Seite hinzufügen zu</Key> und dann <Key>Startbildschirm</Key> wählen.
          </>,
          confirmAndroid,
        ];
      case "firefox":
        return [
          <>
            Das Menü{" "}
            <Key>
              <MenuSymbol />
            </Key>{" "}
            öffnen.
          </>,
          <>
            <Key>Installieren</Key> oder <Key>Zum Startbildschirm hinzufügen</Key> wählen.
          </>,
          confirmAndroid,
        ];
      case "edge":
        return [
          <>
            Unten das Menü{" "}
            <Key>
              <MoreSymbol />
            </Key>{" "}
            öffnen.
          </>,
          <>
            <Key>Zum Telefon hinzufügen</Key> oder <Key>App installieren</Key> wählen.
          </>,
          confirmAndroid,
        ];
      default:
        return [
          <>
            Oben rechts das Menü{" "}
            <Key>
              <MenuSymbol />
            </Key>{" "}
            öffnen.
          </>,
          <>
            <Key>App installieren</Key> oder <Key>Zum Startbildschirm hinzufügen</Key> wählen.
          </>,
          confirmAndroid,
        ];
    }
  }

  switch (browser) {
    case "chrome":
      return [
        <>
          In der Adressleiste rechts auf das Installieren-Symbol klicken, oder im Menü{" "}
          <Key>
            <MenuSymbol />
          </Key>{" "}
          unter „Streamen, speichern und teilen“ <Key>Seite als App installieren</Key> wählen.
        </>,
        <>„Installieren“ bestätigen.</>,
      ];
    case "edge":
      return [
        <>
          Im Menü{" "}
          <Key>
            <MoreSymbol />
          </Key>{" "}
          unter „Apps“ <Key>Diese Website als App installieren</Key> wählen.
        </>,
        <>„Installieren“ bestätigen.</>,
      ];
    case "safari":
      return [
        <>
          In der Menüleiste „Ablage“ und dann <Key>Zum Dock hinzufügen</Key> wählen.
        </>,
        <>„Hinzufügen“ bestätigen.</>,
      ];
    case "firefox":
      return (
        <p className="text-sm leading-6 text-foreground">
          Firefox kann Seiten am Computer nicht als App installieren. Am einfachsten ein Lesezeichen
          setzen (Strg+D bzw. ⌘D). Benachrichtigungen gehen in Firefox auch so.
        </p>
      );
    default:
      return [
        <>Im Menü des Browsers nach „App installieren“ oder „Zum Startbildschirm“ suchen.</>,
        <>Bestätigen und die App ab jetzt über das neue Symbol öffnen.</>,
      ];
  }
}

/**
 * How to put the app on the home screen, matching the browser it is open in:
 * the browser's own install button where it offers one (Chrome, Edge on
 * Android and computers), otherwise the steps with the symbols to look for.
 */
export function InstallGuide() {
  const browser = useSyncExternalStore(noSubscribe, getBrowser, () => null);
  // Once declined, the browser does not offer it again: the steps show then.
  const canPrompt = useCanPromptInstall();

  if (!browser) {
    return null;
  }
  if (canPrompt && browser.browser !== "in-app") {
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
  const steps = stepsFor(browser);
  return Array.isArray(steps) ? <Steps steps={steps} /> : steps;
}
