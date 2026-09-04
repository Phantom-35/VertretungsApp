import type { SubstitutionEntry } from "@/lib/types";

type SubstitutionCardProps = {
  entry: SubstitutionEntry;
};

const fieldLabels: Array<{
  key: keyof Pick<
    SubstitutionEntry,
    "type" | "substitute" | "teacher" | "room" | "subject" | "text"
  >;
  label: string;
}> = [
  { key: "type", label: "Art" },
  { key: "substitute", label: "Vertreter" },
  { key: "teacher", label: "Lehrer" },
  { key: "room", label: "Raum" },
  { key: "subject", label: "Fach" },
  { key: "text", label: "Hinweis" },
];

export function SubstitutionCard({ entry }: SubstitutionCardProps) {
  return (
    <article className="rounded-[1.85rem] border border-white/65 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(252,249,243,0.92))] p-5 shadow-[0_22px_50px_rgba(18,41,39,0.09)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
            Stunde
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-foreground">
            {entry.lesson || "Unbekannt"}
          </h2>
          {entry.subject ? (
            <p className="mt-2 text-base font-medium text-accent-strong">
              {entry.subject}
            </p>
          ) : null}
        </div>
        <div className="rounded-full border border-accent/10 bg-accent-soft px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-accent-strong">
          Seite {entry.page}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {fieldLabels.map(({ key, label }) => {
          const value = entry[key];

          if (!value) {
            return null;
          }

          return (
            <div
              key={`${entry.id}-${key}`}
              className="rounded-[1.25rem] border border-line bg-white/70 px-3 py-3"
            >
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted">
                {label}
              </p>
              <p className="mt-1 text-sm font-medium leading-5 text-foreground">
                {value}
              </p>
            </div>
          );
        })}
      </div>
    </article>
  );
}
