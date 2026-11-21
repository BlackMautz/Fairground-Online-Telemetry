# Changelog – Fairground Online Telemetry & Web-Fahrpult

## v1.1.0 (2026-11-21)

### Neu: Sound Express (Musik Express) Unterstützung
- Komplette Einbindung von **Sound Express** (`MusikExpress_Controller`) in `FairgroundTelemetry.dll` und im Web-Fahrpult:
  - Neuer Tab **`🎵 SOUND EXPRESS`** im Web-Fahrpult im einheitlichen Design der anderen Pulte (Vertikal-Fader, Speed-Presets, LED-Schalter).
  - Live-Telemetrie & **20-Plätze-Sicherheitsmatrix** (Grün = besetzt & Bügel zu, Rot/Gelb = besetzt & Bügel offen, Grau = leer) inkl. `MusikExpress_Harness.mode`-Erkennung.
  - Steuerung für **Motor & Fahrt**, **Freigabe (Dispatch)**, **Geschwindigkeits-Poti**, **Richtung (Vorwärts 0 / Rückwärts 1)**, **Turbo (Advanced)**, **Hupe / Sirene**, **Bügel**, **System Reset** und **Not-Aus**.
  - **S2L-Kompatibilität** für Licht, Moving Heads, Strobo, Nebel & Gäste-Reaktionen am Sound Express.
  - **8 Sound Express AutoDrive-Touren** mit sanfter Anfahrt (`10–15%`), dynamischen Tempo-Wechseln, gezielten Sirenen-Akzenten, echtem Richtungswechsel (Vorwärts & Rückwärts) und sicherer Stillstandserkennung (`canOpenHarness`) vor dem Ausstieg.

### Neu: Booster (Turaka) Tour 3
- Neue dynamische **Tour 3: THE REAL PROPELLER SHOW** mit sanften Starts, Gegenschwüngen und sauberem Park-Ablauf eingebaut.

### Verbesserungen & Fehlerbehebungen
- **MegaDance AutoDrive-Laufzeiten korrigiert:** Exakt gemessene Basis-Laufzeiten (`tourBaseScaledMs` / `tourBaseFixedMs`) für alle Touren, sodass 3–4 Min Touren wieder genau der eingestellten Dauer entsprechen (statt ~6 Min).
- **3-Sekunden-Drossel beim Abkassieren:** `collectTokens` wird jetzt global über alle Fahrgeschäfte höchstens alle 3 Sekunden ausgeführt, damit der Ticket-Einzug natürlicher wirkt.
- **Kein doppelter Browser-Tab:** `FairgroundTelemetry.dll` wartet beim Spielstart bis zu ~5,4 Sekunden auf einen bereits offenen Fahrpult-Tab (`/api/has-clients`), bevor ein neuer Tab geöffnet wird.
- **Saubere FX-Ansicht:** Nicht vorhandene Effekte (z. B. Feuerstoß & Seifenblasen beim Sound Express) werden im jeweiligen Tab ausgeblendet.

---

## v1.0.0-beta (2026-11-18)
- Erste Beta-Version für Fairground Online v1.1.3 (MegaDance, Booster, Xplosion, Pinball, S2L & Web-Fahrpult).
