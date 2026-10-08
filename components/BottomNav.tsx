type BottomNavProps = {
  onRefresh: () => void;
  refreshing: boolean;
};

export function BottomNav({ onRefresh, refreshing }: BottomNavProps) {
  return (
    <nav className="sticky bottom-4 z-20">
      <div className="mx-auto flex max-w-[12rem] rounded-full border border-white/65 bg-white/85 p-2 shadow-[0_18px_45px_rgba(18,41,39,0.14)] backdrop-blur">
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-80"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className={`size-4 ${refreshing ? "animate-spin" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
          >
            <path d="M20 12a8 8 0 1 1-2.34-5.66" />
            <path d="M20 4v5h-5" />
          </svg>
          {refreshing ? "Lädt …" : "Aktualisieren"}
        </button>
      </div>
    </nav>
  );
}
