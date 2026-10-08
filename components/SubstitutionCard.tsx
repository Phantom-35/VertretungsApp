import {
  entryKindHints,
  formatClassName,
  formatLesson,
  getEntryKind,
  type EntryKind,
} from "@/lib/entries";
import type { SubstitutionEntry } from "@/lib/types";

type SubstitutionCardProps = {
  entry: SubstitutionEntry;
  /** Shown when the entry targets a group like "6ABCD" instead of just the class. */
  showClassName: boolean;
};

const kindStyles: Record<EntryKind, string> = {
  cancelled: "bg-warn-soft text-warn border-warn/15",
  "self-study": "bg-warn-soft text-warn border-warn/15",
  exam: "bg-[#ece6f7] text-[#5b3f8f] border-[#5b3f8f]/15",
  event: "bg-[#e3eef9] text-[#2c5a86] border-[#2c5a86]/15",
  room: "bg-stone-100 text-stone-700 border-stone-700/10",
  substitution: "bg-accent-soft text-accent-strong border-accent/10",
};

function TeacherLine({ teacher, substitute }: { teacher: string; substitute: string }) {
  if (!teacher && !substitute) {
    return null;
  }

  if (!substitute || substitute === teacher) {
    return (
      <p className="text-sm text-foreground">
        <span className="text-muted">Lehrer </span>
        {substitute ? (
          <span className="font-semibold">{substitute}</span>
        ) : (
          <span className="font-semibold text-muted line-through">{teacher}</span>
        )}
      </p>
    );
  }

  return (
    <p className="text-sm text-foreground">
      <span className="text-muted">Lehrer </span>
      {teacher ? (
        <>
          <span className="text-muted line-through">{teacher}</span>
          <span aria-label="wird vertreten durch" className="px-1 text-muted">
            →
          </span>
        </>
      ) : null}
      <span className="font-semibold">{substitute}</span>
    </p>
  );
}

export function SubstitutionCard({ entry, showClassName }: SubstitutionCardProps) {
  const kind = getEntryKind(entry.type);
  const hint = entryKindHints[kind];

  return (
    <article className="flex gap-4 rounded-[1.6rem] border border-white/65 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(252,249,243,0.92))] p-4 shadow-[0_18px_40px_rgba(18,41,39,0.08)]">
      <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-[1.15rem] bg-accent-soft/70 py-3 text-accent-strong">
        <span className="text-[0.62rem] font-semibold uppercase tracking-[0.18em]">
          Std.
        </span>
        <span className="mt-0.5 text-2xl font-semibold tracking-[-0.04em]">
          {entry.lesson ? formatLesson(entry.lesson) : "?"}
        </span>
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${kindStyles[kind]}`}
          >
            {entry.type || "Änderung"}
          </span>
          {showClassName ? (
            <span className="text-xs font-medium text-muted">
              {formatClassName(entry.className)}
            </span>
          ) : null}
        </div>

        {hint ? <p className="text-sm font-medium text-foreground">{hint}</p> : null}

        {entry.subject ? (
          <p className="text-sm text-foreground">
            <span className="text-muted">Fach </span>
            <span className="font-semibold">{entry.subject}</span>
          </p>
        ) : null}

        <TeacherLine teacher={entry.teacher} substitute={entry.substitute} />

        {entry.room ? (
          <p className="text-sm text-foreground">
            <span className="text-muted">Raum </span>
            <span className="font-semibold">{entry.room}</span>
          </p>
        ) : null}

        {entry.text ? (
          <p className="rounded-xl bg-background-soft px-3 py-2 text-sm leading-5 text-foreground">
            {entry.text}
          </p>
        ) : null}
      </div>
    </article>
  );
}
