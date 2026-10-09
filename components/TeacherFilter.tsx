import { useState, type FormEvent } from "react";
import { normalizeTeacher } from "@/lib/entries";

type TeacherFilterProps = {
  schoolClass: string;
  /** Teachers of the student's courses; empty means "show everything". */
  selected: readonly string[];
  /** Teachers appearing in the current plan for this class, as suggestions. */
  suggestions: string[];
  onChange: (teachers: string[]) => void;
};

/**
 * Upper-school students attend courses, not one class. The plan has no subject
 * column, so courses are recognised by their teacher.
 */
export function TeacherFilter({ schoolClass, selected, suggestions, onChange }: TeacherFilterProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);

  const choices = Array.from(new Set([...selected, ...suggestions])).sort((left, right) =>
    left.localeCompare(right, "de-DE"),
  );

  const toggle = (teacher: string) => {
    onChange(
      selected.includes(teacher)
        ? selected.filter((item) => item !== teacher)
        : [...selected, teacher],
    );
  };

  const add = (event: FormEvent) => {
    event.preventDefault();
    const teacher = normalizeTeacher(draft);
    if (!teacher) {
      setInvalid(true);
      return;
    }
    if (!selected.includes(teacher)) {
      onChange([...selected, teacher]);
    }
    setDraft("");
    setInvalid(false);
  };

  return (
    <div className="mt-4 border-t border-line pt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-xs font-semibold uppercase tracking-[0.22em] text-muted">
            Meine Lehrkräfte
          </span>
          <span className="mt-1 block truncate text-sm font-medium text-foreground">
            {selected.length > 0
              ? [...selected].sort((left, right) => left.localeCompare(right, "de-DE")).join(", ")
              : `Alle Kurse der ${schoolClass}`}
          </span>
        </span>
        <span className="shrink-0 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-accent-strong">
          {open ? "Fertig" : "Ändern"}
        </span>
      </button>

      {open ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm leading-5 text-muted">
            Wähle die Lehrkräfte deiner Kurse. Dann siehst du nur noch deren Änderungen.
            Einträge ohne Lehrkraft werden immer angezeigt.
          </p>

          {choices.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {choices.map((teacher) => {
                const active = selected.includes(teacher);
                return (
                  <button
                    key={teacher}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggle(teacher)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                      active
                        ? "border-accent bg-accent text-white"
                        : "border-line bg-surface text-foreground"
                    }`}
                  >
                    {teacher}
                  </button>
                );
              })}
            </div>
          ) : null}

          <form onSubmit={add} className="flex gap-2">
            <label htmlFor="teacher-input" className="sr-only">
              Kürzel einer Lehrkraft
            </label>
            <input
              id="teacher-input"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setInvalid(false);
              }}
              maxLength={4}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="Kürzel, z. B. RUK"
              aria-invalid={invalid}
              aria-describedby={invalid ? "teacher-input-error" : undefined}
              className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold uppercase text-foreground outline-none placeholder:font-normal placeholder:normal-case placeholder:text-muted focus:border-accent/35 focus:ring-4 focus:ring-accent/10"
            />
            <button
              type="submit"
              className="shrink-0 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white"
            >
              Hinzufügen
            </button>
          </form>
          {invalid ? (
            <p id="teacher-input-error" className="text-xs text-warn">
              Bitte ein Kürzel aus 2–4 Buchstaben eingeben.
            </p>
          ) : null}

          {selected.length > 0 ? (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-sm font-semibold text-accent-strong underline underline-offset-2"
            >
              Filter aufheben, alle Kurse zeigen
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
