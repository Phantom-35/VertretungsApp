import { useEffect, useState } from "react";

/** How long a short status message stays before it fades out. */
const VISIBLE_MS = 7_000;

/**
 * A short status line ("Testnachricht …") that fades out softly after a few
 * seconds and gives its space back. `className` sets spacing, e.g. "pt-2".
 */
export function FadingStatus({ message, className = "" }: { message: string | null; className?: string }) {
  const [hiddenMessage, setHiddenMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) {
      return;
    }
    const timer = window.setTimeout(() => setHiddenMessage(message), VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [message]);

  // Cleared before every new message, so the same text after a new tap
  // shows again.
  if (!message && hiddenMessage !== null) {
    setHiddenMessage(null);
  }
  const visible = Boolean(message) && hiddenMessage !== message;

  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-700 ease-out ${
        visible ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
    >
      <p role="status" className="min-h-0 overflow-hidden">
        {/* Spacing inside, so it collapses along with the text. */}
        <span className={`block text-xs text-muted ${className}`}>{message}</span>
      </p>
    </div>
  );
}
