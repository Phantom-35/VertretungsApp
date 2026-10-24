export function LoadingState() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="motion-safe:animate-pulse rounded-[1.75rem] border border-line bg-surface/70 p-5 shadow-[0_18px_45px_rgba(18,41,39,0.06)]"
        >
          <div className="h-3 w-24 rounded-full bg-accent/10" />
          <div className="mt-4 h-7 w-40 rounded-full bg-accent/12" />
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="h-16 rounded-2xl bg-surface-muted" />
            <div className="h-16 rounded-2xl bg-surface-muted" />
            <div className="h-16 rounded-2xl bg-surface-muted" />
            <div className="h-16 rounded-2xl bg-surface-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
