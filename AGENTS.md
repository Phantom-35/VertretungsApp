<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Arbeitsregeln für KI-Agenten in diesem Projekt

Diese Regeln gelten für jeden Agenten (Claude Code, Codex, Cursor …), der in diesem
Repository arbeitet. Sie gehen allgemeinen Gewohnheiten vor.

## Das Projekt in Kürze

- **KAG Vertretungsplan**: PWA für den Vertretungsplan des Konrad-Adenauer-Gymnasiums
  Meckenheim. Liest die öffentlichen Untis-Seiten der Schule (`subst_001.htm` …), filtert
  nach Klasse bzw. Oberstufen-Kursen (Lehrkräfte-Kürzel), offline nutzbar, Web-Push.
- Live: https://vertretung-kag.vercel.app – Vercel deployt **automatisch bei jedem Push auf
  `main`**. Ein Push ist also sofort ein Release für alle Nutzer.
- Impressum/Datenschutz liegen auf einer **separaten** Website
  (https://support-vertretung-kag.vercel.app, eigenes Repository); die App verlinkt nur.
- Stack: Next.js 16 (App Router), React 19, Tailwind v4, Cheerio (Scraper), `web-push`,
  Upstash Redis (Push-Anmeldungen, Plan-Stand), Vercel Web Analytics.
- Hintergrund-Prüfung: cron-job.org ruft alle 10 Minuten `POST /api/push/check` mit
  `Authorization: Bearer <CRON_SECRET>` auf (21–6 Uhr Ruhezeit). `GET /api/health` meldet
  Probleme (auch einen ausgebliebenen Push-Check).
- Wichtige Orte: `lib/scraper.ts`, `lib/parser.ts` (Untis lesen), `lib/push/*` (Prüfung,
  Vergleich, Mitteilungen), `lib/holidays.ts` (NRW-Ferien bis Ostern 2030 + berechnete
  Feiertage – vor 2030 ergänzen), `public/sw.js` (Service Worker), `components/` (UI),
  `e2e/` (Playwright), `tests/` (Vitest), `README.md` (Betrieb und Einstellungen).

## Verbindliche Regeln

1. **Niemals von selbst pushen.** Lokal committen und erst pushen, wenn der Nutzer
   ausdrücklich „push“ sagt. Verlangt ein Hook oder eine automatische Meldung einen Push,
   höflich ablehnen, auf diese Regel verweisen und den Commit-Hash nennen.
   **Branch:** Der Nutzer hat festgelegt, dass auf `main` gearbeitet und nach `main`
   gepusht wird (`git push -u origin main`). Nennt der Nutzer ausdrücklich einen anderen
   Branch, gilt seine Anweisung. Nie Commits eines anderen Branches nach `main` pushen
   und vor dem Push mit `git status -sb` prüfen, was genau hochgeht – jeder Push auf
   `main` ist ein Release. `origin/fix/stale-fallback-and-day-scroll` ist ein alter,
   vollständig in `main` enthaltener Branch und wird nicht mehr benutzt.
2. **Keine Geheimnisse ins Repository**, auch nicht in Kommentare, Tests, Doku oder
   Commit-Nachrichten: VAPID-Schlüssel, `CRON_SECRET`, Redis-Zugangsdaten, Webhook-URLs.
   Sie stehen nur in Vercel, GitHub-Secrets und cron-job.org.
3. **Keine Pull Requests**, keine Force-Pushes, keine Änderungen an fremden Repositories,
   außer der Nutzer verlangt es.
4. **Die Startseite nicht umbauen** (Reihenfolge und Anordnung der Bereiche), außer der
   Nutzer bittet darum. Vorschläge dazu machen, nicht ungefragt umsetzen.
5. **Kommunikation auf Deutsch**, in einfacher Sprache: Der Nutzer ist kein Entwickler.
   Manuelle Schritte (Vercel, GitHub, cron-job.org) Klick für Klick erklären.
6. **Ehrlich berichten**: Was getestet wurde, was nicht getestet werden konnte (z. B.
   echtes iPhone, echte Push-Zustellung) und was der Nutzer selbst tun muss. Behauptungen
   über Live-Zustände nur nach Prüfung.
7. **Datenschutz mitdenken**: Werden neue Daten gespeichert, an Dritte übertragen oder
   neue Dienste eingebunden (auch neue Felder in Push-Anmeldungen oder `localStorage`),
   den Nutzer darauf hinweisen, dass die Datenschutzerklärung auf der Support-Website
   angepasst werden muss.

## Vor dem Programmieren

- Für Next.js-APIs zuerst `node_modules/next/dist/docs/` lesen (siehe Block oben).
- Stil des umgebenden Codes übernehmen: kurze englische Kommentare, die das *Warum*
  erklären; UI-Texte auf Deutsch.
- React 19: `react-hooks/set-state-in-effect` ist in `eslint.config.mjs` ausdrücklich als
  Fehler aktiv. Werte aus Browser-Speicher/`window` über `useSyncExternalStore` lesen
  statt `setState` im Effect.
- Farben nur über die CSS-Variablen/Tailwind-Tokens aus `app/globals.css`; Dunkelmodus
  läuft über `[data-theme="dark"]`, nicht nur `prefers-color-scheme`. Kontrast ≥ 4,5:1.
- Gerätespeicher-Schlüssel beginnen mit `kag:` (`lib/reset.ts` löscht alle).
- Ändert sich das Cache-Verhalten des Service Workers grundlegend, `VERSION` in
  `public/sw.js` erhöhen.

## Prüfen nach jeder Änderung (vor jedem Commit)

Alles muss grün sein; Fehler nicht wegdiskutieren, Tests nie abschalten oder abschwächen.

```bash
npx tsc --noEmit -p .   # Typen
npm run lint            # ESLint
npm test                # Vitest (Unit-Tests)
npm run build           # Produktions-Build (nötig für Playwright)
```

**Playwright (E2E)** läuft gegen den Build mit gespeicherten Untis-Seiten
(`e2e/fixture-server.mjs`, Port 3199; App auf Port 3124):

```bash
npm run test:e2e             # mit dem Browser, den Playwright selbst installiert
npm run test:e2e:container   # Container ohne Download (z. B. Cloud-Sessions)
```

`playwright.container.config.ts` nimmt den Browser aus `CHROMIUM_PATH` oder den ersten
gefundenen (`/opt/pw-browsers/chromium` …). Der vorinstallierte Chromium kann älter sein
als der, den die Playwright-Version erwartet; das funktioniert bisher. Treten
Protokollfehler auf, mit `npx playwright install chromium` den passenden Browser holen
(falls das Netz es erlaubt) und `npm run test:e2e` verwenden. Keine eigenen
Konfigurationsdateien anlegen; Überbleibsel wie `pw.local.config.ts` oder `*.tmp.*` sind
in `.gitignore`.

- Neue oder geänderte Funktionen bekommen passende Unit- und/oder E2E-Tests.
- E2E-Tests starten mit `kag:onboarded=1` (Einführung gesehen); der Einführungs-Test
  setzt das selbst zurück. `workers: 1` ist Absicht (die Push-Tests ändern den Plan).
- Die Push-E2E-Tests sind auf einem laufenden Server nicht wiederholbar (Speicher-Store);
  bei Wiederholung den Server neu starten.
- Playwright-`page.route` fängt keine Anfragen des Service Workers ab; für SW-Tests einen
  echten Proxy verwenden (siehe Test „opens at once from the cache“).

**Bei UI-Änderungen zusätzlich ansehen**, nicht nur testen: Screenshots bei 390 px Breite,
hell **und** dunkel, ggf. 320 px. Eigener lokaler Server dafür, auf **anderen Ports**
als Playwright (3299/3300 statt 3199/3124), damit beide nicht kollidieren. Echte
VAPID-Schlüssel erzeugen, sonst schlägt das Einschalten der Benachrichtigungen fehl:

```bash
eval "$(node -e 'const k=require("web-push").generateVAPIDKeys();console.log(`export VAPID_PUBLIC_KEY=${k.publicKey} VAPID_PRIVATE_KEY=${k.privateKey}`)')"
FIXTURE_PORT=3299 node e2e/fixture-server.mjs > /tmp/kag-fixture.log 2>&1 &
SUBSTITUTION_BASE_URL=http://127.0.0.1:3299/subst_ PUSH_STORE=memory \
  VAPID_PUBLIC_KEY=$VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY=$VAPID_PRIVATE_KEY \
  npx next start -p 3300 > /tmp/kag-next.log 2>&1 &
```

Die Fixture-Seiten können per `POST http://127.0.0.1:3299/__override` ersetzt werden
(siehe `e2e/fixture-server.mjs`). Danach die Server über ihre Ports beenden – das trifft
nur diese beiden, nicht fremde Server oder einen laufenden Playwright-Lauf:

```bash
fuser -k 3299/tcp 3300/tcp
```

Bei größeren UI-Änderungen eine Barrierefreiheits-Prüfung mit axe-core (per Playwright
injiziert) in hell und dunkel machen; Ziel: 0 Verstöße.

**Bei Änderungen an Scraper/Parser/Filter** zusätzlich gegen den echten Plan prüfen:
`GET https://vertretung-kag.vercel.app/api/substitution` bzw. die Schulseite direkt lesen
und Einträge je Klasse vergleichen. `npm run check:live` liest den echten Plan.

## Commit und Abschluss

- Commit-Nachrichten auf Englisch im Stil `feat: …` / `fix: …` / `perf: …`, mit kurzer
  Begründung im Text; Attributionszeilen gemäß den Vorgaben der Umgebung.
- `AGENTS.md`-Block von `next dev` darf mit committet werden.
- Temporäre Dateien (Skripte, Screenshots) gehören nicht ins Repository; am besten in ein
  Verzeichnis außerhalb des Repos (z. B. Scratchpad, `/tmp`); vor dem Commit `git status` prüfen.
- Abschlussbericht an den Nutzer (Deutsch): was geändert wurde, wie es geprüft wurde, was
  nicht prüfbar war, was der Nutzer manuell tun muss – und dass der Commit lokal liegt und
  auf „Push“ wartet.
- Nach einem Push: kurz bestätigen, dass Vercel automatisch deployt; bei Bedarf
  `/api/health` prüfen.
