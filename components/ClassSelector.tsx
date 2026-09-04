type ClassSelectorProps = {
  classes: string[];
  selectedClass: string;
  onChange: (value: string) => void;
};

export function ClassSelector({
  classes,
  selectedClass,
  onChange,
}: ClassSelectorProps) {
  return (
    <section className="rounded-[1.75rem] border border-line bg-card p-4 shadow-[0_18px_45px_rgba(18,41,39,0.08)] backdrop-blur">
      <label
        htmlFor="class-selector"
        className="text-xs font-semibold uppercase tracking-[0.22em] text-muted"
      >
        Meine Klasse
      </label>
      <div className="mt-3">
        <select
          id="class-selector"
          value={selectedClass}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none rounded-[1.15rem] border border-line bg-white px-4 py-4 text-lg font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] outline-none transition focus:border-accent/35 focus:ring-4 focus:ring-accent/10"
        >
          {classes.length === 0 ? (
            <option value="">Keine Klassen gefunden</option>
          ) : null}
          {classes.map((className) => (
            <option key={className} value={className}>
              {className}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
