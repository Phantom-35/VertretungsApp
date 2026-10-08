import type { DayNotice } from "@/lib/types";

type NoticesCardProps = {
  notices: DayNotice[];
  /** Returns a heading for a date, or null if only one day is shown. */
  getDateLabel: (date: string | null) => string | null;
};

export function NoticesCard({ notices, getDateLabel }: NoticesCardProps) {
  if (notices.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[1.5rem] border border-line bg-white/72 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
        Nachrichten zum Tag
      </p>
      <div className="mt-3 space-y-2">
        {notices.map((notice) => {
          const dateLabel = getDateLabel(notice.date);
          return (
            <p key={`${notice.date}|${notice.text}`} className="text-sm leading-6 text-foreground">
              {dateLabel ? (
                <span className="font-semibold text-muted">{dateLabel}: </span>
              ) : null}
              {notice.text}
            </p>
          );
        })}
      </div>
    </section>
  );
}
