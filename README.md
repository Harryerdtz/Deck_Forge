# DeckForge

Ein installierbares Pixel-Deckbuilding-Roguelike im Browser. Akt I mit dem Eisernen: prozedurale Karte, 15 Etagen, Kartenbelohnungen, Relikte, Tränke, Shop, Lagerfeuer, Events und ein Boss am oberen Ende.

Das UI kommt ohne Unicode-Emojis aus. Alle Symbole, Gegner, Kartenmotive, Intentionen und Status-Badges werden als Pixel-Art auf Canvas gezeichnet oder mit CSS-Formen gebaut.

## Starten

Voraussetzung: ein beliebiger statischer HTTP-Server. Service Worker und `file://` vertragen sich nicht, deshalb nicht direkt die HTML-Datei öffnen.

```bash
npm start
# oder
python3 -m http.server 4173 --bind 127.0.0.1
```

Dann `http://127.0.0.1:4173/` öffnen. Auf dem iPhone über Safari "Zum Home-Bildschirm" hinzufügen.

## Steuerung

- Karte antippen: spielt sie sofort, wenn kein Gegnerziel nötig ist.
- Karte antippen und Gegner antippen: Ziel für Einzelangriffe wählen.
- Karte nach oben ziehen oder auf einen Gegner ziehen: Drag-to-play.
- Ziehstapel, Ablage und "E" (erschöpft) unten öffnen die Stapelansicht.
- "Deck" in der Topbar öffnet das Deck, "Menü" Optionen und Vollbild.
- `E` beendet den Zug, `D` öffnet das Deck, `Esc` schließt Dialoge.
- Die Hand fasst maximal 10 Karten. Karten heben sich beim Hovern an; auf Touchgeräten übernimmt die Zielauswahl das Vergrößern.

## Regelsysteme

- Startdeck: 5x Schlag, 4x Verteidigung, 1x Schmetterhieb. 80 HP, 3 Energie, 5 Karten pro Zug.
- Rüstung verfällt zu Beginn des eigenen Zuges, außer mit Barrikade. Gegnerrüstung verfällt zu Beginn ihres Zuges.
- Verwundbar: +50% erlittener Angriffsschaden. Schwach: -25% ausgeteilter Angriffsschaden. Stärke addiert Schaden pro Treffer. Geschick addiert Rüstung durch Karten.
- Status-Ticks, Ritual, Metallisieren, Dornen, Flammenbarriere, Verbrennung, Koloss, Wut, Doppelter Hieb, Verderbnis und weitere Karten-Passive sind in der Engine umgesetzt.
- Intentionen über Gegnern zeigen Angriffsschaden und Trefferzahl, Rüstung, Buffs und Debuffs inklusive berechneter Modifikatoren.
- 66 Karten inklusive Statuskarten (Wunde, Benommenheit, Verbrennung, Schleim, Leere) und Flüchen. Jede aufwertbare Karte besitzt eine "+"-Version.
- Aufwerten am Lagerfeuer (Schmieden) oder einmal pro Shop für Gold. Karten entfernen im Shop wird mit jedem Kauf teurer.
- Relikte: Startrelikt Brennendes Blut, 12 weitere Relikte und 3 Boss-Relikte. Elitekämpfe garantieren ein Relikt.
- Tränke: 3 Slots, 9 Sorten, im Kampf über die Topbar einsetzbar.
- Karte: 15 Etagen, sechs Pfade, Monster, Elite, Event, Shop, Lagerfeuer, Boss. Etage 14 ist immer ein Lagerfeuer, danach folgt der Boss.
- Speichern: Der Lauf wird automatisch im Local Storage gesichert und kann nach einem Reload fortgesetzt werden.
- PWA: Manifest, Apple-Touch-Icon, Safe-Area-Insets und ein Service Worker mit Netzwerk-first-Cache für Offline-Nutzung.

## Inhalt

- 10 Events mit Entscheidungen, Gold-, Deck-, Relikt- und Tränkewirkungen.
- 9 Gegnertypen: Kultist, Kieferwurm, Laus, Säureschleim, Pilzbestie, Sklaventreiber, Gremlin-Rohling (Elite), Lagavulin (Elite), Hexageist (Boss).
- Prozedurale Map mit garantierten Shops, Eliten und Events.
- Boss-Relikt-Auswahl und Siegesbildschirm.

Akt I ist vollständig spielbar. Weitere Akte, weitere Charaktere und Ascension-Stufen sind bewusst nicht enthalten; die Systeme sind darauf vorbereitet, aber der Content-Pool ist auf den Eisernen und die Ruinen beschränkt.

## Projektstruktur

```text
index.html              App-Shell, Topbar, Screens, Modal
css/style.css           Dunkles Pixel-UI, Kartenfächer, responsive Layouts
js/sprites.js           Palette, Sprite-Definitionen, Canvas-Renderer
js/data.js              Karten, Status, Relikte, Tränke, Gegner, Events
js/engine.js            Reine Spiellogik ohne DOM-Abhängigkeit
js/ui.js                Rendering, Interaktion, Drag-and-Drop, Speichern
js/main.js              Boot und Service-Worker-Registrierung
sw.js                   Offline-Cache
manifest.webmanifest    PWA-Manifest
icons/                  Generierte PNG-Icons
tools/make_icons.py     Icon-Generator ohne externe Abhängigkeiten
tests/                  Engine-, Fuzz- und Browser-Tests
```

## Tests

```bash
npm test
node tests/engine.test.js
node tests/fuzz.test.js
```

Die Browser-Tests brauchen einen laufenden Server auf Port 4173 und Chrome mit Remote-Debugging auf Port 9222:

```bash
python3 -m http.server 4173 --bind 127.0.0.1
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --no-first-run \
  --user-data-dir=/tmp/deckforge-chrome \
  --remote-debugging-port=9222 about:blank
node tests/browser.test.js
node tests/browser.screens.test.js
node tests/offline.test.js
```

Getestet werden unter anderem Startdeck, Map-Generierung, Schadensmodifikatoren, Rüstung, Intentionen, Karten-Upgrades, Belohnungen, Shop, Lagerfeuer, Events, Boss-Relikte, Speicherstand, mobile Layouts ohne horizontales Scrollen, Offline-Start aus dem Service-Worker-Cache sowie alle Karten einzeln und 16 automatische Runs.

## Hinweis

DeckForge ist ein Fan-Projekt und steht in keiner Verbindung zu Mega Crit. Slay the Spire ist eine Marke der jeweiligen Rechteinhaber. Es wird kein Original-Asset des kommerziellen Spiels verwendet; alle Sprites und Icons sind hier neu als Pixel-Art definiert.
