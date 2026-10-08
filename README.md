# Buderus Energiemonitor v4.0.0

**Neu aufgebaut, ohne Build-System oder externe Bibliotheken.** Geeignet für GitHub Pages, iPhone und andere moderne Browser. Alle Heizungsdaten verbleiben lokal in deinem Browser; hochgeladen werden nur die Programmdateien.

## Start und Aktualisierung über GitHub Pages

1. ZIP entpacken.
2. Alle neun Dateien aus dem obersten ZIP-Verzeichnis in das Stammverzeichnis des GitHub-Repositories `buderus-energy-monitor` hochladen und bestehende Dateien gleichen Namens ersetzen. WICHTIG: `app.mjs` und `engine.mjs` sind neu und werden zusätzlich benötigt.
3. Alte Projektdateien `app.js` und `sample.csv` dürfen im Repository verbleiben, werden aber nicht mehr benötigt. Sie können später gelöscht werden. Alte `index.html`, `styles.css`, `sw.js`, `manifest.webmanifest`, `icon.svg` ersetzen.
4. GitHub Pages baut die Website automatisch neu. Einmal `https://maxk991.github.io/buderus-energy-monitor/?v=4.0.0` aufrufen, um alte Cache-Versionen zu umgehen. Unten **Version v4.0.0** prüfen.
5. Unter **Daten** vorhandene MyBuderus-CSV-Dateien importieren. Neuimporte ergänzen bereits gespeicherte Messwerte.

## Daten und Berechnung

- Unterstützt den MyBuderus-Gesamtexport (CSV mit `Kategorie;Zeitstempel;...`) mit Stunden-, Tages- und Monatsdaten.
- Erkennt die deutsche Tausender-/Dezimalschreibweise (`6.208,2`, `5.206`) sowie fehlende Werte (`-`).
- Gleiche Kategorie + Zeitstempel wird nur einmal gespeichert. Neuere Exportdateien ergänzen/aktualisieren bereits vorhandene Werte.
- Präferenz bei Monaten: vorhandene Buderus-Monatswerte > Tageswerte > Stundenwerte. Tages- und Stundenauszüge sind nur vollständige Monatswerte, wenn ihre Abdeckung vollständig ist.
- Ein **fehlender** Wert ist nicht `0`; Monate ohne Messung stehen auf `–`.
- Vergleiche berechnen Veränderungen nur für dieselben **vollständig vorliegenden** Monate beider Jahre. Bei null gemeinsamen Vergleichsmonaten wird **keine Einsparungsquote** behauptet.
- Während des laufenden Monats gemeldete Werte werden als Teilmonat gekennzeichnet; das Dateidatum des Exports dient als Anhaltspunkt für die Vollständigkeit. Auch vorherige Exporte können historische Teilmonate enthalten, wenn sie ursprünglich vor Monatsende erzeugt wurden; diese werden bei neu importierten Originaldateien über das Exportdatum erkannt.
- Der Vergleich von Gasverbrauch mit Heizung und Warmwasser erfolgt getrennt; keine implizite Gleichsetzung der Energiesummen.

## Lokale Speicherung und Datensicherung

- Neue Historie: localStorage-Schlüssel `buderus_monitor_v4_rows`.
- Beim ersten Öffnen wird ein früherer Bestand aus `buderus_energy_v2` **eingelesen**, ohne diesen Schlüssel zu löschen. Die neuen Daten werden bei einem Import unter dem neuen Schlüssel gespeichert.
- Da bei der früheren Speicherung kein Importzeitpunkt pro Zeile hinterlegt war, wird dieser beim Übernehmen näherungsweise mit dem aktuellen Datum ergänzt. Nach erneuter Einlesung eines Buderus-Originalexports wird das dort enthaltene Erstellungsdatum genutzt.
- **Daten → Sicherung herunterladen** speichert einen JSON-Export der eigenen Historie; **Sicherung einspielen** ergänzt daraus Messwerte.
- GitHub Pages ist statisch und erhält keine privaten CSV-Daten, solange du sie nicht selbst ins Repository commitest. **Keine echten CSV-Dateien oder Sicherungsdateien nach GitHub hochladen.**
- Safari kann lokale Websitedaten bei Löschung des Browser-Caches entfernen; daher regelmäßig eine Sicherung anlegen. Browser und Home-Bildschirm-App können getrennte Speicherbereiche besitzen.

## Dateien

- `index.html`: Semantische Oberfläche
- `styles.css`: Mobile-First-Layout, Portrait und Landscape
- `engine.mjs`: Import, Datentypen und Berechnungen (ohne DOM)
- `app.mjs`: UI, Datenbankmigration, Interaktionen und Sicherungen
- `sw.js`: Netzwerk zuerst, Offline-Fallback; Cache v4.0.0
- `manifest.webmanifest`, `icon.svg`: Installation als PWA
- `tests.mjs`: automatisierte Engine-Prüfungen (nicht zur Ausführung der Website benötigt)

## Technische Grenzen

Der ursprüngliche Buderus-CSV-Export bietet zuletzt Monats-, Tages- und Stundenabschnitte in unterschiedlicher historischer Tiefe. Bereits außerhalb des exportierten Zeitfensters liegende Daten können nicht nachträglich rekonstruiert werden. Importiere deshalb regelmäßig neue Exporte und fertige Backups an.

## Entwicklung und Qualitätskontrolle

Engine-Funktionen sind als testbare ES-Module getrennt. Die Ausgabe ist rein statisch, ohne CDNs oder externe Abhängigkeiten. Empfohlene Tests: CSV-Import und wiederholter Import, Persistenz nach Neuladen, mobile Breiten 320–430 px, Querformat 844×390 px, Jahresansicht 2025 und 2026, fehlende Monate, Mehrdateienimport, Auswahl von Monatsdetails sowie Backup/Restore.

**Hinweis zur Navigation:** In iPhone-Querformat passen trotz zweispaltigem Layout nicht zwingend alle zwölf Monatswerte ohne vertikales Scrollen gleichzeitig auf die kurze Displayhöhe. Es gibt aber keine horizontal überlaufende Gesamtseite.
