/**
 * Messages from the "Hilfe & Kontakt" page: what can be chosen, what the
 * server accepts and how a message reads when it reaches the maintainer.
 * Shared by the page (also for the e-mail) and app/api/feedback.
 */

export const FEEDBACK_EMAIL = "phandevstudios@gmx.de";

export const FEEDBACK_CATEGORIES = [
  { value: "bug", label: "Fehler melden", symbol: "🐞" },
  { value: "question", label: "Frage", symbol: "❓" },
  { value: "idea", label: "Idee oder Wunsch", symbol: "💡" },
  { value: "other", label: "Sonstiges", symbol: "✉️" },
] as const;

/** For errors: what is wrong, so the right details can be looked at first. */
export const FEEDBACK_PROBLEMS = [
  { value: "plan", label: "Plan falsch oder fehlt" },
  { value: "notifications", label: "Benachrichtigungen kommen nicht" },
  { value: "loading", label: "App lädt nicht oder hängt" },
  { value: "display", label: "Sieht komisch aus" },
  { value: "other", label: "Etwas anderes" },
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]["value"];
export type FeedbackProblem = (typeof FEEDBACK_PROBLEMS)[number]["value"];

/** The device details, in this order, with the labels shown and sent. */
export const FEEDBACK_DETAILS = [
  { key: "device", label: "Gerät" },
  { key: "browser", label: "Browser" },
  { key: "installed", label: "Als App" },
  { key: "version", label: "App-Version" },
  { key: "schoolClass", label: "Klasse" },
  { key: "notifications", label: "Benachrichtigungen" },
  { key: "view", label: "Ansicht" },
  { key: "plan", label: "Plan" },
  { key: "online", label: "Internet" },
  { key: "userAgent", label: "Kennung" },
] as const;

export type FeedbackDetailKey = (typeof FEEDBACK_DETAILS)[number]["key"];
export type FeedbackDetails = Partial<Record<FeedbackDetailKey, string>>;

export type Feedback = {
  category: FeedbackCategory;
  problem: FeedbackProblem | null;
  message: string;
  /** Optional e-mail address for an answer. */
  contact: string;
  details: FeedbackDetails;
};

export const MAX_MESSAGE_LENGTH = 2000;
const MAX_CONTACT_LENGTH = 200;
const MAX_DETAIL_LENGTH = 400;

/** Control characters (except line breaks) and surrounding space removed. */
function clean(value: unknown, max: number) {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim().slice(0, max);
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** The message as the server accepts it, or null when something is missing or wrong. */
export function parseFeedback(body: unknown): Feedback | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const input = body as Record<string, unknown>;
  const category = FEEDBACK_CATEGORIES.find((item) => item.value === input.category)?.value;
  if (!category) {
    return null;
  }
  const problem =
    category === "bug" ? (FEEDBACK_PROBLEMS.find((item) => item.value === input.problem)?.value ?? null) : null;
  const message = clean(input.message, MAX_MESSAGE_LENGTH);
  const contact = clean(input.contact, MAX_CONTACT_LENGTH);
  if (!message || (contact && !isEmail(contact))) {
    return null;
  }
  const details: FeedbackDetails = {};
  if (input.details && typeof input.details === "object") {
    const given = input.details as Record<string, unknown>;
    for (const { key } of FEEDBACK_DETAILS) {
      const value = clean(given[key], MAX_DETAIL_LENGTH).replace(/\s*\n\s*/g, " ");
      if (value) {
        details[key] = value;
      }
    }
  }
  return { category, problem, message, contact, details };
}

/** "🐞 Fehler: Benachrichtigungen kommen nicht", "💡 Idee oder Wunsch" … */
export function feedbackTitle(feedback: Pick<Feedback, "category" | "problem">) {
  const category = FEEDBACK_CATEGORIES.find((item) => item.value === feedback.category)!;
  const problem = FEEDBACK_PROBLEMS.find((item) => item.value === feedback.problem);
  return feedback.category === "bug"
    ? `${category.symbol} Fehler${problem ? `: ${problem.label}` : ""}`
    : `${category.symbol} ${category.label}`;
}

/** The text that reaches the maintainer (push or e-mail), details at the end. */
export function feedbackText(feedback: Omit<Feedback, "category" | "problem">) {
  const lines = [feedback.message];
  if (feedback.contact) {
    lines.push("", `Antwort an: ${feedback.contact}`);
  }
  const details = FEEDBACK_DETAILS.filter(({ key }) => feedback.details[key]).map(
    ({ key, label }) => `${label}: ${feedback.details[key]}`,
  );
  if (details.length > 0) {
    lines.push("", "---", ...details);
  }
  return lines.join("\n");
}

/** The same message as an e-mail (if sending directly is not possible or wanted). */
export function feedbackMailto(feedback: Feedback) {
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(
    `KAG Vertretungsplan – ${feedbackTitle(feedback).replace(/^\S+ /, "")}`,
  )}&body=${encodeURIComponent(feedbackText(feedback))}`;
}
