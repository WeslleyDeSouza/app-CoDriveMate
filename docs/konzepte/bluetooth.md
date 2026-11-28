# Bluetooth

Stand: 28.11.2026. OBD über BLE lief einmal im Auto (siehe «Messung im Auto»);
Licht, WLAN und MFi sind ungetestet an echter Hardware.

`core/bluetooth` ist die einzige Stelle, die `@capacitor-community/bluetooth-le`
kennt. OBD-Adapter und Licht-Modul benutzen beide den Port `BleTransport`. Das
Plugin läuft nativ auf Android und iOS und nutzt im Browser Web Bluetooth.

Über diesen Port nur BLE: klassisches Bluetooth verlangt auf iOS MFi. Der Vgate iCar Pro 2S muss
im BLE-Modus laufen.

## OBD-Adapter: Einrichten, testen, verbinden

Assistent unter `#/obd`, Einstellungen unter «OBD-Adapter»: Art wählen, vorbereiten,
Adapter wählen, testen, automatisch verbinden. Der Test prüft Bluetooth, Adapter,
Bordspannung, Steuergerät und Messwerte und sagt bei einem Fehler, was zu tun ist.

- `AdapterLink` ist der Port für eine Verbindungsart. Es gibt Bluetooth LE
  (4.0 bis 5.x), WLAN und MFi. Wo eine Art nicht geht, nennt der Assistent den Grund.
  Das ELM327-Protokoll (`domain/elm327.ts`) kennt die Verbindungsart nicht.
- Bricht die Verbindung ab, versucht die App es nach 2, 5, 10 und dann alle 30 s
  wieder. Automatisches Verbinden beim Start arbeitet genauso.
- **Bei jedem Öffnen** (App kommt wieder in den Vordergrund) wird sofort verbunden, wenn
  ein Gerät eingerichtet, aber nicht verbunden ist: der OBD-Adapter, sofern «Automatisch
  verbinden» an ist (auch nach dem Trennen von Hand), das Licht-Modul, sobald eines
  bekannt ist. Ein laufender Versuch wird nicht gestört. Am Gerät ungetestet.
- Browser merken sich Geräte meist nicht: dort muss der Adapter nach jedem
  Neuladen neu gewählt werden. Auf dem iPad nicht.

### Geräteliste

In der nativen App sucht der Assistent selbst und zeigt alle Geräte in der Nähe.
«Passt vermutlich» heisst: Der Name klingt nach OBD-Adapter. «Passt vielleicht»:
Das Gerät bietet einen seriellen Dienst an, den auch andere Geräte haben. Sicher
ist es erst nach dem Verbindungstest. Im Browser bleibt die Liste des Systems,
weil Webseiten nicht frei suchen dürfen.

## OBD über WLAN und MFi

**Weder kompiliert noch an einem Gerät oder Adapter getestet.** Eigenes Plugin
`plugins/serial-native` (Swift, Kotlin), angebunden in
`telemetry/infrastructure/serial-adapter.links.ts`.

| Art | iOS | Android | Browser |
|---|---|---|---|
| WLAN (TCP) | Network.framework | `java.net.Socket` | nein, kein rohes TCP |
| MFi | ExternalAccessory | nein | nein |

- **WLAN:** Vorgabe `192.168.0.10:35000`, im Assistenten änderbar (Hostname oder IPv4,
  Port 1 bis 65535). Das Tablet muss im WLAN des Adapters sein. iOS fragt beim ersten
  Verbinden nach dem lokalen Netzwerk (`NSLocalNetworkUsageDescription`). Auf iOS ist die
  Verbindung fest an WLAN gebunden.
- **Android:** Das WLAN des Adapters hat kein Internet; mit aktiven Mobildaten kann Android
  die Verbindung falsch leiten. Das Plugin bindet sie an das WLAN, sobald die App
  `ACCESS_NETWORK_STATE` hat. Eingetragen ist nur `INTERNET`.
