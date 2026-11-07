# NYISO New York Grid

Die Zahlen des Stromnetzes von New York live in Gladys, aus den öffentlichen
Dateien von NYISO, dem Betreiber des Netzes des Bundesstaats New York: der
Echtzeitpreis jeder Preiszone, der Verbrauch, die Erzeugung nach Quelle, der
CO₂-arme Anteil und eine geschätzte CO₂-Intensität.

Ohne Stromvertrag in New York entwickelt: Rückmeldungen willkommen (die Daten
sind öffentlich). Nicht mit NYISO verbunden.

## Was du bekommst

- Ein Gerät **Stromnetz New York**: Verbrauch des Bundesstaats, geschätzte
  CO₂-Intensität, CO₂-armer und erneuerbarer Anteil, Anteil jeder
  NYISO-Kategorie und eine Zusammenfassung in einem Satz.
- Ein Gerät pro verfolgter **Preiszone**: ihr Echtzeitpreis ($/MWh) und ihr
  Verbrauch.
- Vier Szenen-Auslöser (Preis über, Preis unter, negativer Preis, CO₂-armer
  Anteil über) und ein Dashboard-Widget.

**Die Preise sind Großhandelspreise** des NYISO-Echtzeitmarkts, nicht dein
Stromtarif: Der Versorger schlägt Netz, Steuern und Marge auf. Die Preise zeigen
trotzdem, wann Strom reichlich oder knapp ist.

## Voraussetzungen

- Gladys 5.3.0 oder neuer.
- Internetzugang von Gladys aus (die Dateien werden auf `mis.nyiso.com`
  gelesen). Kein Konto, kein Schlüssel.

## Installation

In Gladys **Integrationen → Von GitHub installieren**, dann die Adresse des
Repositorys: `https://github.com/guim31/gladys-us-grid`.

## Konfiguration

1. **Preiszonen**: Wähle deine Zone(n) unter den elf NYISO-Zonen (West,
   Genesee, Central, North, Mohawk Valley, Capital, Hudson Valley, Millwood,
   Dunwoodie, New York City, Long Island). NYISO veröffentlicht eine Karte auf
   seiner Website.
2. **Schwellen** (optional) für die Auslöser: hoher und niedriger Preis in
   $/MWh, CO₂-armer Anteil in %. Leer bleibt der Auslöser aus.
3. **Sprache der Namen**: die der Funktionsnamen (beim Hinzufügen eines Geräts
   festgelegt), der Zusammenfassung und der Testmeldung.
4. Speichern, dann die Geräte im Tab **Entdecken** hinzufügen.

## Geräte

### Stromnetz New York

| Funktion                   | Einheit   | Hinweis                                                                             |
| -------------------------- | --------- | ----------------------------------------------------------------------------------- |
| Verbrauch New York         | kW        | der ganze Bundesstaat (Gladys kennt kein MW)                                        |
| CO₂-Intensität (geschätzt) | g CO₂/kWh | aus dem Strommix, siehe unten                                                       |
| CO₂-armer Anteil           | %         | Kernkraft, Wasserkraft, Wind, andere erneuerbare                                    |
| Erneuerbarer Anteil        | %         | Wasserkraft, Wind, andere erneuerbare                                               |
| Anteil jeder Kategorie     | %         | Zweistoff, Erdgas, Kernkraft, andere fossile, andere erneuerbare, Wind, Wasserkraft |
| Zusammenfassung            | Text      | „16,5 GW Verbrauch, 54 % CO₂-arm, …“                                                |

Die Anteile sind die der Erzeugung **innerhalb von New York**: Importe aus
Nachbarnetzen stehen nicht im NYISO-Strommix.

### Preiszone

`NYISO <Zone> (<Buchstabe>)`: der **Echtzeitpreis** der Zone (LBMP, $/MWh,
Fünf-Minuten-Intervall) und der **Verbrauch** der Zone (kW).

## Szenen

