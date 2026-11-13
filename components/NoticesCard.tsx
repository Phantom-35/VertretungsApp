import { noticeLayout } from "@/lib/notices";

type NoticesCardProps = {
  notices: string[];
};

export function NoticesCard({ notices }: NoticesCardProps) {
  if (notices.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[1.5rem] border border-line bg-surface/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
        Nachrichten zum Tag
      </p>
      <div className="mt-3 space-y-3">
        {notices.map((notice) => {
          const { heading, lines } = noticeLayout(notice);
          return (
            <div key={notice} className="text-sm leading-5 text-foreground">
              {heading ? <p className="font-semibold">{heading}</p> : null}
              {lines.length > 0 ? (
                <ul className={heading ? "mt-1.5 space-y-1" : "space-y-1"}>
                  {lines.map((line, index) => (
                    <li
                      key={index}
                      className={
                        heading
                          ? "relative pl-3 before:absolute before:left-0 before:top-[0.55rem] before:size-1 before:rounded-full before:bg-muted"
                          : undefined
                      }
                    >
                      {line.label ? <span className="font-semibold">{line.label}: </span> : null}
                      {line.text}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
