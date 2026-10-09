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
      <div className="flex w-full rounded-full border border-line bg-card p-1">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <label
              key={String(option.value)}
              className={`flex-1 cursor-pointer rounded-full px-2 py-1.5 text-center text-xs font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40 ${
                active ? "bg-accent text-white" : "text-muted"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={String(option.value)}
                checked={active}
                onChange={() => onChange(option.value)}
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