Die Auslöser beobachten die verfolgten Zonen. Jeder löst **einmal pro
Überschreitung** aus und wird wieder scharf, wenn der Wert mit einem Abstand
zurück ist (5 $/MWh bei den Preisen, 1 $ beim negativen Preis, 2 Punkte beim
Anteil): Der Markt kreuzt eine Schwelle alle fünf Minuten hin und her. Der
Zustand bleibt nach einem Neustart erhalten.

### NYISO-Preis über der Schwelle

Eine verfolgte Zone steigt über die hohe Preisschwelle. Filter: Zonen.
Variablen: `zone` (NYISO-PTID), `zone_name`, `price`, `threshold`.

### NYISO-Preis unter der Schwelle

Eine verfolgte Zone fällt unter die niedrige Preisschwelle. Gleiche Filter und
Variablen.

### Negativer NYISO-Preis

Der Preis einer verfolgten Zone wird negativ (zu viel Erzeugung, oft Wind und
Wasserkraft nachts). Variablen: `zone`, `zone_name`, `price`.

### Netz New York: hoher CO₂-armer Anteil

Der CO₂-arme Anteil steigt über seine Schwelle: ein guter Moment, Geräte
laufen zu lassen. Variablen: `low_carbon_share`, `renewable_share`,
`carbon_intensity`, `threshold`.

## Dashboard

### Widget Stromnetz New York

Der Preis einer Zone (Einstellung, standardmäßig New York City, ohne Gerät),
der CO₂-arme Anteil, das geschätzte CO₂, der Verbrauch, eine 24-h-Kurve (der
Preis der Zone, sobald ihr Gerät hinzugefügt ist, sonst das CO₂ des
Netzgeräts) und der Strommix als Balken. Kurve und Strommix lassen sich
jeweils per Einstellung ausblenden.

## Aktionen

**Verbindung zu NYISO testen** liest sofort Preise, Strommix und Verbrauch und
antwortet mit dem Preis deiner ersten Zone.

## Daten und Grenzen

- Quelle: öffentliche NYISO-Dateien, alle fünf Minuten: zonale Echtzeitpreise,
  Echtzeit-Strommix, tatsächlicher Verbrauch. Die NYISO-Zeiten sind New Yorker
  Zeit (EST oder EDT); Gladys zeigt sie in seiner eigenen Zeitzone.
- Die Integration liest sie alle fünf Minuten, nur wenn etwas sie nutzt (ein
  Gerät, eine Schwelle, das Widget): einige Megabyte pro Tag, komprimiert.
  NYISO nennt kein Kontingent für diese öffentlichen Dateien.
- Ein Wert älter als 30 Minuten (Preis) oder eine Stunde (Strommix, Verbrauch)
  wird nie veröffentlicht: lieber kein Wert als ein veralteter, nie eine Null.
- **Die CO₂-Intensität ist eine Schätzung**: jede Kategorie mal ihr
  Lebenszyklus-Emissionsfaktor (IPCC-Mediane 2014, wie bei Electricity Maps):
  490 g/kWh für Gas und Zweistoff, 650 für andere fossile (Öl), 230 für andere
  erneuerbare (meist Biomasse), 24 Wasserkraft, 12 Kernkraft, 11 Wind. Importe
  werden nicht gezählt.
- Vorerst nur NYISO. Kalifornien deckt die
  [CAISO-Integration](https://github.com/LM1LC3N7/gladys-caiso)
  (gladys-caiso) ab. ISO New England, MISO, SPP, PJM und ERCOT
  veröffentlichen keine offene Datei, die ohne Konto oder Browser lesbar ist.

## Fehlerbehebung

- **„Die Preisdatei von NYISO ist nicht lesbar“** im Konfigurationsbildschirm:
  NYISO hat nicht geantwortet; die Integration versucht es alle fünf Minuten
  erneut.
- Nichts in den Geräten: Prüfe, ob sie hinzugefügt sind, und nutze
  **Verbindung zu NYISO testen**.
- Ausführliche Logs: `LOG_LEVEL=debug` für die Integration.

## Danksagung

Daten: NYISO (New York Independent System Operator), öffentliche Markt- und
Betriebsdaten. Emissionsfaktoren: IPCC AR5 (2014), über Electricity Maps.
Code unter der Apache-2.0-Lizenz. Nicht mit NYISO verbunden.
