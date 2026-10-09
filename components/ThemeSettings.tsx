import { useTheme } from "@/hooks/useTheme";
import type { ThemePreference } from "@/lib/theme";

/** Sun/moon button in the header: switches between light and dark. */
export function ThemeToggle() {
  const { resolved, setPreference } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setPreference(next)}
      aria-label={next === "dark" ? "Dunkles Design" : "Helles Design"}
      title={next === "dark" ? "Dunkles Design" : "Helles Design"}
      className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface/70 text-foreground transition active:scale-95"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="size-[1.15rem]"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {next === "dark" ? (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        )}
      </svg>
    </button>
  );
}

const options: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Automatisch" },
  { value: "light", label: "Hell" },
  { value: "dark", label: "Dunkel" },
];

/** Full choice incl. "follow the system", at the end of the page. */
export function ThemeChoice() {
  const { preference, setPreference } = useTheme();

  return (
    <fieldset className="flex items-center justify-between gap-3 px-1">
      <legend className="sr-only">Darstellung</legend>
      <span aria-hidden className="text-sm text-muted">
        Darstellung
      </span>
      <div className="flex rounded-full border border-line bg-card p-1">
        {options.map((option) => {
          const active = preference === option.value;
          return (
            <label
              key={option.value}
              className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40 ${
                active ? "bg-accent text-white" : "text-muted"
              }`}
            >
              <input
                type="radio"
                name="theme"
                value={option.value}
                checked={active}
                onChange={() => setPreference(option.value)}
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
