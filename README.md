# KAG Vertretungsplan

Web-App für den Vertretungsplan des Konrad-Adenauer-Gymnasiums Meckenheim.

- **Live:** https://vertretung-kag.vercel.app
- **Impressum, Datenschutz, Hilfe:** https://support-vertretung-kag.vercel.app (eigenes Repository)

Die App liest die öffentlichen Untis-Seiten der Schule (`subst_001.htm`, …) und zeigt
nur die Einträge der eigenen Klasse, in der Oberstufe die der gewählten Kurse
(über die Kürzel der Lehrkräfte). Sie lässt sich auf den Home-Bildschirm legen, öffnet
auch offline mit dem zuletzt geladenen Plan und meldet Änderungen per Benachrichtigung.

**Quelle:** immer `monitor2020.meckenheim-kag.com/schueler/`. Nur wenn dort die erste
Seite nicht kommt, nimmt die App als Notlösung die zweite Kopie der Schule
(`vertretung.meckenheim-kag.com`), ohne die beiden zu vergleichen; beim nächsten Abruf
wird wieder monitor2020 versucht. Jeden Wechsel (ausgefallen / wieder da) meldet sie nur
dem Betreiber über `FEEDBACK_WEBHOOK_URL` (sonst `ALERT_WEBHOOK_URL`); `/api/health`
nennt die aktive Notlösung unter `notes` (`lib/scraper.ts`, `lib/source-switch.ts`).

## Inhalt

