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
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`, Upstash-Variablen | Benachrichtigungen, siehe unten. |
| `NEXT_PUBLIC_IMPRESSUM_URL`, `NEXT_PUBLIC_DATENSCHUTZ_URL` | Optional. Links zu Impressum und Datenschutzerklärung auf einer eigenen Website, unten in den Einstellungen („Über die App“). Ohne Wert erscheinen sie nicht. Nach dem Eintragen einmal neu deployen. |
| `ALERT_WEBHOOK_URL` | Optional. Bekommt eine Nachricht, wenn der Plan nicht mehr vollständig gelesen werden kann (z. B. weil Untis das Format geändert hat) und wenn das Problem wieder behoben ist, außerdem wenn Benachrichtigungen bei keinem Gerät ankommen. Geht mit einem [ntfy.sh](https://ntfy.sh)-Thema (Push aufs Handy, ohne Konto, z. B. `https://ntfy.sh/ein-geheimer-name`), einem Discord- oder einem Slack-Webhook. |

## Überwachung

`GET /api/health` antwortet mit **200**, solange der Plan vollständig gelesen wird (und,
wenn Benachrichtigungen eingerichtet sind, der Push-Check in den letzten 30 Minuten lief),
und sonst mit **503** und den Gründen (`problems`). Ein kostenloser Uptime-Dienst
(z. B. UptimeRobot) kann diese Adresse alle paar Minuten abfragen und meldet sich,
wenn etwas nicht stimmt, auch wenn die Schulseite ganz ausfällt.

Zusätzlich liest `.github/workflows/live-check.yml` montags bis freitags früh
den echten Plan. Schlägt das fehl (auch nach einem zweiten Versuch zehn Minuten
später), schickt GitHub eine E-Mail. Von Hand starten: GitHub → Actions →
Live-Check → „Run workflow“. GitHub pausiert geplante Abläufe, wenn 60 Tage lang
nichts ins Repository gepusht wurde; dann dort wieder aktivieren.

## Ferien und Feiertage

`lib/holidays.ts` enthält die NRW-Ferien laut Ferienordnung bis Ostern 2030 (danach
ergänzen) und berechnet die gesetzlichen Feiertage in NRW selbst. Liegt für die kommenden
Tage noch kein Plan vor, zeigt die App an solchen Tagen (samt angrenzendem Wochenende)
eine Ferien- bzw. Feiertagskarte statt des alten Plans. Bewegliche Ferientage der Schule
sind nicht enthalten.

## Weitergeben und Nutzungszahlen

`/teilen` zeigt einen QR-Code zur App (auch druckbar als Aushang); erreichbar über die
Einstellungen. Auf Vercel zählt **Web Analytics** anonyme Seitenaufrufe ohne Cookies
(Vercel → Projekt → Analytics → Enable). Die Startseite erscheint dort als `/app`
(vom Home-Bildschirm geöffnet) bzw. `/browser`.

## Benachrichtigungen (Web-Push)

Die App schickt eine Mitteilung aufs Handy, sobald sich der Plan für die gewählte Klasse
(in der Oberstufe: für die gewählten Lehrkräfte) ändert, auch wenn die App geschlossen ist.

**Was gemeldet wird:** neue Einträge, geänderte Einträge („Jetzt: Entfall (vorher
Vertretung)“) und zurückgenommene Einträge, jeweils für heute (bis 16 Uhr) und die
kommenden Tage. Mehrere Änderungen auf einmal kommen als eine Mitteilung. Lädt die Schule
später am Tag erneut hoch, wird nur gemeldet, was sich seitdem geändert hat. Von 21 bis
6 Uhr wird nichts gesendet; was nachts dazukommt, kommt um 6 Uhr gesammelt.
Ein unvollständig gelesener Plan wird nie verglichen, und ein Eintrag gilt erst als
zurückgenommen, wenn er bei zwei Prüfungen hintereinander fehlt.

In den Einstellungen lässt sich wählen, worüber benachrichtigt wird (Ausfälle & EVA,
Vertretungen & Betreuung, Raumänderungen & Verlegungen, Klausuren & Veranstaltungen),
und ein **Überblick für morgen** einschalten: um 19 Uhr vor jedem Schultag (So–Do), sobald
der Plan für den nächsten Tag veröffentlicht ist, auch wenn sich nichts ändert. Ebenso ein
**Überblick für heute** um 6 Uhr an jedem Schultag. Änderungen am Tag eines Überblicks, die
in derselben Prüfung gefunden werden, stehen nur im Überblick (keine doppelte Mitteilung).
Die Zahl am App-Symbol zählt die Änderungen, die seit dem letzten Öffnen gemeldet wurden.

## Abhängigkeiten aktuell halten

`.github/dependabot.yml` lässt GitHub wöchentlich Update-Pull-Requests öffnen, die die CI
prüft. Für Sicherheits-Updates zusätzlich unter *Settings → Code security*
„Dependabot alerts“ und „Dependabot security updates“ einschalten.

**iPhone/iPad:** ab iOS 16.4, nur in der App auf dem Home-Bildschirm (in Safari „Teilen“ →
„Zum Home-Bildschirm“, dann die App von dort öffnen und unter „Meine Klasse“ →
„Benachrichtigungen“ einschalten).

### Einrichten

1. **Redis:** In Vercel unter *Storage* (bzw. *Marketplace*) „Upstash for Redis“ anlegen und
   mit dem Projekt verbinden. Die Variablen `KV_REST_API_URL`/`KV_REST_API_TOKEN`
   (oder `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`) setzt Vercel dabei selbst.
2. **VAPID-Schlüssel** einmalig erzeugen: `npx web-push generate-vapid-keys` und in Vercel
   als Umgebungsvariablen eintragen:
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
   - optional `VAPID_SUBJECT` (z. B. `mailto:name@example.com`; Standard ist die Adresse der App)
3. **`CRON_SECRET`** in Vercel setzen: ein langes Zufallswort, z. B. `openssl rand -hex 32`.
4. **Neu deployen**, damit die Variablen wirken.
5. **Zeitplan:** In GitHub unter *Settings → Secrets and variables → Actions*
   - Variable `APP_URL`, z. B. `https://<projekt>.vercel.app`
   - Secret `CRON_SECRET`, derselbe Wert wie in Vercel

   Dann ruft `.github/workflows/push-check.yml` die Prüfung `/api/push/check` werktags
   alle 10 Minuten auf (am Wochenende alle 30). Von Hand: *Actions → Push-Check → Run workflow*.
   GitHub startet geplante Läufe manchmal einige Minuten später; wer es pünktlicher braucht,
   kann `/api/push/check` zusätzlich von einem Dienst wie cron-job.org aufrufen lassen
   (Header `Authorization: Bearer <CRON_SECRET>`).

Gespeichert werden nur die Push-Adresse des Geräts, die gewählte Klasse und die
Lehrkräfte-Kürzel. Ausschalten in der App löscht den Eintrag.
