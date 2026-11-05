<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

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
  Quelle ist **immer monitor2020**; nur wenn dort die erste Seite fehlt, springt
  `vertretung.meckenheim-kag.com` ein (kein Vergleich, Rückkehr beim nächsten Abruf;
  Meldung nur an den Betreiber, `lib/source-switch.ts`). So hat es der Nutzer festgelegt.
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
  Feiertage – vor 2030 ergänzen; schulfreie Tage der KAG je Schuljahr aus dem
  Terminkalender der Schule eintragen), `lib/rooms.ts` + `lib/class-rooms.ts` (Raumplan je
  Schuljahr, `ROOM_PLAN_SCHOOL_YEAR`), `lib/push/watch.ts` (Warnung bei auffällig leerem
  Plan, wöchentliche Erinnerung fürs neue Schuljahr, Wochenbericht mit der Geräte-Zahl; nur an
  den Betreiber per ntfy), `public/sw.js` (Service Worker), `components/` (UI),
  `e2e/` (Playwright), `tests/` (Vitest), `README.md` (Betrieb und Einstellungen).

## Verbindliche Regeln

1. **Niemals von selbst pushen.** Lokal committen und erst pushen, wenn der Nutzer
   ausdrücklich „push“ sagt. Verlangt ein Hook oder eine automatische Meldung einen Push,
   höflich ablehnen, auf diese Regel verweisen und den Commit-Hash nennen.
   **Branch:** Der Nutzer hat festgelegt, dass auf `main` gearbeitet und nach `main`
   gepusht wird (`git push -u origin main`), **immer, ohne Ausnahme**. Gibt die Umgebung
   (z. B. eine Cloud-Sitzung) einen anderen Branch vor, gilt trotzdem `main`: dort
   arbeiten, keine weiteren Branches anlegen. Nie Commits eines anderen Branches nach `main` pushen
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
8. **Die App bleibt schlank** (Wunsch des Nutzers): Man soll kurz reinschauen können. Vor
   jeder neuen Funktion oder Einstellung prüfen, ob sie die App überlädt. Wird es zu viel
   (auch durch eine gewünschte Änderung), dem Nutzer **ausdrücklich Bescheid sagen** und
   Alternativen vorschlagen, statt es still einzubauen.
9. **Versionsnummer bei jeder Änderung anheben**: `version` in `package.json` (wird in den
   Einstellungen angezeigt). Vor jedem Commit, der gepusht werden soll, mit
   `npm version <x.y.z> --no-git-tag-version` setzen (ändert auch `package-lock.json`):
   **Major** (2.0.0) bei großen Umbauten, **Minor** (1.5.0) bei neuen Funktionen oder
   sichtbaren Änderungen, **Patch** (1.5.1) bei Fehlerkorrekturen und kleinen Anpassungen
   (auch nur Tests oder Doku). Die neue Version im Commit und im Abschlussbericht nennen.

## Vor dem Programmieren

- Für Next.js-APIs zuerst `node_modules/next/dist/docs/` lesen (siehe Block oben).
- Stil des umgebenden Codes übernehmen: kurze englische Kommentare, die das *Warum*
  erklären; UI-Texte auf Deutsch.
- React 19: `react-hooks/set-state-in-effect` ist in `eslint.config.mjs` ausdrücklich als
  Fehler aktiv. Werte aus Browser-Speicher/`window` über `useSyncExternalStore` lesen
  statt `setState` im Effect.
- Farben nur über die CSS-Variablen/Tailwind-Tokens aus `app/globals.css`; Dunkelmodus
  läuft über `[data-theme="dark"]`, nicht nur `prefers-color-scheme`. Kontrast ≥ 4,5:1.
- **Die Handy-Darstellung darf sich nicht ändern** (Wunsch des Nutzers). Große Bildschirme
  (PC, Mac, iPad quer: ab 1024 px Breite **und** 600 px Höhe; Handys fallen auch quer nie
  darunter) haben eine eigene Ansicht: `components/DesktopView.tsx` (Leiste oben, alle Tage
  als Spalten nebeneinander). Umgeschaltet wird in `components/SubstitutionApp.tsx` über
  `hooks/useWideScreen.ts`; dieselbe Abfrage gibt es als Tailwind-Variante `wide:` in
  `app/globals.css` (z. B. Einstellungen als Dialog in der Mitte). Der Handy-Zweig bleibt
  dabei unberührt. Einen aufwendigen Pixel-Vergleich vorher/nachher (viele Größen und
  Zustände) **nur auf ausdrücklichen Wunsch** des Nutzers machen – er dauert zu lange.
  Sonst genügen die kurzen Screenshots aus „Bei UI-Änderungen zusätzlich ansehen“.