- [Für Nutzerinnen und Nutzer](#für-nutzerinnen-und-nutzer)
- [Wie die App aufgebaut ist](#wie-die-app-aufgebaut-ist)
- [Benachrichtigungen](#benachrichtigungen)
- [Betrieb](#betrieb): Einrichten, Umgebungsvariablen, Überwachung
- [Entwickeln und prüfen](#entwickeln-und-prüfen)
- [Pflege](#pflege)
- [Gespeicherte Daten](#gespeicherte-daten)

## Für Nutzerinnen und Nutzer

1. https://vertretung-kag.vercel.app öffnen und die Klasse wählen (Q1/Q2: zusätzlich
   die Kürzel der eigenen Lehrkräfte).
2. Die App auf den Home-Bildschirm legen. Die Einführung beim ersten Start zeigt, wie
   das auf dem jeweiligen Gerät geht:
   - **iPhone/iPad:** in Safari „Teilen“ → „Zum Home-Bildschirm“, dann die App von dort
     öffnen. Benachrichtigungen gibt es nur so (ab iOS 16.4).
   - **Android:** im Browser-Menü „Installieren“, „App installieren“ oder „Zum Startbildschirm hinzufügen“.
3. Optional: Benachrichtigungen einschalten, in der Einführung oder unter Einstellungen.

Weitergeben: Unter `/teilen` (auch über die Einstellungen erreichbar) gibt es einen
QR-Code zur App, der sich als Aushang drucken lässt.

## Wie die App aufgebaut ist

| Teil | Wo | Aufgabe |
| --- | --- | --- |
| Plan lesen | `lib/scraper.ts`, `lib/parser.ts`, `lib/cache.ts` | Lädt alle Untis-Seiten, liest Tage, Einträge und Mitteilungen, prüft das Ergebnis auf Plausibilität. Ist die Schulseite nicht erreichbar, wird der zuletzt gelesene Plan mit einem Hinweis gezeigt. |
| Schnittstelle | `app/api/substitution` | Liefert den gelesenen Plan an die App. |
| Oberfläche | `app/page.tsx`, `components/`, `hooks/` | Startseite mit Tagesauswahl, Einstellungen (Übersicht mit Unterseiten), Einführung. Die Versionsnummer steht in `package.json` und wird bei jeder Änderung angehoben (siehe `AGENTS.md`). Auf großen Bildschirmen (PC, Mac, iPad quer) eine eigene Ansicht mit allen Tagen nebeneinander (`components/DesktopView.tsx`); die Handy-Ansicht bleibt davon unberührt. |
| Offline und Updates | `public/sw.js`, `components/PwaRegistrar.tsx` | Der Service Worker öffnet die App sofort aus dem Speicher und lädt im Hintergrund die neue Version. Gibt es ein neues Deployment, lädt die App sich neu, sobald das nicht stört (direkt nach dem Öffnen oder beim Verlassen). |
| Ferien und Feiertage | `lib/holidays.ts` | NRW-Ferien und Feiertage, siehe [Pflege](#pflege). |
| Benachrichtigungen | `lib/push/`, `app/api/push/` | Vergleicht den Plan mit dem letzten Stand und schickt Mitteilungen, siehe unten. |
| Überwachung | `app/api/health`, `lib/alert.ts` | Meldet Probleme, siehe [Überwachung](#überwachung). |

Technik: Next.js 16 (App Router), React 19, Tailwind CSS 4, Cheerio, `web-push`,
Upstash Redis, Vercel (Hosting und Web Analytics).

## Benachrichtigungen

Die App schickt eine Mitteilung aufs Handy, sobald sich der Plan für die gewählte Klasse
bzw. die gewählten Lehrkräfte ändert, auch wenn die App geschlossen ist. Dafür ruft
cron-job.org alle 10 Minuten `POST /api/push/check` auf; die App liest dann den Plan,
vergleicht ihn mit dem letzten Stand und schickt die Mitteilungen.

**Was gemeldet wird**

- Neue, geänderte („❌ Entfall statt Vertretung“) und zurückgenommene Einträge
  („✅ Wieder nach Plan“), für heute (bis 16 Uhr) und die kommenden Tage. Jede Zeile
  beginnt mit einem Symbol für die Art und nennt nur das Wichtige: bei Ausfall und EVA
  wessen Stunde, bei Vertretungen die Lehrkräfte, bei Raumänderungen und Klausuren den
  Raum, bei Veranstaltungen, was stattfindet. Betreffen alle Änderungen einen Tag, steht
  er in der Überschrift.
- Mehrere Änderungen auf einmal kommen als eine Mitteilung. Lädt die Schule später
  erneut hoch, wird nur gemeldet, was sich seitdem geändert hat.
- **Ruhezeit 21–6 Uhr:** Es wird nichts gesendet; was nachts dazukommt, kommt um 6 Uhr
  gesammelt.
- **Schutz vor Fehlalarmen:** Ein unvollständig gelesener Plan wird nie verglichen. Ein
  Eintrag gilt erst als zurückgenommen, wenn er bei zwei Prüfungen hintereinander fehlt.
- Die Zahl am App-Symbol zählt die Änderungen seit dem letzten Öffnen.

**Einstellbar in der App**

- Worüber benachrichtigt wird: Ausfälle & EVA, Vertretungen & Betreuung,
  Raumänderungen & Verlegungen, Klausuren & Veranstaltungen.
- **Überblick für morgen:** vor jedem Schultag um 17, 18, 19 (Voreinstellung) oder
  20 Uhr, sobald der Plan für den nächsten Tag online ist, auch wenn sich nichts ändert.
  Kommt der Plan später, folgt der Überblick sofort danach (bis 21 Uhr).
- **Überblick für heute:** an jedem Schultag um 6:00, 6:30 (Voreinstellung) oder 7:00 Uhr.
- Änderungen für den Tag eines Überblicks, die in derselben Prüfung gefunden werden,
  stehen nur im Überblick (keine doppelte Mitteilung).

## Betrieb

Vercel deployt **automatisch bei jedem Push auf `main`**. Jeder Push ist also sofort
ein Release für alle Nutzer.

Die Serverfunktionen laufen in **Frankfurt** (`fra1`, festgelegt in `vercel.json`): nah an
der Schulseite und an Redis, und so steht es in der Datenschutzerklärung. Wer die Region
ändert, muss auch die Datenschutzerklärung anpassen.

### Einrichten (einmalig)

1. **Redis:** In Vercel unter *Storage* (bzw. *Marketplace*) „Upstash for Redis“ anlegen
   und mit dem Projekt verbinden. Die Zugangsdaten (`KV_REST_API_URL`/`KV_REST_API_TOKEN`)
   setzt Vercel dabei selbst.
2. **VAPID-Schlüssel** erzeugen: `npx web-push generate-vapid-keys`. In Vercel unter
   *Settings → Environment Variables* `VAPID_PUBLIC_KEY` und `VAPID_PRIVATE_KEY`
   eintragen. Die Schlüssel nicht mehr ändern, sonst müssen alle Nutzer die
   Benachrichtigungen neu einschalten.
3. **`CRON_SECRET`** in Vercel setzen: ein langes Zufallswort, z. B. `openssl rand -hex 32`.
4. **Neu deployen** (Vercel → *Deployments* → beim neuesten „⋯“ → *Redeploy*), damit die
   Variablen wirken.
5. **Zeitplan bei cron-job.org:** einen Cronjob anlegen, der alle 10 Minuten
   `https://vertretung-kag.vercel.app/api/push/check` mit der Methode **POST** und dem
   Header `Authorization: Bearer <CRON_SECRET>` aufruft. Auch nachts laufen lassen: Die
   App sendet dann nichts, merkt sich aber, dass die Prüfung läuft.

**Ersatz-Zeitplan über GitHub:** `.github/workflows/push-check.yml` ruft die Prüfung
ebenfalls auf (werktags alle 10 Minuten, am Wochenende alle 30), wenn in GitHub unter
*Settings → Secrets and variables → Actions* die Variable `APP_URL` und das Secret
`CRON_SECRET` gesetzt sind. GitHub startet solche Läufe oft verspätet; neben
cron-job.org ist er nicht nötig. Doppelte Aufrufe schaden nicht, die Prüfung ist
gegen gleichzeitige Läufe gesperrt.

### Umgebungsvariablen

| Variable | Zweck |
| --- | --- |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Pflicht für Benachrichtigungen. |
| `VAPID_SUBJECT` | Optional, z. B. `mailto:name@example.com`. Standard: die Adresse der App. |
| `CRON_SECRET` | Pflicht für Benachrichtigungen; schützt `/api/push/check`. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` (oder `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) | Redis; setzt Vercel beim Verbinden selbst. |
| `ALERT_WEBHOOK_URL` | Optional. Bekommt eine Nachricht, wenn der Plan nicht mehr vollständig gelesen werden kann (z. B. weil Untis das Format geändert hat) und wenn es wieder geht, außerdem wenn Benachrichtigungen bei keinem Gerät ankommen. Geht mit einem [ntfy.sh](https://ntfy.sh)-Thema (Push aufs Handy ohne Konto, z. B. `https://ntfy.sh/ein-geheimer-name`), einem Discord- oder Slack-Webhook. |
| `FEEDBACK_WEBHOOK_URL` | Optional. Bekommt die Nachrichten aus *Einstellungen → Hilfe & Kontakt* (mit Geräte-Angaben, wenn der Nutzer sie nicht abwählt). Am besten ein **geheimes** [ntfy.sh](https://ntfy.sh)-Thema mit langem Zufallsnamen (wie ein Passwort; nur hier und in der eigenen ntfy-App eintragen). Ohne diesen Wert wird `ALERT_WEBHOOK_URL` benutzt; fehlen beide, bietet die App nur E-Mail an. Die Adresse bleibt auf dem Server. |
| `NEXT_PUBLIC_IMPRESSUM_URL`, `NEXT_PUBLIC_DATENSCHUTZ_URL` | Optional. Andere Adressen für Impressum und Datenschutz. Standard: die Seiten auf support-vertretung-kag.vercel.app. Nach dem Ändern neu deployen. |
| `SUBSTITUTION_BASE_URL` | Nur für Tests: andere Quelle für die Untis-Seiten. Standard: die Seite der Schule. |
| `PUSH_STORE=memory` | Nur für Tests: Anmeldungen im Arbeitsspeicher statt in Redis. |

Geheime Werte (Schlüssel, `CRON_SECRET`, Webhook-Adressen) stehen nur in Vercel,
GitHub-Secrets und cron-job.org, niemals im Repository.

### Sicherheit und ältere Geräte

- Jede Seite trägt eine **Content Security Policy** mit einem für jeden Aufruf neuen
  Schlüssel (`proxy.ts`, `lib/csp.ts`): Nur die Skripte der App laufen, eingeschleuster
  Code nicht. Dazu kommen die üblichen Schutz-Header aus `next.config.ts`.
- Next.js 16 braucht **Safari 16.4** bzw. einen aktuellen Chrome, Firefox oder Edge.
  Ältere Geräte (z. B. iPhone 7 mit iOS 15) sehen statt einer kaputten App einen Hinweis
  mit Link zum Plan der Schule (`lib/legacy.ts`).

### Überwachung

- **`GET /api/health`** antwortet mit **200**, solange der Plan vollständig gelesen wird
  und der Push-Check in den letzten 30 Minuten lief, sonst mit **503** und den Gründen
  (`problems`). Ein halbes Jahr bevor die eingetragenen Ferien enden (`lib/holidays.ts`),
  meldet sie das ebenfalls als Problem. Ein kostenloser Uptime-Dienst (z. B. UptimeRobot) kann diese Adresse
  alle paar Minuten abfragen und meldet sich, wenn etwas nicht stimmt, auch wenn die
  Schulseite ganz ausfällt oder cron-job.org nicht mehr aufruft.
- **`ALERT_WEBHOOK_URL`** (siehe oben) meldet Lesefehler und Zustellprobleme von selbst.
- **Live-Check:** `.github/workflows/live-check.yml` liest montags bis freitags früh den
  echten Plan. Schlägt das fehl (auch beim zweiten Versuch zehn Minuten später),
  schickt GitHub eine E-Mail. Von Hand: GitHub → *Actions* → *Live-Check* →
  *Run workflow*. GitHub pausiert geplante Abläufe nach 60 Tagen ohne Push; dann dort
  wieder aktivieren.
- **Nutzungszahlen:** Vercel → Projekt → *Analytics* zählt anonyme Seitenaufrufe ohne
  Cookies. Die Startseite erscheint dort als `/app` (vom Home-Bildschirm geöffnet) bzw.
  `/browser`.

## Entwickeln und prüfen

```bash
npm install
npm run dev                  # http://localhost:3000
```

Vor jedem Commit muss alles grün sein:

```bash
npx tsc --noEmit -p .        # Typen
npm run lint                 # ESLint
npm test                     # Unit-Tests (Vitest, Ordner tests/)
npm run build                # Produktions-Build
npm run test:e2e             # Browser-Tests (Playwright, Ordner e2e/) gegen den Build
npm run test:e2e:container   # dasselbe mit vorinstalliertem Chromium (z. B. Cloud-Container)
npm run check:live           # liest den echten Plan der Schule und prüft ihn
```

Die Browser-Tests laufen gegen gespeicherte Untis-Seiten (`tests/fixtures/`), die
`e2e/fixture-server.mjs` ausliefert. So sehen sie immer denselben Plan. Die CI
(`.github/workflows/ci.yml`) führt bei jedem Push alles außer `check:live` aus.

Ausführliche Arbeitsregeln (auch für KI-Agenten): [`AGENTS.md`](AGENTS.md).

## Pflege

- **Ferien:** `lib/holidays.ts` enthält die NRW-Ferien laut Ferienordnung bis
  **Ostern 2030** und muss vorher ergänzt werden. Gesetzliche Feiertage in NRW berechnet
  die App selbst. Bewegliche Ferientage der Schule sind nicht enthalten. Liegt für
  freie Tage noch kein Plan vor, zeigt die App eine Ferien- bzw. Feiertagskarte – am
  ersten freien Tag erst ab 10 Uhr (vorher wie an einem normalen Samstag). In den
  Schulferien bleibt die Ferienkarte auch dann, wenn der Plan danach schon online ist;
  sie bietet ihn und den letzten Plan vor den Ferien zum Antippen an (gilt bis zum
  nächsten Tag; ein Link aus einer Benachrichtigung öffnet den Plan direkt). Am letzten
  freien Tag zeigt die App ab der Uhrzeit aus „Ab wann den nächsten Schultag zeigen?“ (Standard
  16 Uhr) direkt den Plan für den ersten Schultag, wie an einem normalen Wochenende.
- **Abhängigkeiten:** `.github/dependabot.yml` öffnet wöchentlich Update-Pull-Requests,
  die die CI prüft. Für Sicherheits-Updates in GitHub unter *Settings → Code security*
  „Dependabot alerts“ und „Dependabot security updates“ einschalten.
- **Service Worker:** Ändert sich sein Cache-Verhalten grundlegend, `VERSION` in
  `public/sw.js` erhöhen.

## Gespeicherte Daten

**Auf dem Server (Redis):**

- Je Gerät mit Benachrichtigungen: die Push-Adresse des Geräts, die Klasse, die
  Lehrkräfte-Kürzel und die Benachrichtigungs-Einstellungen (Arten, tägliche Überblicke
  und ihre Uhrzeiten). Ausschalten in der App
  löscht den Eintrag; ungültig gewordene Adressen löscht der Server von selbst.
- Der zuletzt gelesene Plan (für den Vergleich), bei jeder Prüfung überschrieben, sowie
  kleine Verwaltungswerte (z. B. Zeitpunkt der letzten Prüfung).

**Auf dem Gerät:** Klasse, Einstellungen, der zuletzt geladene Plan und welche Einträge
schon gesehen wurden, alles unter Schlüsseln mit `kag:`. „App zurücksetzen …“ in den
Einstellungen löscht sie.

Kommen neue Daten oder Dienste hinzu, muss die Datenschutzerklärung auf der
Support-Website angepasst werden.
