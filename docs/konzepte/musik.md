# Musik

Stand: 24.11.2026. Zielgerät zuerst iPad, Android später.

| Dienst | Lösung | Stand |
|---|---|---|
| Apple Music | Steuert die Musik-App über MediaPlayer (`plugins/media-native`): Titel, Cover, Pause, Weiter, Playlists | gebaut, auf dem iPad ungetestet |
| YouTube | eingebetteter Player am Platz der 3D-Ansicht | gebaut, im Browser geprüft |
| YouTube Music | keine offizielle Schnittstelle; Playlist-Links spielen im YouTube-Player; die App selbst über das ESP32-Modul | Modul ungetestet |
| Spotify | über das ESP32-Modul | Modul ungetestet |
| Android | Steuerung jeder Musik-App über MediaSession | offen |

## Alle Apps steuern: ESP32-Modul

iOS lässt Apps fremde Wiedergabe nicht steuern, Bluetooth-Zubehör schon. Die App
verbindet sich mit dem Modul, das Modul bittet das iPad um Kopplung und benutzt auf
derselben Verbindung den Apple Media Service von iOS. Bedienung: einmal «Modul
verbinden», einmal «Koppeln», danach von selbst.

| Dienst `6e1a0011-7c3b-4d2a-9f10-5049434153d0` | Inhalt |
|---|---|
| `…0012` Befehl (App schreibt 1 Byte) | 2 Pause/Weiter, 3 nächster, 4 vorheriger, 255 Stand senden |
| `…0013` Stand (Modul meldet) | 1 Byte Art, dann UTF-8: 0 bereit, 1 App, 2 Titel, 3 Künstler, 4 spielt |

Anleitung in der App: Einstellungen → ESP32-Modul (`#/esp`), von den Teilen bis zum
Test; die Firmware lässt sich dort herunterladen.

Firmware: `firmware/media_remote` (Arduino, NimBLE-Arduino ab 2.5), **nicht kompiliert
und nicht getestet**. Sie läuft allein auf einem ESP32; zum Zusammenlegen mit dem
Licht steht oben in der Datei, wie. Ob iOS den Media Service auch bei einer von der
App aufgebauten Verbindung freigibt, zeigt erst der Versuch (Apples Spezifikation
spricht nicht dagegen). Kein Cover, kein Start von Playlists.
Quelle: Apple Media Service Specification; NimBLE-Arduino-Beispiel ANCS.

## YouTube-Regeln

Sichtbar, mindestens 200×200, nichts davor, kein Ton im Hintergrund. Darum liegt
der Player links, wo ihn das Seitenpanel nie verdeckt, und es gibt keinen
Nur-Ton-Modus. Apps müssen sich per Referrer mit der Bundle-ID ausweisen (sonst
Fehler 153). Die Seite der iOS-App kann das nicht, deshalb ist der Player dort eine
eigene WKWebView. Quellen: developers.google.com/youtube/terms/required-minimum-functionality
und /youtube/iframe_api_reference.

Apples Dokumentation zu `MPMusicPlayerController` liess sich nicht laden; der Teil
ist aus Erfahrung geschrieben und beim ersten Build zu prüfen.

Ansagen: Das Sprach-Plugin nutzt auf iOS nicht die Audiositzung der App und sollte
Musik nur leiser stellen. Am Gerät prüfen.
