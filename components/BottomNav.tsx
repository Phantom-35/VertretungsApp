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
          className="w-full rounded-full bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
        >
          {refreshing ? "Laedt..." : "Aktualisieren"}
        </button>
      </div>
    </nav>
  );
}
