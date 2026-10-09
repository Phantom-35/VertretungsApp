import { useEffect, useState } from "react";

type ShareButtonProps = {
  title: string;
  /** Built only when tapped. */
  getText: () => string;
};

type Feedback = "copied" | "failed" | null;

/**
 * Opens the phone's share menu (e.g. to send the day's changes to the class
 * chat). Where that is not available, the text is copied instead.
 */
export function ShareButton({ title, getText }: ShareButtonProps) {
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    if (!feedback) {
      return;
    }
    const timer = window.setTimeout(() => setFeedback(null), 2_500);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const share = async () => {
    const text = getText();
    const url = window.location.origin;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (error) {
        // Closing the share menu is not an error.
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }

    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setFeedback("copied");
    } catch {
      setFeedback("failed");
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span role="status" className="text-xs font-medium text-muted">
        {feedback === "copied" ? "Kopiert" : feedback === "failed" ? "Teilen nicht möglich" : ""}
      </span>
      <button
        type="button"
        onClick={() => void share()}
        className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-accent-strong transition active:scale-95"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3v12M7 8l5-5 5 5" />
          <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
        </svg>
        Teilen
      </button>
    </div>
  );
}
