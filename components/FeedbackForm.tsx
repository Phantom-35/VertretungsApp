"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useSettings } from "@/hooks/useSettings";
import { useWideScreen } from "@/hooks/useWideScreen";
import { isStandalone } from "@/lib/device";
import { describeDevice } from "@/lib/device-info";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_DETAILS,
  FEEDBACK_EMAIL,
  FEEDBACK_PROBLEMS,
  MAX_MESSAGE_LENGTH,
  feedbackMailto,
  isEmail,
  type Feedback,
  type FeedbackCategory,
  type FeedbackDetails,
  type FeedbackProblem,
} from "@/lib/feedback";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? null;
const BUILD = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;

const PUSH_LABELS: Record<string, string> = {
  on: "an",
  off: "aus",
  denied: "im Browser blockiert",
  install: "nur in der installierten App",
  unsupported: "auf diesem Gerät nicht möglich",
  unavailable: "auf dem Server aus",
  checking: "wird noch geprüft",
};

const PLACEHOLDERS: Record<string, string> = {
  plan: "Welche Klasse, welcher Tag, was stimmt nicht? Z. B. „9B, Montag 3. Stunde fehlt die Vertretung“",
  notifications: "Seit wann? Kommt gar nichts oder nur manchmal?",
  loading: "Was passiert genau? Weißer Bildschirm, Fehlermeldung …?",
  display: "Was sieht komisch aus, und wo?",
  bug: "Was ist passiert?",
  question: "Deine Frage",
  idea: "Was würdest du dir wünschen?",
  other: "Deine Nachricht",
};

type FeedbackFormProps = {
  /** "9B" or "Q1 (ABC, DEF)": the class the app opens with. */
  audience: string | null;
  pushStatus: string;
  /** "Stand 16.10., 11:35 Uhr, geprüft gerade eben" */
  planInfo: string;
  supportUrl: string;
};

/** The details sent along, read when the message is written (all visible to the user). */
function readDetails({ audience, pushStatus, planInfo }: FeedbackFormProps, wide: boolean, textSize: string, model: string) {
  const touch = navigator.maxTouchPoints > 1;
  const { device, browser } = describeDevice(navigator.userAgent, touch);
  const theme = document.documentElement.dataset.theme === "dark" ? "dunkel" : "hell";
  return {
    device: model ? `${device} (${model})` : device,
    browser,
    installed: isStandalone() ? "ja" : "nein, im Browser",
    version: APP_VERSION ? `${APP_VERSION}${BUILD ? ` (${BUILD})` : ""}` : "–",
    schoolClass: audience ?? "keine gewählt",
    notifications: PUSH_LABELS[pushStatus] ?? pushStatus,
    view: `${wide ? "PC-Ansicht" : "Handy-Ansicht"}, ${window.innerWidth}×${window.innerHeight}, ${theme}, Text ${textSize === "large" ? "groß" : "normal"}`,
    plan: planInfo,
    online: navigator.onLine ? "ja" : "nein",
    userAgent: navigator.userAgent,
  } satisfies FeedbackDetails;
}

