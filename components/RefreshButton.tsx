type RefreshButtonProps = {
  onRefresh: () => void;
  refreshing: boolean;
};

/** Small round button in the corner, so it does not cover the plan. */
export function RefreshButton({ onRefresh, refreshing }: RefreshButtonProps) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={refreshing}
      aria-label={refreshing ? "Wird aktualisiert" : "Aktualisieren"}
      title="Aktualisieren"
      className="fab-enter fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,calc((100vw-28rem)/2+1rem))] z-20 flex size-14 items-center justify-center rounded-full bg-accent text-white shadow-[0_12px_30px_rgba(18,41,39,0.28)] transition hover:bg-accent-strong active:scale-95 disabled:opacity-85 dark:hover:bg-accent/85"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className={`size-6 ${refreshing ? "animate-spin" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
      >
        <path d="M20 12a8 8 0 1 1-2.34-5.66" />
        <path d="M20 4v5h-5" />
      </svg>
    </button>
  );
}
