type SegmentedProps<T extends string | number> = {
  name: string;
  /** Read out by screen readers; shown by the surrounding setting. */
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

/** A row of mutually exclusive choices (radio buttons styled as pills). */
export function Segmented<T extends string | number>({
  name,
  label,
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{label}</legend>
      {/* Wraps onto a second row when the labels do not fit (large text on a
          small phone) instead of cutting them off. */}
      <div className="flex w-full flex-wrap gap-y-1 rounded-[1.4rem] border border-line bg-card p-1">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <label
              key={String(option.value)}
              className={`flex-auto cursor-pointer whitespace-nowrap rounded-full px-2 py-1.5 text-center text-xs font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40 ${
                active ? "bg-accent text-white" : "text-muted"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={String(option.value)}
                checked={active}
                onChange={() => onChange(option.value)}
                // Safari must not restore an old choice when the app starts.
                autoComplete="off"
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