/** Choices as a list of large radio buttons, one below the other. */
function Choices<T extends string>({ name, legend, options, value, onChange }: {
  name: string;
  legend: string;
  options: readonly { value: T; label: string; symbol?: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="mb-2 text-sm font-semibold text-foreground">{legend}</legend>
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <label
              key={option.value}
              className="press-highlight flex cursor-pointer items-center gap-3 px-4 py-3 text-sm font-medium text-foreground transition hover:bg-surface-muted/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-accent/40"
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={active}
                onChange={() => onChange(option.value)}
                autoComplete="off"
                className="sr-only"
              />
              {option.symbol ? <span aria-hidden>{option.symbol}</span> : null}
              <span className="min-w-0 flex-1">{option.label}</span>
              <span
                aria-hidden
                className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                  active ? "border-accent bg-accent" : "border-line"
                }`}
              >
                {active ? <span className="size-2 rounded-full bg-white" /> : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

type SendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error"; message: string };

/**
 * "Hilfe & Kontakt": a message to click through (topic, for errors what is
 * wrong, a few words), sent directly with the device details that help to
 * find a problem, or as an e-mail. Writing without the form is always offered.
 */
export function FeedbackForm(props: FeedbackFormProps) {
  const id = useId();
  const wide = useWideScreen();
  const [settings] = useSettings();
  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [problem, setProblem] = useState<FeedbackProblem | null>(null);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [withDetails, setWithDetails] = useState(true);
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<SendState>({ kind: "idle" });
  // Chromium names the phone model only on request (other browsers never).
  const [model, setModel] = useState("");
  useEffect(() => {
    const data = (navigator as Navigator & {
      userAgentData?: { getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string }> };
    }).userAgentData;
    data?.getHighEntropyValues?.(["model"])
      .then((values) => setModel(values.model?.trim() ?? ""))
      .catch(() => undefined);
  }, []);

  const details = readDetails(props, wide, settings.textSize, model);
  const contactValid = !contact.trim() || isEmail(contact.trim());
  const ready = category !== null && (category !== "bug" || problem !== null) && message.trim().length > 0 && contactValid;
  const feedback: Feedback | null =
    category !== null
      ? {
          category,
          problem: category === "bug" ? problem : null,
          message: message.trim(),
          contact: contact.trim(),
          details: withDetails ? details : {},
        }
      : null;

  const chooseCategory = (value: FeedbackCategory) => {
    setCategory(value);
    setState({ kind: "idle" });
    if (value !== "bug") {
      setProblem(null);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || !feedback || state.kind === "sending") {
      return;
    }
    setState({ kind: "sending" });
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...feedback, website }),
      });
      if (response.ok) {
        setState({ kind: "sent" });
        setCategory(null);
        setProblem(null);
        setMessage("");
        setContact("");
        return;
      }
      const answer = (await response.json().catch(() => null)) as { error?: string } | null;
      setState({ kind: "error", message: answer?.error ?? "Senden hat nicht geklappt." });
    } catch {
      setState({ kind: "error", message: "Keine Verbindung. Versuch es später noch einmal oder per E-Mail." });
    }
  };

  const placeholder = PLACEHOLDERS[(category === "bug" && problem && problem !== "other" ? problem : category) ?? "other"];

  return (
    <div className="space-y-5">
      {state.kind === "sent" ? (
        <div role="status" className="rounded-2xl border border-accent/20 bg-accent-soft px-4 py-3 text-sm text-accent-strong">
          <p className="font-semibold">Danke! Deine Nachricht ist angekommen.</p>
          <p className="mt-0.5 text-xs leading-5">Ich schaue sie mir so bald wie möglich an.</p>
        </div>
      ) : null}

      <Choices
        name={`${id}-category`}
        legend="Worum geht’s?"
        options={FEEDBACK_CATEGORIES}
        value={category}
        onChange={chooseCategory}
      />

      {category === "bug" ? (
        <Choices
          name={`${id}-problem`}
          legend="Was stimmt nicht?"
          options={FEEDBACK_PROBLEMS}
          value={problem}
          onChange={setProblem}
        />
      ) : null}

      {category !== null && (category !== "bug" || problem !== null) ? (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-foreground">Kurz beschreiben</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={MAX_MESSAGE_LENGTH}
              rows={4}
              placeholder={placeholder}
              className="block w-full resize-y rounded-2xl border border-line bg-card px-4 py-3 text-base text-foreground outline-none placeholder:text-muted focus:border-accent/35 focus:ring-4 focus:ring-accent/10"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-foreground">Deine E-Mail für eine Antwort</span>
            <span className="block text-xs leading-5 text-muted">
              Freiwillig. Ohne Adresse kann ich dir nicht antworten.
            </span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              aria-invalid={!contactValid}
              placeholder="name@beispiel.de"
              className="block w-full rounded-2xl border border-line bg-card px-4 py-3 text-base text-foreground outline-none placeholder:text-muted focus:border-accent/35 focus:ring-4 focus:ring-accent/10"
            />
            {!contactValid ? <span className="block text-xs font-semibold text-warn">Bitte prüf die Adresse.</span> : null}
          </label>

          {/* Never seen by people (only bots fill it in), see app/api/feedback. */}
          <input
            type="text"
            name="website"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
            className="hidden"
          />

          <div className="rounded-2xl border border-line bg-card px-4 py-3">
            <label className="flex cursor-pointer items-start gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={withDetails}
                onChange={(event) => setWithDetails(event.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
              />
              <span>
                <span className="font-semibold">Geräte-Angaben mitschicken</span>
                <span className="block text-xs leading-5 text-muted">Hilft, Fehler schneller zu finden. Keine Namen.</span>
              </span>
            </label>
            {withDetails ? (
              <details className="mt-2 text-xs text-muted">
                <summary className="cursor-pointer font-semibold text-accent-strong">Diese Angaben ansehen</summary>
                <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                  {FEEDBACK_DETAILS.map(({ key, label }) => (
                    <div key={key} className="contents">
                      <dt className="font-semibold">{label}</dt>
                      <dd className="break-words">{details[key]}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            ) : null}
          </div>

          {state.kind === "error" ? (
            <p role="alert" className="rounded-2xl border border-warn/20 bg-warn-soft px-4 py-3 text-sm text-warn">
              {state.message}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={!ready || state.kind === "sending"}
              className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
            >
              {state.kind === "sending" ? "Wird gesendet …" : "Senden"}
            </button>
            {feedback ? (
              <a
                href={ready ? feedbackMailto(feedback) : undefined}
                aria-disabled={!ready}
                className={`rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-foreground ${
                  ready ? "" : "pointer-events-none opacity-50"
                }`}
              >
                Per E-Mail senden
              </a>
            ) : null}
          </div>
        </form>
      ) : null}

      <div className="space-y-2 border-t border-line pt-4 text-sm">
        <p className="text-xs leading-5 text-muted">Lieber einfach so schreiben?</p>
        <a
          href={`mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent("KAG Vertretungsplan")}`}
          className="block font-semibold text-accent-strong underline underline-offset-2"
        >
          E-Mail an {FEEDBACK_EMAIL}
        </a>
        <a
          href={props.supportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block font-semibold text-accent-strong underline underline-offset-2"
        >
          Häufige Fragen ansehen
        </a>
      </div>
    </div>
  );
}