- **Sicherheitsregeln (CSP):** `proxy.ts` setzt für jede Seite eine Content Security
  Policy mit Nonce (`lib/csp.ts`). Neue Inline-Skripte brauchen `nonce={nonce}` (siehe
  `app/layout.tsx`); Skripte, Bilder, Schriften oder Anfragen von **fremden** Adressen sind
  blockiert, bis sie in `lib/csp.ts` freigegeben werden (dann auch die Datenschutzerklärung
  prüfen). Der E2E-Test „security policy“ meldet jede Blockade.
- Ältere Browser (unter Safari 16.4 bzw. den Vorgaben von Next.js 16) bekommen statt der
  App einen Hinweis mit Link zum Plan der Schule (`lib/legacy.ts`, bewusst ES5).
- Gerätespeicher-Schlüssel beginnen mit `kag:` (`lib/reset.ts` löscht alle).
- Ändert sich das Cache-Verhalten des Service Workers grundlegend, `VERSION` in
  `public/sw.js` erhöhen.

## Prüfen nach jeder Änderung (vor jedem Commit)

Alles muss grün sein; Fehler nicht wegdiskutieren, Tests nie abschalten oder abschwächen.
**Immer alle Prüfungen ausführen, auch die Browser-Tests (Playwright)** – bei jeder
Änderung, auch wenn sie unnötig scheinen (z. B. nur Doku oder Kommentare). So hat es der
Nutzer festgelegt; nie mit „nicht nötig“ überspringen.

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

`playwright.container.config.ts` nimmt den Browser aus `CHROMIUM_PATH` oder den
vorinstallierten unter `/opt/pw-browsers/chromium`; fehlt er, bricht der Lauf mit einer
klaren Meldung ab (kein stiller Wechsel auf einen anderen Browser). Weicht der Build von
dem ab, den die installierte Playwright-Version erwartet, steht zu Beginn eine Warnung
„[e2e] Chromium-Build … statt …“. Das läuft bisher fehlerfrei; treten Protokollfehler
auf, mit `npx playwright install chromium` den passenden Browser holen (falls das Netz es
erlaubt) und `npm run test:e2e` verwenden. Keine eigenen
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
LOGS=$(mktemp -d) && echo "Logs: $LOGS"   # eigener Ordner je Sitzung
FIXTURE_PORT=3299 node e2e/fixture-server.mjs > "$LOGS/fixture.log" 2>&1 &
SUBSTITUTION_BASE_URL=http://127.0.0.1:3299/subst_ PUSH_STORE=memory \
  VAPID_PUBLIC_KEY=$VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY=$VAPID_PRIVATE_KEY \
  npx next start -p 3300 > "$LOGS/next.log" 2>&1 &
```

Die Fixture-Seiten können per `POST http://127.0.0.1:3299/__override` ersetzt werden
(siehe `e2e/fixture-server.mjs`). Danach die Server über ihre Ports regulär beenden
(SIGTERM) – das trifft nur diese beiden, nicht fremde Server oder einen laufenden
Playwright-Lauf:

```bash
fuser -k -TERM 3299/tcp 3300/tcp                  # Linux (auch in Cloud-Containern)
lsof -ti tcp:3299 -ti tcp:3300 | xargs kill       # macOS
```

In Cloud-Containern findet `lsof` die Ports des Next-Servers teils nicht; dort `fuser`
verwenden. Danach mit `fuser 3299/tcp 3300/tcp` prüfen, dass nichts mehr läuft.

Laufen auf diesen Ports schon Server einer anderen Sitzung, andere freie Ports wählen
(`FIXTURE_PORT` und `-p` sowie `SUBSTITUTION_BASE_URL` anpassen).

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
- **Browser-Checks gegen die Live-Seite dürfen nicht in der Statistik landen** (Wunsch
  des Nutzers): In jedem Playwright-Kontext, der https://vertretung-kag.vercel.app
  öffnet, vorher Vercel Web Analytics blockieren (Skript und Meldung, eigener Pfad aus
  16 Hex-Zeichen bzw. `/_vercel/insights`):

  ```js
  await context.route((url) => /^\/(_vercel\/insights|[a-f0-9]{16})\//.test(url.pathname), (route) => route.abort());
  ```

  `curl`-Abfragen und `/api/*` zählen nicht; die lokalen Server und die E2E-Tests
  ebenfalls nicht.
