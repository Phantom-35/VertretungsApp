import { Switch } from "@/components/Switch";
import { useSettings } from "@/hooks/useSettings";
import { EVENING_SUMMARY_HOUR, MORNING_SUMMARY_HOUR } from "@/lib/notify";

/**
 * The daily overviews by notification (evening for tomorrow, morning for
 * today). Off by default: they come every school day, also without changes.
 */
export function SummarySwitches({ id }: { id?: string }) {
  const [settings, updateSettings] = useSettings();
  return (
    <div id={id} className="scroll-mt-24 divide-y divide-line rounded-2xl border border-line bg-card">
      <Switch
        label="Abends Überblick für morgen"
        hint={`Um ${EVENING_SUMMARY_HOUR} Uhr vor jedem Schultag, sobald der Plan da ist – auch wenn sich nichts ändert.`}
        checked={settings.eveningSummary}
        onChange={(eveningSummary) => updateSettings({ eveningSummary })}
      />
      <Switch
        label="Morgens Überblick für heute"
        hint={`Um ${MORNING_SUMMARY_HOUR} Uhr an jedem Schultag – auch wenn sich nichts ändert.`}
        checked={settings.morningSummary}
        onChange={(morningSummary) => updateSettings({ morningSummary })}
      />
    </div>
  );
}
