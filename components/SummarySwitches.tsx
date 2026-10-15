import { Segmented } from "@/components/Segmented";
import { Switch } from "@/components/Switch";
import { useSettings } from "@/hooks/useSettings";
import { EVENING_SUMMARY_TIMES, MORNING_SUMMARY_TIMES, summaryTimeLabel } from "@/lib/notify";

const eveningOptions = EVENING_SUMMARY_TIMES.map((time) => ({ value: time, label: summaryTimeLabel(time) }));
const morningOptions = MORNING_SUMMARY_TIMES.map((time) => ({ value: time, label: summaryTimeLabel(time) }));

/**
 * The daily overviews by notification (evening for tomorrow, morning for
 * today). Off by default: they come every school day, also without changes.
 * The time to choose only appears once one is switched on, to keep it short.
 */
export function SummarySwitches({ id, name }: {
  id?: string;
  /** Distinct per place, as the sheet and the introduction can both be on the page. */
  name: string;
}) {
  const [settings, updateSettings] = useSettings();
  return (
    <div id={id} className="scroll-mt-24 divide-y divide-line rounded-2xl border border-line bg-card">
      <div>
        <Switch
          label="Abends Überblick für morgen"
          hint={`Um ${summaryTimeLabel(settings.eveningSummaryTime)} vor jedem Schultag, sobald der Plan da ist – auch wenn sich nichts ändert.`}
          checked={settings.eveningSummary}
          onChange={(eveningSummary) => updateSettings({ eveningSummary })}
        />
        {settings.eveningSummary ? (
          <div className="px-4 pb-3">
            <Segmented
              name={`${name}-evening-time`}
              label="Uhrzeit des Überblicks am Abend"
              options={eveningOptions}
              value={settings.eveningSummaryTime}
              onChange={(eveningSummaryTime) => updateSettings({ eveningSummaryTime })}
            />
          </div>
        ) : null}
      </div>
      <div>
        <Switch
          label="Morgens Überblick für heute"
          hint={`Um ${summaryTimeLabel(settings.morningSummaryTime)} an jedem Schultag – auch wenn sich nichts ändert.`}
          checked={settings.morningSummary}
          onChange={(morningSummary) => updateSettings({ morningSummary })}
        />
        {settings.morningSummary ? (
          <div className="px-4 pb-3">
            <Segmented
              name={`${name}-morning-time`}
              label="Uhrzeit des Überblicks am Morgen"
              options={morningOptions}
              value={settings.morningSummaryTime}
              onChange={(morningSummaryTime) => updateSettings({ morningSummaryTime })}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
