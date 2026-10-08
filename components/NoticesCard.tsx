type NoticesCardProps = {
  notices: string[];
};

export function NoticesCard({ notices }: NoticesCardProps) {
  if (notices.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[1.5rem] border border-line bg-white/72 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
        Nachrichten zum Tag
      </p>
      <div className="mt-3 space-y-2">
        {notices.map((notice) => (
          <p key={notice} className="text-sm leading-6 text-foreground">
            {notice}
          </p>
        ))}
      </div>
    </section>
  );
}
