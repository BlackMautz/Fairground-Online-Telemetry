# Fairground Online – Web-Fahrpult & Telemetrie (`FairgroundTelemetry`) [BETA]

[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/y7XMy8Jduq)

> ⚠️ **BETA-Hinweis:** Diese Version wurde auf **Fairground Online v1.1.3** aktualisiert, es sind jedoch noch nicht alle Funktionen und Fahrgeschäfte nach dem Update vollständig durchgetestet. Feedback & Bugreports sind willkommen!

Ein **BepInEx 6 (IL2CPP)** Plugin + integriertes **Web-Fahrpult** für *Fairground Online*, mit dem du Fahrgeschäfte, Lichtshows, Effekte, Jingles und die Kasse bequem über deinen Browser (am PC, Tablet oder Handy im WLAN) steuern kannst.

---

## Was man damit alles machen kann (Features)

- **Vollautomatischer Start (kein Konsolenfenster):**
  - Beim Spielstart startet `FairgroundTelemetry.dll` den lokalen Webserver automatisch und unsichtbar im Hintergrund und öffnet direkt **`http://localhost:8080`** in deinem Standard-Browser.
  - Beim Beenden des Spiels wird der Hintergrund-Server automatisch wieder geschlossen.
- **Live-Fahrpult & Telemetrie:**
  - Live-Anzeige von Geschwindigkeit, Status, Bügel, Gondeln, Strom/Schaltern und Fahrgeschäft-Zustand.
  - Steuerung für Fahrgeschäfte (u. a. **Break Dance, Mega Dance, Booster, AirWolf, Pinball, Hot Shot, Xplosion, Teufelstanz, Rotator, Turaka** usw.).
- **Autodrive-Modus:**
  - Automatische Fahrprogramme für ausgewählte Fahrgeschäfte direkt über das Web-Dashboard.
- **Licht, Nebel & Effekte / Sound-to-Light (S2L):**
  - Steuerung von Lichtprogrammen, Strobe, Flammen, Nebel und dynamischen S2L-Reaktionen passend zur Musik.
- **Jingle-Deck & Besucher-Reaktionen:**
  - Scannt deinen `Documents\Fairground Online Jingles`-Ordner und verknüpft Jingles mit Peep-Reaktionen (Hände hoch, Klatschen, Schreien, Zugabe).
- **Automatische Kasse (Auto-Cashier):**
  - Nimmt beim Sitzen an der Kasse automatisch Geld an, berechnet Wechselgeld und gibt Chips aus.
- **WLAN-Nutzung (Handy / Tablet):**
  - Über die im Dashboard angezeigte lokale IP (oder QR-Code) kannst du das Fahrpult auch als Touch-Pult auf deinem Tablet oder Smartphone im selben WLAN nutzen.

---

## Voraussetzungen
1. **BepInEx 6 (Unity IL2CPP)** für *Fairground Online* (z. B. [Fairground-Online-BepInEx](https://github.com/BlackMautz/Fairground-Online-BepInEx)).
2. **Node.js** (Standard-Installation unter Windows, wird von der Mod automatisch unsichtbar im Hintergrund gestartet).

---

## Installation
1. Lade das Repository herunter (oder entpacke das Release).
2. Kopiere die beiden Ordner in dein *Fairground Online*-Hauptverzeichnis:
   - `BepInEx\plugins\FairgroundTelemetry.dll` → `<Spielordner>\BepInEx\plugins\FairgroundTelemetry.dll`
   - `FairgroundApp\` → `<Spielordner>\FairgroundApp\`
3. **Spiel starten** – der Webserver startet automatisch im Hintergrund und dein Browser öffnet sich von selbst mit dem Fahrpult (`http://localhost:8080`).

---

## 💬 Community & Support (Discord)
Fragen, Bugreports zur BETA oder weitere Fairground-Online-Mods? Komm auf unseren Discord-Server:
👉 **[Hier dem Discord beitreten (discord.gg/y7XMy8Jduq)](https://discord.gg/y7XMy8Jduq)**
