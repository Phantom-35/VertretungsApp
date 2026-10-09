import { useState, type FormEvent } from "react";
import { normalizeTeacher } from "@/lib/entries";

const sortTeachers = (teachers: readonly string[]) =>
  [...teachers].sort((left, right) => left.localeCompare(right, "de-DE"));

type TeacherHintProps = {
  schoolClass: string;
  selected: readonly string[];
  onOpenSettings: () => void;
};

/**
 * Upper school, on the main page: which teachers' courses are shown. The
 * choice itself is made in the settings.
 */
export function TeacherHint({ schoolClass, selected, onOpenSettings }: TeacherHintProps) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
          Meine Lehrkräfte
        </p>
        <p className="mt-1 truncate text-sm font-medium text-foreground">
          {selected.length > 0 ? sortTeachers(selected).join(", ") : `Alle Kurse der ${schoolClass}`}
        </p>
      </div>
      <button
        type="button"
        onClick={onOpenSettings}
        aria-haspopup="dialog"
        className="shrink-0 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-accent-strong"
      >
        {selected.length > 0 ? "Ändern" : "Festlegen"}
      </button>
    </div>
  );
}

type TeacherChooserProps = {
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
export function TeacherChooser({ schoolClass, selected, suggestions, onChange }: TeacherChooserProps) {
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);

  const choices = sortTeachers(Array.from(new Set([...selected, ...suggestions])));

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
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">
        {selected.length > 0
          ? `Gezeigt werden die Kurse von ${sortTeachers(selected).join(", ")}.`
          : `Gezeigt werden alle Kurse der ${schoolClass}.`}
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
          Auswahl aufheben, alle Kurse zeigen
        </button>
      ) : null}
    </div>
  );
}
