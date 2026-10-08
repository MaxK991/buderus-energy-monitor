# Buderus Energy Monitor

Eine mobile-first PWA für eine langfristige eigene Historie der Buderus-Energieverbrauchsdaten.

## Aktueller Stand
- GitHub-Pages-kompatible statische Webapp
- iPhone-Homescreen/PWA
- lokale Speicherung der importierten Monatswerte
- 24+ Monate möglich (keine 12-Monats-Begrenzung in der eigenen Historie)
- Jahresansicht
- Jahresvergleich
- CSV-Import
- Diagramm im Stil der Buderus-Energieansicht

## CSV
Der aktuelle Import erwartet mindestens:
`Jahr;Monat;Gas_kWh`

Optional:
`Aussentemperatur_C;Raumtemperatur_C`

## Nächster Integrationsschritt
Sobald ein zulässiger Buderus-Datenzugang für das konkrete System vorhanden ist, kann der CSV-Import durch einen automatisierten Datenabruf ersetzt werden. Die Buderus Open API ist laut Hersteller für Endkunden vorgesehen; die konkrete Verfügbarkeit und Berechtigung muss für die Anlage geprüft werden.

## Deployment
Das Repository kann direkt als GitHub Pages veröffentlicht werden:
Settings → Pages → Deploy from branch → main → / (root)

Danach auf dem iPhone öffnen und „Zum Home-Bildschirm“ wählen.

## Echter MyBuderus-Export getestet
Der Export `EnergyData_...csv` wurde analysiert. Das Format ist UTF-8, Semikolon-getrennt und enthält drei Datenebenen:
- `Stunde`: stündliche Daten der letzten 3 Tage
- `Tag`: tägliche Daten der letzten 3 Monate
- `Monat`: monatliche Daten des letzten verfügbaren Jahres

Die App v2 erkennt diese Ebenen direkt, speichert sie getrennt und dedupliziert über `Kategorie + Zeitstempel`. Dadurch kann derselbe MyBuderus-Gesamtexport regelmäßig importiert werden, ohne Duplikate zu erzeugen.

Wichtig: Der konkrete Export vom 08.10.2026 enthält Monatswerte ab Oktober 2025; Januar–September 2025 sind bereits mit `-` gekennzeichnet. Die langfristige Historie kann daher erst ab dem Zeitpunkt aufgebaut werden, an dem die Exporte regelmäßig gesichert werden.
