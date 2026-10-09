import {
  entryKindHints,
  formatClassName,
  formatLesson,
  getEntryKind,
  isOpenSubstitute,
  type EntryKind,
} from "@/lib/entries";
import type { SubstitutionEntry } from "@/lib/types";

type SubstitutionCardProps = {
  entry: SubstitutionEntry;
  /** Shown when the entry targets a group like "6ABCD" instead of just the class. */
  showClassName: boolean;
  /** Added or changed since the user last opened the app. */
  isNew?: boolean;
  /** Smaller, for days with many changes. */
  compact?: boolean;
};

export const kindStyles: Record<EntryKind, string> = {
  cancelled: "bg-warn-soft text-warn border-warn/15",
  "self-study": "bg-warn-soft text-warn border-warn/15",
  exam: "bg-[#ece6f7] text-[#5b3f8f] border-[#5b3f8f]/15 dark:bg-[#2b2540] dark:text-[#cdb9f2] dark:border-[#cdb9f2]/20",
  event: "bg-[#e3eef9] text-[#2c5a86] border-[#2c5a86]/15 dark:bg-[#1d2c3d] dark:text-[#a9cdf2] dark:border-[#a9cdf2]/20",
  moved: "bg-[#e8e7f8] text-[#3f3d8f] border-[#3f3d8f]/15 dark:bg-[#26264a] dark:text-[#c3c1f5] dark:border-[#c3c1f5]/20",
  supervision: "bg-[#eef0e0] text-[#58602a] border-[#58602a]/15 dark:bg-[#2b2f1c] dark:text-[#d3db9c] dark:border-[#d3db9c]/20",
  room: "bg-surface-muted text-foreground/80 border-line",
  substitution: "bg-accent-soft text-accent-strong border-accent/10",
};

function TeacherLine({ teacher, substitute }: { teacher: string; substitute: string }) {
  if (!teacher && !substitute) {
    return null;
  }

  // "???" in the plan: the lesson takes place, but nobody has been found yet.
  if (isOpenSubstitute(substitute)) {
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
        <span className="font-semibold text-warn">noch offen</span>
      </p>
    );
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

export function SubstitutionCard({ entry, showClassName, isNew = false, compact = false }: SubstitutionCardProps) {
  const kind = getEntryKind(entry.type);
  const hint = entryKindHints[kind];
  // A cancelled lesson is what students look for first: make it stand out.
  const cancelled = kind === "cancelled";

  return (
    <article
      className={`flex border bg-[linear-gradient(180deg,var(--entry-from),var(--entry-to))] ${
        compact
          ? "gap-3 rounded-[1.3rem] p-3 shadow-[0_10px_24px_rgba(18,41,39,0.07)]"
          : "gap-4 rounded-[1.6rem] p-4 shadow-[0_18px_40px_rgba(18,41,39,0.08)]"
      } ${cancelled ? "border-warn/40" : "border-edge"}`}
    >
      <div
        className={`flex shrink-0 flex-col items-center justify-center ${
          compact ? "w-13 rounded-[0.95rem] py-2" : "w-16 rounded-[1.15rem] py-3"
        } ${cancelled ? "bg-warn-soft text-warn" : "bg-accent-soft/70 text-accent-strong"}`}
      >
        <span className="text-[0.62rem] font-semibold uppercase tracking-[0.18em]">
          Std.
        </span>
        <span
          className={`mt-0.5 font-semibold tracking-[-0.04em] ${compact ? "text-xl" : "text-2xl"} ${
            cancelled ? "line-through decoration-2" : ""
          }`}
        >
          {entry.lesson ? formatLesson(entry.lesson) : "?"}
        </span>
      </div>

      <div className={`min-w-0 flex-1 ${compact ? "space-y-1" : "space-y-2"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${kindStyles[kind]}`}
          >
            {entry.type || "Änderung"}
          </span>
          {isNew ? (
            <span className="rounded-full bg-accent px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-white">
              Neu
            </span>
          ) : null}
          {showClassName ? (
            <span className="text-xs font-medium text-muted">
              {formatClassName(entry.className)}
            </span>
          ) : null}
        </div>

        {hint ? (
          <p
            className={`text-sm ${cancelled ? "font-semibold text-warn" : "font-medium text-foreground"}`}
          >
            {hint}
          </p>
        ) : null}

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
