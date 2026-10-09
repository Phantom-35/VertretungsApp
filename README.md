# KAG Vertretungsplan

Mobile Web-App für den Vertretungsplan des Konrad-Adenauer-Gymnasiums Meckenheim.
Sie liest die Untis-Seiten der Schule (`subst_001.htm`, …), filtert sie nach Klasse
bzw. Kursen und funktioniert als installierte Home-Bildschirm-App auch offline.

## Entwickeln

```bash
npm install
npm run dev          # http://localhost:3000
```

## Prüfen

```bash
npm test             # Unit-Tests (Parser, Abruf, Logik)
npm run lint
npx tsc --noEmit
npm run build
npm run test:e2e     # Browser-Tests gegen den Build, mit gespeicherten Untis-Seiten
npm run check:live   # Liest den echten Plan der Schule und prüft ihn
```

Die CI (`.github/workflows/ci.yml`) führt all das bei jedem Push aus (außer `check:live`).

## Einstellungen (Umgebungsvariablen)

| Variable | Zweck |
| --- | --- |
| `SUBSTITUTION_BASE_URL` | Andere Quelle für die Untis-Seiten, z. B. für Tests. Standard: die Seite der Schule. |
| `ALERT_WEBHOOK_URL` | Optional. Bekommt eine Nachricht, wenn der Plan nicht mehr vollständig gelesen werden kann (z. B. weil Untis das Format geändert hat) und wenn das Problem wieder behoben ist. Geht mit einem [ntfy.sh](https://ntfy.sh)-Thema (Push aufs Handy, ohne Konto, z. B. `https://ntfy.sh/ein-geheimer-name`), einem Discord- oder einem Slack-Webhook. |

## Überwachung

`GET /api/health` antwortet mit **200**, solange der Plan vollständig gelesen wird, und
sonst mit **503** und den Gründen (`problems`). Ein kostenloser Uptime-Dienst
(z. B. UptimeRobot) kann diese Adresse alle paar Minuten abfragen und meldet sich,
wenn etwas nicht stimmt, auch wenn die Schulseite ganz ausfällt.

Zusätzlich liest `.github/workflows/live-check.yml` montags bis freitags früh
den echten Plan. Schlägt das fehl (auch nach einem zweiten Versuch zehn Minuten
später), schickt GitHub eine E-Mail. Von Hand starten: GitHub → Actions →
Live-Check → „Run workflow“. GitHub pausiert geplante Abläufe, wenn 60 Tage lang
nichts ins Repository gepusht wurde; dann dort wieder aktivieren.