- **MFi:** Der Adapter wird in den iOS-Einstellungen gekoppelt, der Assistent listet die
  verbundenen Geräte. Das Protokoll `com.obdlink` (Info.plist
  `UISupportedExternalAccessoryProtocols` und `MFI_PROTOCOLS`) ist **nicht verifiziert**.
  Für eine Veröffentlichung muss der Hersteller die App freigeben. Der Hintergrundmodus
  `external-accessory` ist nicht eingetragen.

## UUIDs (aus dem Prototyp, am Gerät zu prüfen)

| Gerät | Dienst |
|---|---|
| OBD | `fff0`, `ffe0`, `18f0` (16 Bit), `e7810a71-73ae-499d-8c15-faa9aef0c3f2` |
| Licht | `6e1a0001-7c3b-4d2a-9f10-5049434153d0`, Befehl `6e1a0002…`, Status `6e1a0003…` |

Beim OBD-Adapter gewinnt der erste Dienst mit je einer Characteristic zum Lesen
(notify) und zum Schreiben.

## Messung im Auto (28.11.2026)

Erster Bericht aus dem Xsara Picasso mit einem Vgate-Adapter («IOS-Vlink», meldet
ELM327 v2.3) über BLE auf dem iPad:

- Verbindung, Startsequenz und Abfrage laufen. Protokoll: ISO 14230-4 (KWP FAST).
- Das Auto liefert die PIDs 01, 03–07, 0B–0F, 11, 13–15, 1C, 21, 47. **Kein
  Luftmassenmesser (10) und kein Tankfüllstand (2F):** Verbrauch wird aus dem
  Saugrohrdruck gerechnet, der Tank wird gezählt. Keine Fahrgestellnummer (0902),
  Modus 0A fehlt.
- Eine Abfrage dauerte etwa 230 ms, ein Zyklus (5 schnelle Werte + 1 langsamer) also
  rund 1,4 s (0,7 Hz; während des Berichts 0,3 Hz, weil er sich die Leitung teilt).
  Der Adapter wartet nach der Antwort auf weitere Steuergeräte. Seither hängt die
  Abfrage die erwartete Zahl Antworten an (`010C1`); kennt ein Adapter das nicht
  (`?`), fragt sie wieder ohne. **Die Wirkung ist im Auto noch nicht gemessen.**

### Protokoll des Lichts (aus dem Prototyp, am Modul zu prüfen)

| Befehl | Bytes |
|---|---|
| Zonen setzen | `1, Maske, ein, R, G, B, Helligkeit, Effekt, Tempo` |
| Fahrmodus | `2, Helligkeit (255 im Stand), fährt` |
| Aus | `3` |
| Als Start-Zustand speichern | `4` |

Status: Byte 0 Anzahl Zonen, Byte 3 Bordspannung × 10. Gesucht wird nach dem Dienst oder
nach den Namen «Currus Licht» und «Picasso Licht».

## Berechtigungen

| Plattform | Eingetragen |
|---|---|
| Android | `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, bis API 30 `BLUETOOTH(_ADMIN)`, Standort fein und grob |
| iOS | `NSBluetoothAlwaysUsageDescription`, `NSLocationWhenInUseUsageDescription`, Hintergrund: `bluetooth-central`, `location`, `audio` |

`@capacitor/geolocation` verlangt auf iOS zusätzlich
`NSLocationAlwaysAndWhenInUseUsageDescription` (wird dem Nutzer nicht gezeigt) und
unterstützt den Hintergrund nicht direkt. iPads ohne Mobilfunk haben kein GPS.

Zur Laufzeit: iOS und Android fragen beim ersten Suchen. Lehnt der Nutzer ab, sagt
die App das und öffnet auf Wunsch die Geräteeinstellungen; ist Bluetooth aus, sagt
sie auch das. Ab Android 12 ist das Suchen als `neverForLocation` deklariert und
braucht keinen Standort, bis Android 11 verlangt das System ihn.

Bewusst nicht eingetragen: Android-Hintergrundstandort und Foreground-Service.
Der Service folgt mit Navigation und Ansagen. Bis dahin läuft auf Android nichts
verlässlich im Hintergrund weiter. Die iOS-Hintergrundmodi sind deklariert, aber
noch von keiner Funktion benutzt; vor einer Einreichung prüfen.
