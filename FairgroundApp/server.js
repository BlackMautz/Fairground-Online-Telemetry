// Fairground Online Localhost Control Server (Pure Node.js, Zero External Dependencies)
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 8080;
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(__dirname, 'public');

const STATE_FILE = path.join(ROOT_DIR, 'state.json');
const TELEMETRY_FILE = path.join(ROOT_DIR, 'telemetry.json');
const CMD_FILE = path.join(ROOT_DIR, 'command.json');
const CMD_TELEMETRY_FILE = path.join(ROOT_DIR, 'command_telemetry.json');
const S2L_SETTINGS_FILE = path.join(ROOT_DIR, 's2l_settings.json');
const JINGLE_CONFIG_FILE = path.join(__dirname, 'jingle_reactions.json');

// --- JINGLE ORDNER SCANNER & NPC-REAKTIONS-KONFIGURATION ---
let jingleConfig = {
    enabled: true,
    reactions: {}
};

function guessDefaultJingleReaction(filename) {
    const n = String(filename || '').toLowerCase();
    // Hupen, Stopp-Ansagen, Sicherheitsbügel, Tickets -> Keine NPC-Reaktion
    if (n.includes('horn') || n.includes('buegel') || n.includes('bügel') || n.includes('safety') || n.includes('pull down') || n.includes('pull up') || n.includes('ticket') || n.includes('stop') || n.includes('ende ') || n.includes('steigen sie zu')) {
        return 'none';
    }
    // Hände hoch
    if (n.includes('hands up') || n.includes('arme-nach-oben') || n.includes('arme hoch') || n.includes('hände')) {
        return 'hands';
    }
    // Klatschen
    if (n.includes('clap') || n.includes('klatsch')) {
        return 'clap';
    }
    // Zugabe / Replay / Nochmal
    if (n.includes('replay') || n.includes('nochmal') || n.includes('zugabe') || n.includes('letzte runde') || n.includes('not get enough') || n.includes('nicht genug')) {
        return 'again';
    }
    // Kreischen / High Speed / Action
    if (n.includes('freaky') || n.includes('high speed') || n.includes('powerr') || n.includes('power(') || n.includes('party alarm') || n.includes('abflug') || n.includes('lets go') || n.includes('lets-go') || n.includes('so geil') || n.includes('finale')) {
        return 'scream';
    }
    // Party / Musik-Jingles
    if (n.includes('zamba') || n.includes('scooter') || n.includes('feel good') || n.includes('hampster') || n.includes('number one') || n.includes('breakdance') || n.includes('ready')) {
        return 'random';
    }
    return 'none';
}

function loadJingleConfig() {
    try {
        if (fs.existsSync(JINGLE_CONFIG_FILE)) {
            const raw = JSON.parse(fs.readFileSync(JINGLE_CONFIG_FILE, 'utf8'));
            if (typeof raw.enabled === 'boolean') jingleConfig.enabled = raw.enabled;
            if (raw.reactions && typeof raw.reactions === 'object') {
                jingleConfig.reactions = { ...raw.reactions };
            }
        }
    } catch (e) {}
}
loadJingleConfig();

function saveJingleConfig() {
    try {
        fs.writeFileSync(JINGLE_CONFIG_FILE, JSON.stringify(jingleConfig, null, 2), 'utf8');
    } catch (e) {}
}

function scanUserJingles() {
    const home = os.homedir();
    const docsJinglesDir = path.join(home, 'Documents', 'Fairground Online Jingles');
    const snapFile = path.join(home, 'AppData', 'LocalLow', 'CoasterGalaxyWorld', 'Fairground Online', 'Mosli_Studio', 'Fairground Online Jingles_SnapShot_f');

    const itemsMap = new Map(); // key: "Deck/Filename" -> { key, deck, file, name, reaction }
    const audioExts = new Set(['.ogg', '.mp3', '.wav', '.flac']);

    // 1. Primär: Direkt den Dokumente-Ordner "Fairground Online Jingles" (A-J) auslesen
    try {
        if (fs.existsSync(docsJinglesDir)) {
            const entries = fs.readdirSync(docsJinglesDir, { withFileTypes: true });
            for (const ent of entries) {
                if (ent.isDirectory()) {
                    const deck = ent.name;
                    const deckPath = path.join(docsJinglesDir, deck);
                    const files = fs.readdirSync(deckPath, { withFileTypes: true });
                    let slotIdx = 1;
                    for (const f of files) {
                        if (f.isFile()) {
                            const ext = path.extname(f.name).toLowerCase();
                            if (audioExts.has(ext)) {
                                const baseNoExt = path.basename(f.name, ext);
                                const key = `${deck}/${f.name}`;
                                if (jingleConfig.reactions[key] === undefined) {
                                    jingleConfig.reactions[key] = guessDefaultJingleReaction(f.name);
                                }
                                itemsMap.set(key, {
                                    key,
                                    deck,
                                    slot: slotIdx++,
                                    file: f.name,
                                    name: baseNoExt,
                                    reaction: jingleConfig.reactions[key]
                                });
                            }
                        }
                    }
                } else if (ent.isFile()) {
                    const ext = path.extname(ent.name).toLowerCase();
                    if (audioExts.has(ext)) {
                        const baseNoExt = path.basename(ent.name, ext);
                        const key = `Root/${ent.name}`;
                        if (jingleConfig.reactions[key] === undefined) {
                            jingleConfig.reactions[key] = guessDefaultJingleReaction(ent.name);
                        }
                        itemsMap.set(key, {
                            key,
                            deck: 'Root',
                            slot: itemsMap.size + 1,
                            file: ent.name,
                            name: baseNoExt,
                            reaction: jingleConfig.reactions[key]
                        });
                    }
                }
            }
        }
    } catch (e) {}

    // 2. Fallback: Mosli_Studio Snapshot auslesen falls Ordner leer oder woanders liegt
    if (itemsMap.size === 0) {
        try {
            if (fs.existsSync(snapFile)) {
                const lines = fs.readFileSync(snapFile, 'utf8').split(/\r?\n/);
                const deckSlots = {};
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    const ext = path.extname(trimmed).toLowerCase();
                    if (!audioExts.has(ext)) continue;
                    const file = path.basename(trimmed);
                    const baseNoExt = path.basename(trimmed, ext);
                    const parentDir = path.basename(path.dirname(trimmed)) || 'A';
                    const deck = parentDir.length <= 3 ? parentDir : 'A';
                    deckSlots[deck] = (deckSlots[deck] || 0) + 1;
                    const key = `${deck}/${file}`;
                    if (jingleConfig.reactions[key] === undefined) {
                        jingleConfig.reactions[key] = guessDefaultJingleReaction(file);
                    }
                    if (!itemsMap.has(key)) {
                        itemsMap.set(key, {
                            key,
                            deck,
                            slot: deckSlots[deck],
                            file,
                            name: baseNoExt,
                            reaction: jingleConfig.reactions[key]
                        });
                    }
                }
            }
        } catch (e) {}
    }

    saveJingleConfig();
    return Array.from(itemsMap.values());
}

// S2L Settings In-Memory Override & Persistence (so Web-App checkboxes work immediately even before game restarts)
const S2L_KEY_TO_FILE = {
    s2lSensitivity: 'sensitivity',
    s2lPresetLow: 'presetlow',
    s2lPresetHigh: 'presethigh',
    s2lStrobo: 'strobo',
    s2lFog: 'fog',
    s2lFlame: 'flame',
    s2lLED: 'led',
    s2lLight1: 'light1',
    s2lLight2: 'light2',
    s2lLight3: 'light3',
    s2lLight4: 'light4',
    s2lLight5: 'light5',
    s2lLight6: 'light6',
    s2lLight7: 'light7',
    s2lLight8: 'light8',
    s2lLight9: 'light9',
    s2lColorStrobe: 'colorstrobe',
    s2lSpot: 'spot',
    s2lBubble: 'bubble',
    s2lPeepsHands: 'peepshands',
    s2lPeepsClap: 'peepsclap',
    s2lAllEffects: 'alles',
    s2lNightMode: 'night',
    s2lLoop: 'loop',
    s2lKreuzMotorPauseEnabled: 'gondelpause'
};

let s2lServerOverrides = {};
let pkTipUserActive = false;

function loadS2LSettingsFromDisk() {
    try {
        if (fs.existsSync(S2L_SETTINGS_FILE)) {
            const lines = fs.readFileSync(S2L_SETTINGS_FILE, 'utf8').split(/\r?\n/);
            const fileToCmd = {};
            for (const [cmdK, fileK] of Object.entries(S2L_KEY_TO_FILE)) {
                fileToCmd[fileK] = cmdK;
            }
            for (const line of lines) {
                const parts = line.split('=');
                if (parts.length !== 2) continue;
                const fk = parts[0].trim();
                const fv = parts[1].trim();
                const ck = fileToCmd[fk];
                if (!ck) continue;
                if (ck === 's2lSensitivity' || ck === 's2lPresetLow' || ck === 's2lPresetHigh') {
                    const num = parseInt(fv, 10);
                    if (!isNaN(num)) s2lServerOverrides[ck] = num;
                } else {
                    s2lServerOverrides[ck] = (fv === 'true');
                }
            }
        }
    } catch (e) {}
}
loadS2LSettingsFromDisk();

function saveS2LSettingsToDisk(newCmds) {
    let changed = false;
    for (const k of Object.keys(newCmds)) {
        if (S2L_KEY_TO_FILE[k] !== undefined) {
            s2lServerOverrides[k] = newCmds[k];
            changed = true;
        } else if (k === 'setS2LLight') {
            s2lServerOverrides.s2lLightActive = !!newCmds[k];
        }
    }
    if (!changed) return;

    try {
        const map = {};
        if (fs.existsSync(S2L_SETTINGS_FILE)) {
            const lines = fs.readFileSync(S2L_SETTINGS_FILE, 'utf8').split(/\r?\n/);
            for (const line of lines) {
                const parts = line.split('=');
                if (parts.length === 2) {
                    map[parts[0].trim()] = parts[1].trim();
                }
            }
        }
        for (const [cmdK, fileK] of Object.entries(S2L_KEY_TO_FILE)) {
            if (s2lServerOverrides[cmdK] !== undefined) {
                map[fileK] = String(s2lServerOverrides[cmdK]);
            }
        }
        const outLines = Object.entries(map).map(([k, v]) => `${k}=${v}`);
        fs.writeFileSync(S2L_SETTINGS_FILE, outLines.join('\r\n') + '\r\n', 'utf8');
    } catch (e) {}
}

// MIME types
const MIME_TYPES = {
    '.html': 'text/html; charset=UTF-8',
    '.css': 'text/css; charset=UTF-8',
    '.js': 'application/javascript; charset=UTF-8',
    '.json': 'application/json; charset=UTF-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

// SSE Client list
let sseClients = [];
let lastMergedStateJson = '';

// --- AUTODRIVE ENGINE IN NODE.JS ---
const TOURS = [
    { name: "Klassiker", desc: "Harmonischer Aufbau & rhythmische Schwünge" },
    { name: "Reko-Drift", desc: "Schnelle Schübe & Katapult-Momente" },
    { name: "Turbo-Power", desc: "Druckvolle Vollgasphasen" },
    { name: "Katapult", desc: "Schock-Gaps & Speed-Drops" },
    { name: "Showdown", desc: "Festival-Ritt mit maximaler Dynamik" },
    { name: "Freitag Abend Party", desc: "Brake-Dancer Style: Direkte Schwünge & Party-Stimmung" },
    { name: "Freitag Abend Party (Variabel)", desc: "Wie Tour 6, aber jede Fahrt leicht anders" },
    { name: "Samstag Abend", desc: "Samstag Abend Party (Variabel)" },
    { name: "Samstag Abend Party - Ultimate Motion Chaos", desc: "Variabel" },
    { name: "Zufallstour", desc: "Zufällige Auswahl der 7 Touren" }
];

let autoDriveState = {
    running: false,
    phase: "BEREIT",
    remaining: 0,
    timeFormatted: "0:00",
    tourIndex: 0,
    tourName: "Klassiker",
    night: false,
    loop: false,
    pauseSec: 60,
    durationMin: 4,
    jinglePeepReact: jingleConfig.enabled,
    lastJingleTriggered: ""
};

let xplosionAutoDriveState = {
    running: false,
    phase: "BEREIT",
    remaining: 0,
    timeFormatted: "0:00",
    loop: false,
    pauseSec: 25,
    autoFog: true,
    smartSensors: true
};
let xplosionAutoCancel = false;

function setXplosionPhase(phase, sec) {
    xplosionAutoDriveState.phase = phase;
    if (sec !== undefined) {
        xplosionAutoDriveState.remaining = sec;
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        xplosionAutoDriveState.timeFormatted = `${m}:${s < 10 ? '0' : ''}${s}`;
    }
}

async function waitXplosionCancelable(ms) {
    const start = Date.now();
    while (Date.now() - start < ms) {
        if (xplosionAutoCancel) return false;
        // Safety: Pult verlassen?
        if (lastValidTelemetry && lastValidTelemetry.operator && !lastValidTelemetry.operator.xplosionSeated) {
            xplosionAutoCancel = true;
            return false;
        }
        await sleep(100);
    }
    return !xplosionAutoCancel;
}

function getLatestTelemetry() {
    try {
        if (fs.existsSync(TELEMETRY_FILE)) {
            const raw = fs.readFileSync(TELEMETRY_FILE, 'utf8');
            if (raw.trim().length > 0) lastValidTelemetry = JSON.parse(raw);
        }
    } catch (e) {}
    return lastValidTelemetry || {};
}

async function runXplosionAutoRoutine() {
    xplosionAutoCancel = false;
    xplosionAutoDriveState.running = true;

    while (xplosionAutoDriveState.running && !xplosionAutoCancel) {
        try {
            // ============================================================
            // SCHRITT 0: BEREITSTELLUNG (Gondel ganz unten am Boden?)
            // ============================================================
            writeCommand({ setXplosionPower: true });
            
            const initTel = getLatestTelemetry();
            const initXp = initTel.xplosion || {};
            if (!initXp.isDown) {
                setXplosionPhase("GONDEL ANDOCKEN", 6);
                writeCommand({ setXplosionGondolaDown: true });
                while (!xplosionAutoCancel) {
                    const t = getLatestTelemetry();
                    if ((t.xplosion || {}).isDown) break;
                    if (!await waitXplosionCancelable(1000)) break;
                }
                writeCommand({ setXplosionGondolaStop: true });
            }

            // ============================================================
            // SCHRITT 1: EINSTIEG (Warten bis 2 Gäste sitzen)
            // ============================================================
            setXplosionPhase("EINSTIEG DER GÄSTE", 0);

            let waitGuests = 0;
            while (!xplosionAutoCancel) {
                const tel = getLatestTelemetry();
                const xp = tel.xplosion || {};
                const pass = (xp.passengers !== undefined) ? xp.passengers : ((xp.seat1Occupied && xp.seat2Occupied) ? 2 : ((xp.seat1Occupied || xp.seat2Occupied) ? 1 : 0));

                if (pass >= 2) {
                    setXplosionPhase("GONDEL VOLL (2/2) ✓", 3);
                    await waitXplosionCancelable(3000);
                    break;
                } else if (pass === 1) {
                    setXplosionPhase("1 GAST SITZT (WARTE AUF 2.)", waitGuests);
                } else {
                    setXplosionPhase(`WARTE AUF GÄSTE (${waitGuests}s)`, waitGuests);
                }

                waitGuests++;
                if (!await waitXplosionCancelable(1000)) break;
            }
            if (xplosionAutoCancel) break;

            // ============================================================
            // SCHRITT 2: WARTEN BIS SPIELER / NPC KASSIERT HAT
            // ============================================================
            setXplosionPhase("WARTE AUF TICKET-CHECK", 0);
            let waitTokens = 0;
            while (!xplosionAutoCancel) {
                const tel = getLatestTelemetry();
                const clickable = tel.clickableTokens || 0;

                // Sobald 0 Tickets offen sind, hat der Spieler/die KI kassiert!
                if (clickable === 0) {
                    setXplosionPhase("TICKETS EINGESAMMELT ✓", 2);
                    if (!await waitXplosionCancelable(2000)) break;
                    break;
                }

                waitTokens++;
                setXplosionPhase(`TICKETS WERDEN KASSIERT (${clickable} offen)`, waitTokens);
                if (!await waitXplosionCancelable(1000)) break;
            }
            if (xplosionAutoCancel) break;

            // ============================================================
            // SCHRITT 3 (Nutzer-Schritt 1): HUPE & WARTEN BIS NPC BÜGEL SCHLIESST
            // Hupe signalisiert dem NPC-Mitarbeiter hinzugehen und die Bügel zuzumachen!
            // ============================================================
            setXplosionPhase("HUPE (START-SIGNAL)", 1);
            writeCommand({ setHorn: true });
            await waitXplosionCancelable(1000);
            writeCommand({ setHorn: false });

            setXplosionPhase("WARTE AUF BÜGEL (NPC)", 0);
            let waitHarness = 0;
            while (!xplosionAutoCancel) {
                const tel = getLatestTelemetry();
                const xp = tel.xplosion || {};
                
                // Sobald beide Bügel zu sind (oder der erste schließt), schalten wir direkt Hebewerk HOCH!
                // Dadurch ist Rot_Switch.State = 2 (Hoch), wodurch der NPC die Bügel NICHT wieder öffnet!
                if (xp.harnessClosed && !xp.harnessOpened) {
                    writeCommand({ setXplosionGondolaUp: true });
                    setXplosionPhase("BÜGEL VERRIEGELT ✓", 2);
                    // 1 Sekunde Puffer, damit der NPC zur Seite tritt
                    if (!await waitXplosionCancelable(1000)) break;
                    break;
                }
                waitHarness++;
                setXplosionPhase(`WARTE AUF BÜGEL (${waitHarness}s)`, waitHarness);
                if (!await waitXplosionCancelable(1000)) break;
            }
            if (xplosionAutoCancel) break;

            // ============================================================
            // SCHRITT 4 (Nutzer-Schritt 2): PLATFORM HOCH & SEILE SPANNEN
            // Bis 70% Seilspannung läuft S2L normal weiter.
            // Ab >= 70% Seilspannung: S2L EINMALIG pausieren, 💨 NEBEL & 🔴 ALLE LICHTER AUF ROT!
            // ============================================================
            setXplosionPhase("SEILE SPANNEN (HOCH)", 20);
            writeCommand({ setXplosionGondolaUp: true });

            let s2lWasActiveBeforeRedPhase = false;
            let redPhaseStarted = false;

            // Nur EINMAL beim Erreichen von 70% aufrufen (kein sekündlicher Spam!)
            const startRedPreLaunchOnce = () => {
                writeCommand({
                    setS2LLight: false,             // S2L während der roten Pre-Launch-Phase stummschalten
                    ...(xplosionAutoDriveState.autoFog ? { setFog: true } : {}),
                    setTLProg: 27,                  // 27 = "26-Red" auf den Xplosion-Stangen
                    setChaserProg: 0,               // 0 = Solid (durchgehend Rot ohne Blink-Muster)
                    setLightProg: 26,               // Rot auf klassischen Tower-Lights
                    setMHLightProg: 2               // Rot auf Moving Heads
                });
            };

            let tensionWait = 0;
            while (!xplosionAutoCancel && tensionWait < 30) {
                const tel = getLatestTelemetry();
                const xp = tel.xplosion || {};
                const curT = (xp.ropeTension !== undefined) ? xp.ropeTension : 1.0;
                const minT = (xp.maxRopeTension !== undefined && xp.maxRopeTension >= 0) ? xp.maxRopeTension : 0.0;
                const denom = Math.max(0.01, 1.0 - minT);
                const tensionPct = Math.min(100, Math.max(0, Math.round(((1.0 - curT) / denom) * 100)));

                // Sobald 70% Seilspannung erreicht ist: EINMALIG S2L pausieren + Nebel & Rot setzen!
                if (tensionPct >= 70 && !redPhaseStarted) {
                    redPhaseStarted = true;
                    s2lWasActiveBeforeRedPhase = !!tel.s2lLightActive;
                    startRedPreLaunchOnce();
                }

                setXplosionPhase(
                    redPhaseStarted ? `SEILE SPANNEN (${tensionPct}%) 💨🔴` : `SEILE SPANNEN (${tensionPct}%)`,
                    Math.max(6, 20 - tensionWait)
                );

                // Sobald 100% Seilspannung erreicht ist (curT <= minT + 0.01), braucht der Stempel/Motor
                // noch ~6 Sekunden Nachlaufzeit bis die Motoren & der Sound im Spiel komplett ausgehen!
                if (xp.ropeAtMaxTension || xp.dispatchable || curT <= (minT + 0.01)) {
                    if (!redPhaseStarted) {
                        redPhaseStarted = true;
                        s2lWasActiveBeforeRedPhase = !!tel.s2lLightActive;
                        startRedPreLaunchOnce();
                    }
                    for (let mWait = 6; mWait > 0 && !xplosionAutoCancel; mWait--) {
                        setXplosionPhase(`100% – WARTE AUF MOTOR-STOPP (${mWait}s) 💨🔴`, mWait + 3);
                        if (!await waitXplosionCancelable(1000)) break;
                    }
                    break;
                }

                tensionWait++;
                if (!await waitXplosionCancelable(1000)) break;
            }
            if (xplosionAutoCancel) {
                if (s2lWasActiveBeforeRedPhase) writeCommand({ setS2LLight: true });
                break;
            }

            // ============================================================
            // SCHRITT 5 (Nutzer-Schritt 3): AUF 0 / STAND POSITION BRINGEN
            // Erst wenn die Motoren aus sind, Schalter auf 1 (Stand) legen!
            // ============================================================
            setXplosionPhase("SCHALTER AUF STAND 💨🔴", 3);
            writeCommand({ setXplosionGondolaStop: true });
            if (!await waitXplosionCancelable(2500)) {
                if (s2lWasActiveBeforeRedPhase) writeCommand({ setS2LLight: true });
                break;
            }

            // ============================================================
            // SCHRITT 6 (Nutzer-Schritt 4): WARTEN BIS FREIGABE DA IST, DANN STARTEN
            // ============================================================
            setXplosionPhase("WARTE AUF FREIGABE 💨🔴", 1);
            let dispWait = 0;
            while (!xplosionAutoCancel && dispWait < 14) {
                const tel = getLatestTelemetry();
                const xp = tel.xplosion || {};
                if (xp.dispatchable) {
                    break;
                }
                dispWait++;
                if (!await waitXplosionCancelable(500)) break;
            }
            if (xplosionAutoCancel) {
                if (s2lWasActiveBeforeRedPhase) writeCommand({ setS2LLight: true });
                break;
            }

            // 🚀 LAUNCH! (Nebel & Rote Lichter laufen bereits seit 70% und bleiben beim Abschuss an!)
            setXplosionPhase("🚀 LAUNCH!", 35);
            writeCommand({ 
                setXplosionLaunch: true, 
                xpDispatch: true, 
                setStrobo: true, 
                peepScream: true, 
                peepRatio: 1.0,
                setTLProg: 27
            });
            if (!await waitXplosionCancelable(3000)) {
                if (s2lWasActiveBeforeRedPhase) writeCommand({ setS2LLight: true });
                break;
            }
            if (xplosionAutoDriveState.autoFog) writeCommand({ setFog: false });
            writeCommand({ setStrobo: false });

            // Nach dem Abschuss im Flug: S2L wieder einschalten (falls es vorher aktiv war)
            if (s2lWasActiveBeforeRedPhase) {
                writeCommand({ setS2LLight: true });
            }

            // ============================================================
            // SCHRITT 7 (Nutzer-Schritt 5): FLUG & AUSPENDELN
            // Realistische Bungee-Flugzeit (~35 Sekunden), danach sofort runterholen!
            // ============================================================
            const flightDurationSec = Math.max(25, Math.min(60, xplosionAutoDriveState.pauseSec || 35));
            let flightWait = 0;
            while (!xplosionAutoCancel && flightWait < flightDurationSec) {
                flightWait++;
                setXplosionPhase("FLUG & AUSPENDELN", Math.max(0, flightDurationSec - flightWait));
                if (!await waitXplosionCancelable(1000)) break;
            }
            if (xplosionAutoCancel) break;

            // ============================================================
            // SCHRITT 8 (Nutzer-Schritt 6): RUNTERHOLEN & WARTEN BIS SIE WIEDER STEHT
            // ============================================================
            setXplosionPhase("HEBEWERK SENKEN (RUNTER)", 15);
            writeCommand({ setXplosionGondolaDown: true });
            let downWait = 0;
            while (!xplosionAutoCancel && downWait < 40) {
                const t = getLatestTelemetry();
                const xp = t.xplosion || {};
                if (xp.isDown) break;
                // Alle 4 Sekunden sicherheitshalber nachsenden, falls die Seilfreigabe im Spiel gerade erst frei wurde
                if (downWait > 0 && downWait % 4 === 0) {
                    writeCommand({ setXplosionGondolaDown: true });
                }
                downWait++;
                setXplosionPhase("HEBEWERK SENKEN (RUNTER)", Math.max(1, 15 - Math.floor(downWait / 2)));
                if (!await waitXplosionCancelable(1000)) break;
            }
            writeCommand({ setXplosionGondolaStop: true });

            setXplosionPhase("AUSSTIEG FREIGEBEN", 5);
            writeCommand({ peepClap: true, peepRatio: 0.95 });
            if (!await waitXplosionCancelable(5000)) break;

            // Schleife (Loop)
            if (xplosionAutoDriveState.loop && !xplosionAutoCancel) {
                setXplosionPhase("FAHRGASTWECHSEL", 4);
                if (!await waitXplosionCancelable(4000)) break;
            } else {
                break;
            }
        } catch (e) {
            console.error('Xplosion AutoDrive error:', e);
            break;
        }
    }

    xplosionAutoDriveState.running = false;
    setXplosionPhase("BEREIT", 0);
}

function stopXplosionAutoDrive() {
    xplosionAutoCancel = true;
    xplosionAutoDriveState.running = false;
    setXplosionPhase("GESTOPPT", 0);
    writeCommand({ setXplosionGondolaStop: true, setFog: false, setStrobo: false });
}

// --- PINBALL (FLIPPER) AUTODRIVE ENGINE ---
let pinballAutoDriveState = {
    running: false,
    phase: "BEREIT",
    remaining: 0,
    timeFormatted: "4:00",
    tourIndex: 0,
    tourName: "★ PROFI-SHOW: XXL Action-Mix (4 Min) ★",
    loop: false,
    pauseSec: 45,
    durationMin: 4,
    jinglePeepReact: jingleConfig.enabled
};
let pinballAutoCancel = false;

const PINBALL_TOURS = [
    "★ ULTIMATE SHOWMAN-MIX (Max Kinetik & Doppel-Snaps) ★",
    "Tour 2: SIMON (Meeß Show-Choreo 00:00 - 05:25)",
    "Tour 3: Test 1 (Exakter Ablauf 00:00 - 05:25)",
    "Tour 4: Turbo-Schleuder (Maximaler Hub & Vollgas)",
    "Tour 5: Freitag Abend Party (Show & Stotterbremse)",
    "Tour 6: Klassiker (Sanfter Hub & Finale)"
];

function setPinballPhase(phase, sec) {
    pinballAutoDriveState.phase = phase;
    if (sec !== undefined) {
        pinballAutoDriveState.remaining = Math.max(0, Math.round(sec));
        const m = Math.floor(pinballAutoDriveState.remaining / 60);
        const s = pinballAutoDriveState.remaining % 60;
        pinballAutoDriveState.timeFormatted = `${m}:${s < 10 ? '0' : ''}${s}`;
    }
}

async function waitPinballCancelable(ms) {
    const start = Date.now();
    while (Date.now() - start < ms) {
        if (pinballAutoCancel) return false;
        await sleep(100);
    }
    return !pinballAutoCancel;
}

async function runPinballAutoRoutine(tourIdx = 0, durationMin = 3) {
    if (pinballAutoDriveState.running) stopPinballAutoDrive();
    await sleep(250);

    pinballAutoCancel = false;
    pinballAutoDriveState.running = true;
    pinballAutoDriveState.tourIndex = tourIdx;
    pinballAutoDriveState.tourName = PINBALL_TOURS[tourIdx] || PINBALL_TOURS[0];
    pinballAutoDriveState.durationMin = Math.max(1, Math.min(6, durationMin || 3));

    while (pinballAutoDriveState.running && !pinballAutoCancel) {
        let timerInterval = null;
        try {
            // ==========================================
            // 1. WARTEN BIS VOLL & TICKETS SAMMELN
            // ==========================================
            setPinballPhase("WARTEN BIS VOLL & TICKETS SAMMELN", 0);
            while (!pinballAutoCancel) {
                // Laufend Tickets abkassieren
                writeCommand({ collectTokens: true });

                const telem = getLatestTelemetry() || {};
                const p = telem.pinball || {};
                const s = telem.seats || {};
                const clickable = telem.clickableTokens !== undefined ? telem.clickableTokens : 0;
                
                // Besetzung prüfen (totalGondolas = 24, occupiedGondolas = wie viele belegt sind)
                const occ = p.occupiedGondolas !== undefined ? p.occupiedGondolas : (s.passengers || 0);
                const total = p.totalGondolas || 24;

                setPinballPhase(`WARTEN BIS VOLL (${occ}/${total} Plätze, ${clickable} Tickets offen)`, 0);

                // Wenn VOLL ist (mindestens 20 von 24 besetzt oder Park-Schlange leer und mindestens besetzt) UND alle Tickets kassiert:
                const isFull = (occ >= 20 || (total > 0 && occ >= total));
                const allTokensCollected = (clickable === 0);

                if (isFull && allTokensCollected) {
                    break;
                }

                if (!await waitPinballCancelable(1000)) break;
            }

            // Sicherstellen dass wirklich kein einziges Ticket mehr offen ist
            let tokenClearWait = 0;
            while (!pinballAutoCancel && tokenClearWait < 5) {
                const telem = getLatestTelemetry() || {};
                if ((telem.clickableTokens || 0) === 0) break;
                writeCommand({ collectTokens: true });
                tokenClearWait++;
                if (!await waitPinballCancelable(1000)) break;
            }
            if (pinballAutoCancel) break;

            // ==========================================
            // 2. BÜGEL ZU DRÜCKEN
            // ==========================================
            setPinballPhase("BÜGEL ZU DRÜCKEN", 2);
            writeCommand({ setPinballHarness: true, setPinballPlateSpeed: 0 });
            if (!await waitPinballCancelable(1500)) break;

            // ==========================================
            // 3. HUPEN (WEGEN NPC START DIE ALLE BÜGEL ZUMACHEN)
            // ==========================================
            setPinballPhase("HUPEN (BÜGEL-KONTROLLE)", 2);
            writeCommand({ setHorn: true });
            if (!await waitPinballCancelable(1200)) break;
            writeCommand({ setHorn: false });
            if (!await waitPinballCancelable(800)) break;

            // WARTEN BIS WIRKLICH ALLE 24 BÜGEL ZU SIND!
            // Erst wenn alle geschlossen sind (closedGondolas == totalGondolas oder harnessClosed == true), darf es weitergehen!
            setPinballPhase("WARTE AUF BÜGEL-KONTROLLE DURCH NPCS", 0);
            while (!pinballAutoCancel) {
                const telem = getLatestTelemetry() || {};
                const p = telem.pinball || {};
                const s = telem.seats || {};

                const total = p.totalGondolas || 24;
                const closed = p.closedGondolas !== undefined ? p.closedGondolas : (s.closedHarnesses || 0);
                const isAllClosed = p.harnessClosed === true || (total > 0 && closed >= total);

                setPinballPhase(`BÜGEL-KONTROLLE (${closed}/${total} ZU)`, 0);

                if (isAllClosed && !p.canOpenHarness) {
                    break;
                }
                if (!await waitPinballCancelable(1000)) break;
            }
            if (pinballAutoCancel) break;
            if (!await waitPinballCancelable(1500)) break;

            // ==========================================
            // 4. DANN START DRÜCKEN (DISPATCH)
            // ==========================================
            setPinballPhase("START FREIGABE (DISPATCH)", 3);
            writeCommand({
                setPinballPlateSpeed: 0,
                setPinballDispatch: true
            });
            if (!await waitPinballCancelable(1200)) break;

            // ==========================================
            // 5. GANZ NORMALE AUTOFAHRT
            // ==========================================
            setPinballPhase("START VORWÄRTS", 2);
            writeCommand({
                setPinballDirection: 0,
                setPinballAutoBrake: true
            });
            if (!await waitPinballCancelable(800)) break;

            const totalRideSec = pinballAutoDriveState.durationMin * 60;
            let currentSec = totalRideSec;
            timerInterval = setInterval(() => {
                if (currentSec > 0 && !pinballAutoCancel && pinballAutoDriveState.running) {
                    currentSec--;
                    pinballAutoDriveState.remaining = currentSec;
                    const m = Math.floor(currentSec / 60);
                    const s = currentSec % 60;
                    pinballAutoDriveState.timeFormatted = `${m}:${s < 10 ? '0' : ''}${s}`;
                }
            }, 1000);

            // Skalierung: Bei 4 Min (240s) = Faktor 1.0 (Summe aller Action-Phasen ist exakt 210s + 20s Intro + 10s Outro = 240s)
            const scaleMs = (ms) => ((tourIdx === 1 || tourIdx === 2) ? ms : Math.max(1000, Math.round(ms * (pinballAutoDriveState.durationMin / 4))));

            // Hilfsfunktion: Flipper-Whip (Platte aktiv auf 35% abfallen lassen, bis wirklich 35% erreicht sind, dann sofort 100% Snap!)
            const triggerFlipperWhip = async (label = "WHIP: 35% ➔ 100% SNAP!") => {
                setPinballPhase(label, currentSec);
                writeCommand({ setPinballPlateSpeed: 0.35, peepScream: false });
                // Warten bis der Poti bzw. die tatsächliche Drehgeschwindigkeit auf <= 40% runter ist (oder max 4 Sekunden)
                let dropWait = 0;
                while (!pinballAutoCancel && dropWait < 40) {
                    const p = (getLatestTelemetry().pinball) || {};
                    const spd = Math.abs(p.plateSpeedPercent !== undefined ? p.plateSpeedPercent : (p.platePoti || 1.0));
                    if (spd <= 0.40) break;
                    dropWait++;
                    await sleep(100);
                }
                // Sofort ohne Pause blitzschnell auf 100% hochreissen!
                writeCommand({ setPinballPlateSpeed: 1.0, peepScream: true, peepRatio: 1.0 });
            };

            // Hilfsfunktion: Hubarm verstellen UND GLEICHZEITIG mit Drehzahl-Dynamik spielen!
            // (Beim Senken/Heben direkt mit der Drehgeschwindigkeit arbeiten: z.B. Tauchgang auf 35% und beim Katapult auf 100% Vollgas)
            const moveHubWithDynamicSpeed = async (targetPct, speedDuringMove = 0.80, finishSpeed = 1.0, maxWaitSec = 8) => {
                writeCommand({ setPinballPlateSpeed: speedDuringMove });
                let checks = 0;
                while (!pinballAutoCancel && checks < maxWaitSec * 10) {
                    const p = (getLatestTelemetry().pinball) || {};
                    const cur = p.hubPercent !== undefined ? p.hubPercent : 50;
                    if (targetPct < cur) {
                        if (cur <= targetPct || p.hubDown) break;
                        writeCommand({ setPinballHub: 2 });
                    } else {
                        if (cur >= targetPct || p.rawHubMode === 2) break;
                        writeCommand({ setPinballHub: 0 });
                    }
                    checks++;
                    await sleep(100);
                }
                writeCommand({ setPinballHub: 1, setPinballPlateSpeed: finishSpeed });
            };

            // <<- sStart pinball tour 0 (ULTIMATE SHOWMAN-MIX: MAX DYNAMIK)
            if (tourIdx === 0) {
                // ========================================================
                // ★ PROFI-SHOW: ULTIMATE SHOWMAN-MIX (1x Richtungswechsel, Max Kinetik) ★
                // ========================================================

                // ----------------------------------------------------
                // BLOCK 1: VORWÄRTS-ESKALATION & KINETISCHE WHIP-KOMBOS (ca. 100s)
                // ----------------------------------------------------
                setPinballPhase("TEIL 1: SHOW-START VORWÄRTS! VOLLGAS (100%)", currentSec);
                writeCommand({ setPinballPlateSpeed: 1.0, setPinballGondolaBrake: false, setPinballAutoBrake: true, peepScream: true, peepRatio: 0.95 });
                if (!await waitPinballCancelable(scaleMs(8000))) break;

                // DOPPEL-SNAP-EINLEITUNG (Whips direkt nacheinander für maximale Instabilität der Gondeln)
                await triggerFlipperWhip("WHIP 1A: ACCELERATION SNAP!");
                if (!await waitPinballCancelable(scaleMs(4000))) break;
                await triggerFlipperWhip("WHIP 1B: COUNTER-SNAP (DOPPEL-SCHLEUDER)!");
                if (!await waitPinballCancelable(scaleMs(6000))) break;

                // DIVE 1: Sinkflug auf 50% + synchronisierte Tempodrosselung auf 35%
                setPinballPhase("TIEFTAUCHGANG 50% & ANSTAUEN DER ENERGIE (35% SPEED)", currentSec);
                await moveHubWithDynamicSpeed(50, 0.35, 0.35, 5);
                
                // KATAPULT 1 + DIRECT PEAK WHIP: Hochreißen auf 100%, Peitsche zündet GENAU beim Erreichen des Zeniths!
                setPinballPhase("💥 EXPULSION-KATAPULT HOCHREISSEN auf 100%!!", currentSec);
                await moveHubWithDynamicSpeed(100, 1.0, 1.0, 4);
                await triggerFlipperWhip("WHIP 2 (PEAK IMPACT): SCHLEUDERN IM HÖCHSTPUNKT!");
                if (!await waitPinballCancelable(scaleMs(8000))) break;

                // DIVE 2 & MICRO-WHIP: Absacken auf 75% bei 35% Speed
                setPinballPhase("ABFANG-MANÖVER: DIVE AUF 75% (35% SPEED)", currentSec);
                await moveHubWithDynamicSpeed(75, 0.35, 0.35, 4);
                // Trick: Ein kurzer Snap mitten im Langsamflug irritiert die Gondel-Trägheit komplett
                await triggerFlipperWhip("DIVE-SHAKE: OVERDRIVE AUS DEM UNTERGRIFF!"); 
                if (!await waitPinballCancelable(scaleMs(4000))) break;

                // KATAPULT 2: Aggressiver Turbo-Aufstieg
                setPinballPhase("TURBO-KATAPULT: ZWEITER JUMP AUF 100%!", currentSec);
                await moveHubWithDynamicSpeed(100, 1.0, 1.0, 4);

                // TRIPLE-WHIP ESKALATION VOR DEM WECHSEL (Platte läuft auf 100%, wir triggern Whips im schnellen Rhythmus)
                await triggerFlipperWhip("WHIP 3A: TRIPLE-ATTACK PART I");
                if (!await waitPinballCancelable(scaleMs(5000))) break;
                await triggerFlipperWhip("WHIP 3B: TRIPLE-ATTACK PART II");
                if (!await waitPinballCancelable(scaleMs(5000))) break;
                await triggerFlipperWhip("WHIP 4: POWER-SPIN VOR DEM MEILENSTEIN!");
                if (!await waitPinballCancelable(scaleMs(8000))) break;

                // ----------------------------------------------------
                // BLOCK 2: DRAMATISCHES ABBREMSEN & DER EINZIGE RICHTUNGSWECHSEL
                // ----------------------------------------------------
                // Show-Effekt: Lift stürzt im Bremsvorgang auf 50% für intensiven "Weightless"-Moment
                setPinballPhase("SHOW-BREAK: SCHWEREFREIHEIT & DER GROSSE WECHSEL RÜCKWÄRTS", currentSec);
                writeCommand({ setPinballPlateSpeed: 0.0 });
                await moveHubWithDynamicSpeed(50, 0.0, 0.0, 5); // Lift sackt kontrolliert ab

                let swWait = 0;
                while (!pinballAutoCancel && swWait < 18) {
                    const p = (getLatestTelemetry().pinball) || {};
                    if (p.plateStand || Math.abs(p.plateSpeedPercent || 0) < 2) break;
                    swWait++;
                    if (!await waitPinballCancelable(1000)) break;
                }
                if (pinballAutoCancel) break;

                // ----------------------------------------------------
                // BLOCK 3: RÜCKWÄRTS-OVERDRIVE & DAUER-WHIP FINALE (ca. 105s)
                // ----------------------------------------------------
                setPinballPhase("TEIL 2: RÜCKWÄRTS-TURBO INFRA-ROT (100% FULL POWER!)", currentSec);
                writeCommand({ setPinballDirection: 2, setPinballPlateSpeed: 1.0, peepHandsUp: true, peepRatio: 1.0 });
                if (!await waitPinballCancelable(scaleMs(6000))) break;

                // Überraschungs-Whip direkt beim Rückwärts-Anlauf
                await triggerFlipperWhip("RÜCKWÄRTS-WHIP 1: KICKSTART-SNAP!");
                if (!await waitPinballCancelable(scaleMs(8000))) break;

                // RÜCKWÄRTS-DIVE 1: Lift runter auf 50% bei 35% Speed
                setPinballPhase("RÜCKWÄRTS-DIVE AUF 50% (ANLAUF FÜR DEN MONSTER-UP)", currentSec);
                await moveHubWithDynamicSpeed(50, 0.35, 0.35, 5);

                // RÜCKWÄRTS-KATAPULT 1: Explosiv hochziehen auf 100% Speed + Doppelwhip
                setPinballPhase("RÜCKWÄRTS-KATAPULT: SKY-CRUISING (100% VOLLGAS)!", currentSec);
                await moveHubWithDynamicSpeed(100, 1.0, 1.0, 4);
                await triggerFlipperWhip("RÜCKWÄRTS-WHIP 2A: AIR-SNAP!");
                if (!await waitPinballCancelable(scaleMs(5000))) break;
                await triggerFlipperWhip("RÜCKWÄRTS-WHIP 2B: REBOUND-ROTATE!");
                if (!await waitPinballCancelable(scaleMs(6000))) break;

                // RÜCKWÄRTS-DIVE 2: Letzter Dive auf 75% bei 35% Speed
                setPinballPhase("LETZTES ABTAUCHEN 75% (SPEED 35%) - DIE RUHE VOR DEM STURM!", currentSec);
                await moveHubWithDynamicSpeed(75, 0.35, 0.35, 4);

                // RÜCKWÄRTS-KATAPULT 2: Der finale Vertikal-Stoß
                setPinballPhase("FINALES RÜCKWÄRTS-KATAPULT IN DEN OLYMP!", currentSec);
                await moveHubWithDynamicSpeed(100, 1.0, 1.0, 4);

                // ULTRA-WHIP ESKALATIONSTAKT (Finale: Staccato-Whips werfen die Gondeln komplett aus der Bahn)
                setPinballPhase("MONSTER-FINALE RÜCKWÄRTS: DIE GONDELN FLIEGEN AUSREISSEND!", currentSec);
                await triggerFlipperWhip("FINAL ESCALATION: SNAP 1");
                if (!await waitPinballCancelable(scaleMs(4000))) break;
                await triggerFlipperWhip("FINAL ESCALATION: SNAP 2");
                if (!await waitPinballCancelable(scaleMs(4000))) break;
                await triggerFlipperWhip("FINAL ESCALATION: SNAP 3");
                if (!await waitPinballCancelable(scaleMs(4000))) break;

                // Der finale Todesstoß: Ein extrem langes Vollgas-Segment mit einem allerletzten, brachialen 100% Whip
                setPinballPhase("ALLERLETZTER PEITSCHENHIEB (STAY MAXIMUM)!!", currentSec);
                await triggerFlipperWhip("MONSTER-PEITSCHE 100% END-IMPACT!");
                if (!await waitPinballCancelable(scaleMs(12000))) break;
                // <<- sEnd pinball tour 0 (ULTIMATE SHOWMAN-MIX: MAX DYNAMIK)

            } else if (tourIdx === 1) {
                // ========================================================
                // ★ TOUR 2: SIMON (Meeß Show-Choreo 00:00 - 05:25 - AKTUALISIERT) ★
                // ========================================================

                // ----------------------------------------------------
                // 00:00 – 00:30 | Start: Ruhige Vorwärtsdrehung bei 15%, Hubarm bleibt unten
                // ----------------------------------------------------
                setPinballPhase("00:00 – 00:30 | Start: Vorwärts (15%), Hubarm unten", currentSec);
                writeCommand({ setPinballDirection: 0, setPinballPlateSpeed: 0.15, setPinballHub: 1, setPinballGondolaBrake: false, setPinballAutoBrake: true });
                if (!await waitPinballCancelable(30000)) break;

                // ----------------------------------------------------
                // 00:30 – 01:00 | Hochfahren: Platte auf 25%, Hubarm kurz drauf ganz hoch auf 100%
                // ----------------------------------------------------
                setPinballPhase("00:30 – 01:00 | Hochfahren: Platte 25%, Hubarm ganz hoch (100%)", currentSec);
                writeCommand({ setPinballPlateSpeed: 0.25 });
                if (!await waitPinballCancelable(3000)) break;
                // Hubarm ganz hochfahren auf 100%
                writeCommand({ setPinballHub: 0 });
                if (!await waitPinballCancelable(12000)) break;
                writeCommand({ setPinballHub: 1 }); // Stopp am oberen Anschlag (100%)
                if (!await waitPinballCancelable(15000)) break;

                // ----------------------------------------------------
                // 01:00 – 02:30 | 1. Phase (Vorwärts): 3x 100% / 35% Wechsel (Fokus 100%)
                // ----------------------------------------------------
                setPinballPhase("01:00 – 02:30 | 1. Phase (Vorwärts): 3x 100% / 35%", currentSec);
                
                // Zyklus 1 (30s: 20s 100% / 10s 35%)
                setPinballPhase("Phase 1 - Vorwärts: 100% Vollgas (1/3)", currentSec);
                writeCommand({ setPinballPlateSpeed: 1.0 });
                if (!await waitPinballCancelable(20000)) break;
                setPinballPhase("Phase 1 - Vorwärts: Bremsen auf 35% (1/3)", currentSec);
                writeCommand({ setPinballPlateSpeed: 0.35 });
                if (!await waitPinballCancelable(10000)) break;

                // Zyklus 2 (30s: 20s 100% / 10s 35%)
                setPinballPhase("Phase 1 - Vorwärts: 100% Vollgas (2/3)", currentSec);
                writeCommand({ setPinballPlateSpeed: 1.0 });
                if (!await waitPinballCancelable(20000)) break;
                setPinballPhase("Phase 1 - Vorwärts: Bremsen auf 35% (2/3)", currentSec);
                writeCommand({ setPinballPlateSpeed: 0.35 });
                if (!await waitPinballCancelable(10000)) break;

                // Zyklus 3 (30s: 20s 100% / 10s 35%)
                setPinballPhase("Phase 1 - Vorwärts: 100% Vollgas (3/3)", currentSec);
                writeCommand({ setPinballPlateSpeed: 1.0 });
                if (!await waitPinballCancelable(20000)) break;
                setPinballPhase("Phase 1 - Vorwärts: Bremsen auf 35% (3/3)", currentSec);
                writeCommand({ setPinballPlateSpeed: 0.35 });
                if (!await waitPinballCancelable(10000)) break;

                // ----------------------------------------------------
                // 02:30 – 03:00 | Richtungswechsel: Kontrolliert abbremsen auf 0%, dann 15% Rückwärts
                // ----------------------------------------------------
                setPinballPhase("02:30 – 03:00 | Richtungswechsel: Bremsen auf 0%", currentSec);
                writeCommand({ setPinballPlateSpeed: 0.0 });
                if (!await waitPinballCancelable(15000)) break; // Bremsen bis Stillstand

                setPinballPhase("02:30 – 03:00 | Richtungswechsel: Start Rückwärts (15%)", currentSec);
                writeCommand({ setPinballDirection: 2, setPinballPlateSpeed: 0.15 });
                if (!await waitPinballCancelable(15000)) break;

                // ----------------------------------------------------
                // 03:00 – 04:30 | 2. Phase (Rückwärts): 4x auf 100% beschleunigt & 3x auf 35% gebremst
                // 90 Sekunden Gesamt: (15s @ 100%) + (7s @ 35%) + (16s @ 100%) + (7s @ 35%) + (16s @ 100%) + (7s @ 35%) + (22s @ 100% Finale-Push) = 90s
                // ----------------------------------------------------
                setPinballPhase("03:00 – 04:30 | 2. Phase (Rückwärts): 4x 100% & 3x 35%", currentSec);

                // Beschleunigung 1 auf 100% (15s)
                setPinballPhase("Phase 2 - Rückwärts: 100% Vollgas (1/4)", currentSec);
                writeCommand({ setPinballPlateSpeed: 1.0 });
                if (!await waitPinballCancelable(15000)) break;

                // Bremsen 1 auf 35% (7s)
                setPinballPhase("Phase 2 - Rückwärts: Bremsen auf 35% (1/3)", currentSec);
                writeCommand({ setPinballPlateSpeed: 0.35 });
                if (!await waitPinballCancelable(7000)) break;

                // Beschleunigung 2 auf 100% (16s)
                setPinballPhase("Phase 2 - Rückwärts: 100% Vollgas (2/4)", currentSec);
                writeCommand({ setPinballPlateSpeed: 1.0 });
                if (!await waitPinballCancelable(16000)) break;

                // Bremsen 2 auf 35% (7s)
                setPinballPhase("Phase 2 - Rückwärts: Bremsen auf 35% (2/3)", currentSec);
                writeCommand({ setPinballPlateSpeed: 0.35 });
                if (!await waitPinballCancelable(7000)) break;

                // Beschleunigung 3 auf 100% (16s)
                setPinballPhase("Phase 2 - Rückwärts: 100% Vollgas (3/4)", currentSec);
                writeCommand({ setPinballPlateSpeed: 1.0 });
                if (!await waitPinballCancelable(16000)) break;

                // Bremsen 3 auf 35% (7s)
                setPinballPhase("Phase 2 - Rückwärts: Bremsen auf 35% (3/3)", currentSec);
                writeCommand({ setPinballPlateSpeed: 0.35 });
                if (!await waitPinballCancelable(7000)) break;

                // Beschleunigung 4 auf 100% (22s - geht nahtlos ins Finale über)
                setPinballPhase("Phase 2 - Rückwärts: 100% Vollgas (4/4)", currentSec);
                writeCommand({ setPinballPlateSpeed: 1.0 });
                if (!await waitPinballCancelable(22000)) break;

                // ----------------------------------------------------
                // 04:30 – 05:25 | Finale: Hub auf 50% bei 100% Speed -> Pause bei 30% (~7s) -> 100% Finale -> Hub auf 0% -> Platte 0%
                // ----------------------------------------------------
                setPinballPhase("04:30 – 05:25 | Finale: Hub auf 50% bei 100% Drehzahl", currentSec);
                writeCommand({ setPinballPlateSpeed: 1.0, setPinballHub: 2 }); // Hub senken
                if (!await waitPinballCancelable(6000)) break; // ca. 6 Sekunden senken = 50%
                writeCommand({ setPinballHub: 1 }); // Stopp bei 50%

                setPinballPhase("Finale: Pause bei 20% Drehzahl (~7s)", currentSec);
                writeCommand({ setPinballPlateSpeed: 0.20 });
                if (!await waitPinballCancelable(7000)) break; // Exakt 7s Pause bei 20%

                setPinballPhase("Finale: 100% Vollgas Beschleunigung!", currentSec);
                writeCommand({ setPinballPlateSpeed: 1.0 });
                // Warten bis Hauptplatte 100% erreicht hat (ca. 4-5s Beschleunigung)
                if (!await waitPinballCancelable(4500)) break;

                setPinballPhase("Finale: 100% Vollgas & Hubarm runter auf 0% Boden!", currentSec);
                writeCommand({ setPinballPlateSpeed: 1.0, setPinballHub: 2 }); // Hubarm fährt ganz runter auf 0%
                if (!await waitPinballCancelable(7500)) break; // Zeit bis Hubarm komplett auf dem Boden aufliegt
                writeCommand({ setPinballHub: 1 });

                // Sobald Hubarm unten ist: Platte auf 0% abbremsen und Fahrt beenden
                setPinballPhase("Fahrtende: Platte auf 0% - Halt in den Bremsen", currentSec);
                writeCommand({ setPinballPlateSpeed: 0.0, setPinballGondolaBrake: true, setPinballAutoBrake: true });
                if (!await waitPinballCancelable(5000)) break;
} else if (tourIdx === 2) {

                // ========================================================
                // ★ NEUE TOUR: EXAKTE UMSETZUNG NACH VORGABE (00:00 - 05:25) ★
                // ========================================================

                // ----------------------------------------------------
                // 00:00 – 00:30 | Start: Ruhige Vorwärtsdrehung bei 15% (Hubarm unten)
                // ----------------------------------------------------
                setPinballPhase("00:00 – 00:30 | Start: Ruhige Vorwärtsdrehung (15%)", currentSec);
                writeCommand({ setPinballDirection: 0, setPinballPlateSpeed: 0.15, setPinballGondolaBrake: false, setPinballAutoBrake: true });
                if (!await waitPinballCancelable(scaleMs(30000))) break;

                // ----------------------------------------------------
                // 00:30 – 01:00 | Hochfahren: Platte auf 25%, Hubarm auf 100%
                // ----------------------------------------------------
                setPinballPhase("00:30 – 01:00 | Hochfahren: Platte 25%, Hubarm 100%", currentSec);
                writeCommand({ setPinballPlateSpeed: 0.25 });
                await moveHubWithDynamicSpeed(100, 0.25, 0.25, 5);
                // Rest der 30 Sekunden abwarten, falls das Hochfahren schneller ging
                if (!await waitPinballCancelable(scaleMs(15000))) break;

                // ----------------------------------------------------
                // 01:00 – 02:30 | 1. Phase (Vorwärts): 3x 100% / 35% Wechsel (Fokus auf 100%)
                // ----------------------------------------------------
                setPinballPhase("01:00 – 02:30 | 1. Phase (Vorwärts): 3x High-Speed Whips", currentSec);
                
                // Zyklus 1 (ca. 30s)
                writeCommand({ setPinballPlateSpeed: 1.0 });
                if (!await waitPinballCancelable(scaleMs(15000))) break;
                writeCommand({ setPinballPlateSpeed: 0.35 });
                if (!await waitPinballCancelable(scaleMs(10000))) break;

                // Zyklus 2 (ca. 30s)
                writeCommand({ setPinballPlateSpeed: 1.0 });
                if (!await waitPinballCancelable(scaleMs(15000))) break;
                writeCommand({ setPinballPlateSpeed: 0.35 });
                if (!await waitPinballCancelable(scaleMs(10000))) break;

                // Zyklus 3 (ca. 30s)
                writeCommand({ setPinballPlateSpeed: 1.0 });
                if (!await waitPinballCancelable(scaleMs(15000))) break;
                writeCommand({ setPinballPlateSpeed: 0.35 });
                if (!await waitPinballCancelable(scaleMs(10000))) break;

                // ----------------------------------------------------
                // 02:30 – 03:00 | Richtungswechsel: Abbremsen auf 0%, dann 15% Rückwärts
                // ----------------------------------------------------
                setPinballPhase("02:30 – 03:00 | Richtungswechsel: Stopp & Rückwärts (15%)", currentSec);
                writeCommand({ setPinballPlateSpeed: 0.0 });
                if (!await waitPinballCancelable(scaleMs(15000))) break; // Abbremsen bis Stillstand

                writeCommand({ setPinballDirection: 2, setPinballPlateSpeed: 0.15 }); // Richtungswechsel auf Rückwärts mit 15%
                if (!await waitPinballCancelable(scaleMs(15000))) break;

                // ----------------------------------------------------
                // 03:00 – 04:30 | 2. Phase (Rückwärts): 3x 100% / 35% Wechsel (Fokus auf 100%)
                // ----------------------------------------------------
                setPinballPhase("03:00 – 04:30 | 2. Phase (Rückwärts): 3x High-Speed Whips", currentSec);

                // Zyklus 1 (ca. 30s)
                writeCommand({ setPinballPlateSpeed: 1.0 });
                if (!await waitPinballCancelable(scaleMs(15000))) break;
                writeCommand({ setPinballPlateSpeed: 0.35 });
                if (!await waitPinballCancelable(scaleMs(10000))) break;

                // Zyklus 2 (ca. 30s)
                writeCommand({ setPinballPlateSpeed: 1.0 });
                if (!await waitPinballCancelable(scaleMs(15000))) break;
                writeCommand({ setPinballPlateSpeed: 0.35 });
                if (!await waitPinballCancelable(scaleMs(10000))) break;

                // Zyklus 3 (ca. 30s)
                writeCommand({ setPinballPlateSpeed: 1.0 });
                if (!await waitPinballCancelable(scaleMs(15000))) break;
                writeCommand({ setPinballPlateSpeed: 0.35 });
                if (!await waitPinballCancelable(scaleMs(10000))) break;

                // ----------------------------------------------------
                // 04:30 – 05:25 | Finale: Hub auf 50%, Pause bei 30%, Finale 100% & Ausfahren
                // ----------------------------------------------------
                setPinballPhase("04:30 – 05:25 | Finale: Hub auf 50%, Pause, 100% Turbo & Landung", currentSec);
                
                // Hub bei 100% Drehzahl der Hauptplatte auf 50% senken
                writeCommand({ setPinballPlateSpeed: 1.0 });
                await moveHubWithDynamicSpeed(50, 1.0, 1.0, 5);

                // Wenn Hub 50% erreicht: Platte auf 30% bremsen für eine kleine Pause
                writeCommand({ setPinballPlateSpeed: 0.30 });
                if (!await waitPinballCancelable(scaleMs(10000))) break; // Kleine Pause mit 30%

                // Nochmal auf 100% beschleunigen für das Finale und Hub ganz runterfahren (0%)
                writeCommand({ setPinballPlateSpeed: 1.0 });
                if (!await waitPinballCancelable(scaleMs(5000))) break;
                await moveHubWithDynamicSpeed(0, 1.0, 1.0, 5); // Hub ganz runter

                // Wenn Hub unten ist: Platte auf 0% abbremsen und Fahrt beenden
                setPinballPhase("Fahrtende: Platte auf 0%", currentSec);
                writeCommand({ setPinballPlateSpeed: 0.0 });
                if (!await waitPinballCancelable(scaleMs(5000))) break;
            } else if (tourIdx === 3) {
                // ========================================================
                // Tour 4: Turbo-Schleuder (Maximale Whips & Katapult-Snaps)
                // ========================================================
                setPinballPhase("TEIL 1: TURBO-START VORWÄRTS (100% VOLLGAS)", currentSec);
                writeCommand({ setPinballPlateSpeed: 1.0, setPinballGondolaBrake: false, setPinballAutoBrake: true, peepScream: true, peepRatio: 1.0 });
                if (!await waitPinballCancelable(scaleMs(7000))) break;

                // Doppel-Snap Eröffnung
                await triggerFlipperWhip("TURBO-WHIP 1A: INITIAL SHOCK!");
                if (!await waitPinballCancelable(scaleMs(4000))) break;
                await triggerFlipperWhip("TURBO-WHIP 1B: DOUBLE-POWER SNAP!");
                if (!await waitPinballCancelable(scaleMs(6000))) break;

                setPinballPhase("TURBO-DIVE 50% & SPEED 35%", currentSec);
                await moveHubWithDynamicSpeed(50, 0.35, 0.35, 5);
                setPinballPhase("💥 EXPLOSIVES KATAPULT 100% HOCH!", currentSec);
                await moveHubWithDynamicSpeed(100, 1.0, 1.0, 4);
                await triggerFlipperWhip("TURBO-WHIP 2 (ZENITH IMPACT: 35% ➔ 100%)!");
                if (!await waitPinballCancelable(scaleMs(8000))) break;

                setPinballPhase("TURBO-DIVE 75% & SPEED 35%", currentSec);
                await moveHubWithDynamicSpeed(75, 0.35, 0.35, 4);
                await triggerFlipperWhip("LOW-LEVEL OVERDRIVE SNAP!");
                if (!await waitPinballCancelable(scaleMs(4000))) break;

                setPinballPhase("TURBO-KATAPULT WIEDER HOCH!", currentSec);
                await moveHubWithDynamicSpeed(100, 1.0, 1.0, 4);
                await triggerFlipperWhip("TURBO-WHIP 3A: HIGH-G ATTACK");
                if (!await waitPinballCancelable(scaleMs(5000))) break;
                await triggerFlipperWhip("TURBO-WHIP 3B: RAPID REVERSE-PREP");
                if (!await waitPinballCancelable(scaleMs(7000))) break;

                // SHOW-BREAK & EINZIGER RICHTUNGSWECHSEL
                setPinballPhase("SHOW-BREAK: DIVE AUF 50% & WECHSEL AUF RÜCKWÄRTS", currentSec);
                writeCommand({ setPinballPlateSpeed: 0.0 });
                await moveHubWithDynamicSpeed(50, 0.0, 0.0, 5);
                let swWait = 0;
                while (!pinballAutoCancel && swWait < 18) {
                    const p = (getLatestTelemetry().pinball) || {};
                    if (p.plateStand || Math.abs(p.plateSpeedPercent || 0) < 2) break;
                    swWait++;
                    if (!await waitPinballCancelable(1000)) break;
                }
                if (pinballAutoCancel) break;

                // RÜCKWÄRTS BIS ZUM ENDE
                setPinballPhase("TEIL 2: RÜCKWÄRTS-TURBO (100% OVERDRIVE)", currentSec);
                writeCommand({ setPinballDirection: 2, setPinballPlateSpeed: 1.0, peepHandsUp: true, peepRatio: 1.0 });
                if (!await waitPinballCancelable(scaleMs(6000))) break;

                await triggerFlipperWhip("RÜCKWÄRTS-TURBO 1: KICKSTART-SNAP!");
                if (!await waitPinballCancelable(scaleMs(7000))) break;

                setPinballPhase("RÜCKWÄRTS DIVE 50% & SPEED 35%", currentSec);
                await moveHubWithDynamicSpeed(50, 0.35, 0.35, 5);
                setPinballPhase("RÜCKWÄRTS-KATAPULT: EXPLOSION HOCH (100%)!", currentSec);
                await moveHubWithDynamicSpeed(100, 1.0, 1.0, 4);
                await triggerFlipperWhip("RÜCKWÄRTS-WHIP 2A: AIR-SNAP!");
                if (!await waitPinballCancelable(scaleMs(5000))) break;
                await triggerFlipperWhip("RÜCKWÄRTS-WHIP 2B: REBOUND-ROTATE!");
                if (!await waitPinballCancelable(scaleMs(6000))) break;

                setPinballPhase("RÜCKWÄRTS DIVE 75% & SPEED 35%", currentSec);
                await moveHubWithDynamicSpeed(75, 0.35, 0.35, 4);
                setPinballPhase("FINALES TURBO-KATAPULT HOCH!", currentSec);
                await moveHubWithDynamicSpeed(100, 1.0, 1.0, 4);

                // Finale
                setPinballPhase("TURBO-FINALE RÜCKWÄRTS: VOLLGAS-MASSIVER WHIP-STURM!", currentSec);
                await triggerFlipperWhip("ESCALATION SNAP 1");
                if (!await waitPinballCancelable(scaleMs(4000))) break;
                await triggerFlipperWhip("ESCALATION SNAP 2");
                if (!await waitPinballCancelable(scaleMs(4000))) break;
                await triggerFlipperWhip("ULTIMATIVER END-WHIP 100% PEAK-OVERLOAD!");
                if (!await waitPinballCancelable(scaleMs(14000))) break;

            } else if (tourIdx === 4) {
                // ========================================================
                // Tour 5: Freitag Abend Party (Party-Beats, Whips & Dives)
                // ========================================================
                setPinballPhase("TEIL 1: PARTY-START VORWÄRTS (100% BEAT)", currentSec);
                writeCommand({ setPinballPlateSpeed: 1.0, setPinballGondolaBrake: false, setPinballAutoBrake: true, peepHandsUp: true, peepRatio: 0.95 });
                if (!await waitPinballCancelable(scaleMs(8000))) break;

                // Doppel-Snap Eröffnung
                await triggerFlipperWhip("PARTY-WHIP 1A: DROP THE BEAT (35% ➔ 100%)!");
                if (!await waitPinballCancelable(scaleMs(4000))) break;
                await triggerFlipperWhip("PARTY-WHIP 1B: DOUBLE BOUNCE SNAP!");
                if (!await waitPinballCancelable(scaleMs(6000))) break;

                setPinballPhase("PARTY-DIVE 50% & BEAT-DROSSEL 35%", currentSec);
                await moveHubWithDynamicSpeed(50, 0.35, 0.35, 5);
                setPinballPhase("💥 PARTY-KATAPULT: DER BASS KICKT AUF 100%!", currentSec);
                await moveHubWithDynamicSpeed(100, 1.0, 1.0, 4);
                await triggerFlipperWhip("PARTY-WHIP 2 (AIR-EXPLOSION: 35% ➔ 100%)!");
                if (!await waitPinballCancelable(scaleMs(8000))) break;

                setPinballPhase("PARTY-DIVE 75% & BEAT-DROSSEL 35%", currentSec);
                await moveHubWithDynamicSpeed(75, 0.35, 0.35, 4);
                await triggerFlipperWhip("SUB-BASS SHAKE SNAP!");
                if (!await waitPinballCancelable(scaleMs(4000))) break;

                setPinballPhase("PARTY-KATAPULT WIEDER HOCH!", currentSec);
                await moveHubWithDynamicSpeed(100, 1.0, 1.0, 4);
                await triggerFlipperWhip("PARTY-WHIP 3A: RHYTHM ATTACK I");
                if (!await waitPinballCancelable(scaleMs(5000))) break;
                await triggerFlipperWhip("PARTY-WHIP 3B: RHYTHM ATTACK II");
                if (!await waitPinballCancelable(scaleMs(7000))) break;

                // SHOW-BREAK & EINZIGER RICHTUNGSWECHSEL
                setPinballPhase("SHOW-BREAK: DIVE AUF 50% & WECHSEL AUF RÜCKWÄRTS", currentSec);
                writeCommand({ setPinballPlateSpeed: 0.0 });
                await moveHubWithDynamicSpeed(50, 0.0, 0.0, 5);
                let swWait = 0;
                while (!pinballAutoCancel && swWait < 18) {
                    const p = (getLatestTelemetry().pinball) || {};
                    if (p.plateStand || Math.abs(p.plateSpeedPercent || 0) < 2) break;
                    swWait++;
                    if (!await waitPinballCancelable(1000)) break;
                }
                if (pinballAutoCancel) break;

                // RÜCKWÄRTS BIS ZUM ENDE
                setPinballPhase("TEIL 2: RÜCKWÄRTS PARTY-SWING (100% POWER)", currentSec);
                writeCommand({ setPinballDirection: 2, setPinballPlateSpeed: 1.0, peepHandsUp: true, peepRatio: 1.0 });
                if (!await waitPinballCancelable(scaleMs(6000))) break;

                await triggerFlipperWhip("RÜCKWÄRTS-PARTY-WHIP 1: KICKSTART-SNAP!");
                if (!await waitPinballCancelable(scaleMs(7000))) break;

                setPinballPhase("RÜCKWÄRTS PARTY-DIVE 50% & TEMPO 35%", currentSec);
                await moveHubWithDynamicSpeed(50, 0.35, 0.35, 5);
                setPinballPhase("RÜCKWÄRTS PARTY-KATAPULT HOCH!", currentSec);
                await moveHubWithDynamicSpeed(100, 1.0, 1.0, 4);
                await triggerFlipperWhip("RÜCKWÄRTS-PARTY 2A: SKY-DANCE!");
                if (!await waitPinballCancelable(scaleMs(5000))) break;
                await triggerFlipperWhip("RÜCKWÄRTS-PARTY 2B: REBOUND-SPIN!");
                if (!await waitPinballCancelable(scaleMs(6000))) break;

                setPinballPhase("RÜCKWÄRTS PARTY-DIVE 75% & TEMPO 35%", currentSec);
                await moveHubWithDynamicSpeed(75, 0.35, 0.35, 4);
                setPinballPhase("FINALES PARTY-KATAPULT VOLL HOCH!", currentSec);
                await moveHubWithDynamicSpeed(100, 1.0, 1.0, 4);

                // Finale
                setPinballPhase("PARTY-FINALE: DIE MENGE TOBT!", currentSec);
                await triggerFlipperWhip("ESCALATION SNAP 1");
                if (!await waitPinballCancelable(scaleMs(4000))) break;
                await triggerFlipperWhip("ESCALATION SNAP 2");
                if (!await waitPinballCancelable(scaleMs(4000))) break;
                await triggerFlipperWhip("FINALER PARTY-WHIP 100% DISCO-OVERLOAD!");
                if (!await waitPinballCancelable(scaleMs(14000))) break;

            } else {
                // ========================================================
                // Tour 4: Klassiker (Perfekt ausbalancierte Showman-Dynamik)
                // ========================================================
                setPinballPhase("TEIL 1: START VORWÄRTS (100% VOLLGAS)", currentSec);
                writeCommand({ setPinballPlateSpeed: 1.0, setPinballGondolaBrake: false, setPinballAutoBrake: true, peepScream: true, peepRatio: 0.9 });
                if (!await waitPinballCancelable(scaleMs(8000))) break;

                // Doppel-Snap Eröffnung
                await triggerFlipperWhip("KLASSIKER-WHIP 1A: START-SNAP (35% ➔ 100%)!");
                if (!await waitPinballCancelable(scaleMs(4000))) break;
                await triggerFlipperWhip("KLASSIKER-WHIP 1B: COUNTER-SNAP!");
                if (!await waitPinballCancelable(scaleMs(6000))) break;

                setPinballPhase("LIFT-STUFE 50% & TEMPO 35%", currentSec);
                await moveHubWithDynamicSpeed(50, 0.35, 0.35, 5);
                setPinballPhase("💥 KLASSIKER-KATAPULT: HOCHREISSEN AUF 100%!", currentSec);
                await moveHubWithDynamicSpeed(100, 1.0, 1.0, 4);
                await triggerFlipperWhip("KLASSIKER-WHIP 2 (ZENITH SNAP: 35% ➔ 100%)!");
                if (!await waitPinballCancelable(scaleMs(8000))) break;

                setPinballPhase("LIFT-STUFE 75% & TEMPO 35%", currentSec);
                await moveHubWithDynamicSpeed(75, 0.35, 0.35, 4);
                await triggerFlipperWhip("MID-AIR SHAKE SNAP!");
                if (!await waitPinballCancelable(scaleMs(4000))) break;

                setPinballPhase("KATAPULT WIEDER HOCH!", currentSec);
                await moveHubWithDynamicSpeed(100, 1.0, 1.0, 4);
                await triggerFlipperWhip("KLASSIKER-WHIP 3A: SPIN-ATTACK I");
                if (!await waitPinballCancelable(scaleMs(5000))) break;
                await triggerFlipperWhip("KLASSIKER-WHIP 3B: SPIN-ATTACK II");
                if (!await waitPinballCancelable(scaleMs(7000))) break;

                // SHOW-BREAK & EINZIGER RICHTUNGSWECHSEL
                setPinballPhase("SHOW-BREAK: DIVE AUF 50% & WECHSEL AUF RÜCKWÄRTS", currentSec);
                writeCommand({ setPinballPlateSpeed: 0.0 });
                await moveHubWithDynamicSpeed(50, 0.0, 0.0, 5);
                let swWait = 0;
                while (!pinballAutoCancel && swWait < 18) {
                    const p = (getLatestTelemetry().pinball) || {};
                    if (p.plateStand || Math.abs(p.plateSpeedPercent || 0) < 2) break;
                    swWait++;
                    if (!await waitPinballCancelable(1000)) break;
                }
                if (pinballAutoCancel) break;

                // RÜCKWÄRTS BIS ZUM ENDE
                setPinballPhase("TEIL 2: RÜCKWÄRTS-SCHWUNG (100% VOLLGAS)", currentSec);
                writeCommand({ setPinballDirection: 2, setPinballPlateSpeed: 1.0, peepHandsUp: true, peepRatio: 1.0 });
                if (!await waitPinballCancelable(scaleMs(6000))) break;

                await triggerFlipperWhip("RÜCKWÄRTS-WHIP 1: KICKSTART-SNAP!");
                if (!await waitPinballCancelable(scaleMs(7000))) break;

                setPinballPhase("RÜCKWÄRTS LIFT-STUFE 50% & TEMPO 35%", currentSec);
                await moveHubWithDynamicSpeed(50, 0.35, 0.35, 5);
                setPinballPhase("RÜCKWÄRTS KATAPULT HOCH!", currentSec);
                await moveHubWithDynamicSpeed(100, 1.0, 1.0, 4);
                await triggerFlipperWhip("RÜCKWÄRTS-WHIP 2A: SKY-DIVE!");
                if (!await waitPinballCancelable(scaleMs(5000))) break;
                await triggerFlipperWhip("RÜCKWÄRTS-WHIP 2B: REBOUND-SPIN!");
                if (!await waitPinballCancelable(scaleMs(6000))) break;

                setPinballPhase("RÜCKWÄRTS LIFT-STUFE 75% & TEMPO 35%", currentSec);
                await moveHubWithDynamicSpeed(75, 0.35, 0.35, 4);
                setPinballPhase("FINALES KATAPULT HOCH!", currentSec);
                await moveHubWithDynamicSpeed(100, 1.0, 1.0, 4);

                // Finale
                setPinballPhase("KLASSIKER-FINALE: ABSCHLUSS-FEUERWERK!", currentSec);
                await triggerFlipperWhip("ESCALATION SNAP 1");
                if (!await waitPinballCancelable(scaleMs(4000))) break;
                await triggerFlipperWhip("ESCALATION SNAP 2");
                if (!await waitPinballCancelable(scaleMs(4000))) break;
                await triggerFlipperWhip("FINALER KLASSIKER-WHIP 100% POWER!");
                if (!await waitPinballCancelable(scaleMs(14000))) break;
            }

            if (pinballAutoCancel) break;

            // 9. LIFT SENKEN & GLEICHZEITIG TEMPO AUF 0% WEGNEHMEN (Schritt 9 & 10 synchron)
            setPinballPhase("LIFT SENKEN & TEMPO WEG (0%)", currentSec);
            writeCommand({ setPinballHub: 2, setPinballPlateSpeed: 0.0 });
            let hubDownWait = 0;
            while (!pinballAutoCancel && hubDownWait < 30) {
                const p = (getLatestTelemetry().pinball) || {};
                if (p.hubDown || p.rawHubMode === 0 || (p.hubPercent !== undefined && p.hubPercent <= 1)) break;
                hubDownWait++;
                if (!await waitPinballCancelable(1000)) break;
            }
            writeCommand({ setPinballHub: 1, setPinballPlateSpeed: 0.0 });
            if (pinballAutoCancel) break;

            // 11. GONDELBREMSE AKTIVIEREN (Schritt 11)
            setPinballPhase("GONDELBREMSE AKTIVIEREN (AUSRICHTEN)", 6);
            writeCommand({
                setPinballPlateSpeed: 0.0,
                setPinballAutoBrake: true,
                setPinballGondolaBrake: true
            });
            if (!await waitPinballCancelable(1000)) break;

            // 12. ROTATION STOP (Schritt 12)
            setPinballPhase("ROTATION STOPP", 6);
            writeCommand({ setPinballDirection: 1, setPinballPlateSpeed: 0.0 });

            let stopWait = 0;
            while (!pinballAutoCancel && stopWait < 20) {
                const p = (getLatestTelemetry().pinball) || {};
                if (p.possibleOpenHarness || (p.plateStand && (p.gondolasStand || p.gondolasOnZero || stopWait >= 8))) break;
                stopWait++;
                if (!await waitPinballCancelable(1000)) break;
            }

            // Sicherstellen dass Dispatch beendet ist
            writeCommand({ setPinballDirection: 1, setPinballGondolaBrake: true });
            if (!await waitPinballCancelable(500)) break;

            // ==========================================
            // 12. BÜGEL AUF
            // ==========================================
            setPinballPhase("AUSSTIEG – BÜGEL AUF", 4);
            writeCommand({
                setPinballHarness: false,
                peepHandsUp: false,
                peepClap: true,
                peepRatio: 0.9
            });
            if (!await waitPinballCancelable(3000)) break;
            writeCommand({ peepClap: false });

            clearInterval(timerInterval);
            timerInterval = null;

            // ENDLOSSCHLEIFE (LOOP) ODER BEENDEN
            if (pinballAutoDriveState.loop && !pinballAutoCancel) {
                let remPause = Math.max(10, parseInt(pinballAutoDriveState.pauseSec) || 45);
                while (remPause > 0 && !pinballAutoCancel && pinballAutoDriveState.loop) {
                    setPinballPhase(`FAHRGASTWECHSEL (${remPause}s)`, remPause);
                    if (!await waitPinballCancelable(1000)) break;
                    remPause--;
                }
            } else {
                break;
            }
        } catch (err) {
            console.error('Pinball AutoDrive error:', err);
            break;
        } finally {
            if (timerInterval) clearInterval(timerInterval);
        }
    }

    pinballAutoDriveState.running = false;
    setPinballPhase("BEREIT", 0);
}

function stopPinballAutoDrive() {
    pinballAutoCancel = true;
    pinballAutoDriveState.running = false;
    setPinballPhase("GESTOPPT", 0);
    writeCommand({
        setPinballPlateSpeed: 0.0,
        setPinballMoveFwd: false,
        setPinballMoveBwd: false,
        setPinballHub: 1
    });
}

let autoDriveCancel = false;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitCancelable(ms) {
    const start = Date.now();
    while (Date.now() - start < ms) {
        if (autoDriveCancel) return false;
        await sleep(100);
    }
    return !autoDriveCancel;
}

function setAutoPhase(phase, sec) {
    autoDriveState.phase = phase;
    if (sec !== undefined) {
        autoDriveState.remaining = sec;
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        autoDriveState.timeFormatted = `${m}:${s < 10 ? '0' : ''}${s}`;
    }
}

async function runAutoDriveRoutine(tourIdx, isNight, durationMin) {
    autoDriveCancel = false;
    let t = tourIdx;
    if (t === 7 || t >= 8) {
        t = Math.floor(Math.random() * 9);
    }
    if (t < 0 || t > 8) t = 0;

    const dur = Math.max(1, Math.min(6, parseInt(durationMin) || autoDriveState.durationMin || 4));
    autoDriveState.durationMin = dur;

    autoDriveState.running = true;
    // Zuf�llige Gondelbremse-Pulse �ber die ganze Fahrt
    (function brakeLoop(){
        if (!autoDriveState.running) return;
        const delay = 8000 + Math.floor(Math.random()*10000);
        setTimeout(() => {
            if (!autoDriveState.running) return;
            writeCommand({ setGondelbremse: true });
            const hold = 400 + Math.floor(Math.random()*1100);
            setTimeout(() => { if (autoDriveState.running) writeCommand({ setGondelbremse: false }); brakeLoop(); }, hold);
        }, delay);
    })();
    autoDriveState.tourIndex = t;
    autoDriveState.tourName = TOURS[t].name;
    autoDriveState.night = isNight;

    const totalSec = dur * 60;
    let currentSec = totalSec;
    setAutoPhase("START", currentSec);

    // Countdown interval timer
    const tourBaseScaledMs = {
        0: 111000, 1: 104300, 2: 97500, 3: 96800, 5: 99500, 6: 100000, 7: 117500, 8: 111500
    };
    const mainBaseMs = tourBaseScaledMs[t] || 110000;
    // Feste Phasen: Intro ca. 26s + Outro ca. 18s = 44s
    const targetMainSec = Math.max(25, (dur * 60) - 44);
    const scaleFactor = (targetMainSec * 1000) / mainBaseMs;
    const scale = (ms) => Math.max(300, Math.round(ms * scaleFactor));

    const totalRideMs = (dur * 60) * 1000;
    const rideStartTime = Date.now();

    // Echte Zeit-Synchronisation (Timer zaehlt exakt nach real verstrichener Zeit herunter!)
    const timerInterval = setInterval(() => {
        if (!autoDriveState.running) {
            clearInterval(timerInterval);
            return;
        }
        if (lastValidTelemetry && lastValidTelemetry.operator && !lastValidTelemetry.operator.megadanceSeated) {
            autoDriveCancel = true;
            autoDriveState.running = false;
            setAutoPhase("BEREIT", 0);
            clearInterval(timerInterval);
            return;
        }
        const elapsedMs = Date.now() - rideStartTime;
        const remainSec = Math.max(0, Math.round((totalRideMs - elapsedMs) / 1000));
        setAutoPhase(autoDriveState.phase, remainSec);
    }, 500);

    try {
        // Hilfsfunktion: Zufällige Fahrgast-Reaktion (mit Wahrscheinlichkeit, Zufalls-Verzögerung und zufälliger Gruppen-Quote!)
        let peepTimeout = null;
        const triggerPeepsTimed = (type = 'random', durationMs = 0, probability = 0.65) => {
            try { const _st = getMergedState(); const _spd = Math.max(Number(_st.setPlatte||0), Number(_st.setKreuz||0)); if (_spd > 0.6) return; } catch(e) {}
            if (Math.random() > probability) return; // Manchmal reagieren sie absichtlich nicht -> wirkt natürlich!
let chosen = type;
            if (chosen === 'random' || chosen === 'hands') {
                const r = Math.random();
                if (r < 0.34) chosen = 'hands';
                else if (r < 0.67) chosen = 'scream';
                else chosen = 'again';
            }
            const delayMs = Math.floor(Math.random() * 1600); // 0 bis 1.6s zufälliger Versatz
            const ratio = Number((0.40 + Math.random() * 0.45).toFixed(2)); // 40% bis 85% der Besucher machen mit
            const hold = durationMs > 0
                ? Math.round(durationMs * (0.75 + Math.random() * 0.35))
                : (chosen === 'clap' ? (3500 + Math.floor(Math.random() * 1500)) : (4500 + Math.floor(Math.random() * 2000)));

            setTimeout(() => {
                if (!autoDriveState.running) return;
                if (peepTimeout) { clearTimeout(peepTimeout); peepTimeout = null; }
                if (chosen === 'hands') {
                    writeCommand({ peepHandsUp: true, peepRatio: ratio });
                    peepTimeout = setTimeout(() => {
                        writeCommand({ peepHandsUp: false, peepClap: false });
                    }, hold);
                } else if (chosen === 'clap') {
                    writeCommand({ peepClap: true, peepRatio: ratio });
                    peepTimeout = setTimeout(() => {
                        writeCommand({ peepHandsUp: false, peepClap: false });
                    }, hold);
} else if (chosen === 'scream') {
                    writeCommand({ peepScream: true, peepRatio: ratio });
                    peepTimeout = setTimeout(() => {
                        writeCommand({ peepHandsUp: false, peepClap: false, peepScream: false });
                    }, hold);
                } else if (chosen === 'again') {
                    writeCommand({ peepAgain: true, peepRatio: ratio });
                }
            }, delayMs);
        };

        // Hilfsfunktion: Kurze Doppel-Hupe (Reko-Jingle, ~1s)
        const doubleHorn = async () => {
            writeCommand({ setHorn: true });
            if (!await waitCancelable(250)) return false;
            writeCommand({ setHorn: false });
            if (!await waitCancelable(180)) return false;
            writeCommand({ setHorn: true });
            if (!await waitCancelable(370)) return false;
            writeCommand({ setHorn: false });
            if (!await waitCancelable(200)) return false;
            return true;
        };

        // Hilfsfunktion: Sport-Stotterbremse (Gondeln aufschaukeln/umwerfen)
        const stutterBrake = async (pulses = 3, holdMs = 500, gapMs = 500) => {
            for (let b = 0; b < pulses; b++) {
                writeCommand({ setGondelbremse: true });
                if (!await waitCancelable(holdMs)) return false;
                writeCommand({ setGondelbremse: false });
                if (b < pulses - 1) {
                    if (!await waitCancelable(gapMs)) return false;
                }
            }
            return true;
        };

        // ============================================================
        // INTRO-BLOCK (Exakt 28 Sekunden bei Tag / 21s bei Nacht)
        // ============================================================
        // 1. HUPE (Startsignal, 1.5s)
        setAutoPhase("HUPE", currentSec);
        writeCommand({ setHorn: true });
        if (!await waitCancelable(900)) return;
        writeCommand({ setHorn: false });
        if (!await waitCancelable(600)) return;

        // 2. MOTOREN AN (0.5s)
        setAutoPhase("START", currentSec);
        writeCommand({ setMotorPlateOn: true, setMotorCrossOn: true });
        if (!await waitCancelable(500)) return;

        // 3. ANLAUFEN (12s - Besucher klatschen 6s lang im Takt mit!)
        setAutoPhase("ANLAUFEN", currentSec);
        writeCommand({ setPlatte: 0.35, setKreuz: 0.15 });
        triggerPeepsTimed('random', 4200, 0.70);
        if (!await waitCancelable(scale(12000))) return;

        // 4. EINSCHWUNG (10s)
        setAutoPhase("EINSCHWUNG", currentSec);
        writeCommand({ setPlatte: 0.48, setKreuz: 0.35 });
        if (!await waitCancelable(scale(10000))) return;

        // 5. ANBREMSEN (4s)
        setAutoPhase("ANBREMSEN", currentSec);
        if (!await stutterBrake(2, 500, 500)) return;
        if (!await waitCancelable(scale(2500))) return;

        // ============================================================
        // HAUPT-TOUREN (Jede Tour exakt ~194 Sekunden bei Tag!)
        // ============================================================
        switch (t) {
            case 0: // KLASSIKER (194s Hauptteil -> Gesamt exakt 240s = 4:00 Min!)
                // Phase A: Rundlauf & Gegenläufiges Aufschaukeln (53s)
                setAutoPhase("RUNDLAUF", currentSec);
                writeCommand({ setPlatte: 0.60, setKreuz: 0.40 });
                if (!await waitCancelable(scale(14000))) return;

                for (let i = 0; i < 3; i++) {
                    setAutoPhase("AUFSCHAUKELN", currentSec);
                    writeCommand({ setPlatte: 0.72, setKreuz: 0.12 });
                    if (!await waitCancelable(scale(6000))) return;
                    setAutoPhase("KREUZ-KICK!", currentSec);
                    writeCommand({ setPlatte: 0.52, setKreuz: 0.78 });
                    triggerPeepsTimed('random', 5000, 0.45);
                    if (!await waitCancelable(scale(7000))) return;
                }

                // Übergang 1: Sportbremse (6s)
                setAutoPhase("SPORTBREMSE", currentSec);
                if (!await stutterBrake(3, 500, 500)) return;
                if (!await waitCancelable(scale(3500))) return;

                // Phase B: Tempo-Aufbau & Reko-Wellen (64s)
                setAutoPhase("TEMPO-AUFBAU", currentSec);
                writeCommand({ setPlatte: 0.80, setKreuz: 0.65 });
                triggerPeepsTimed('random', 4200, 0.70);
                if (!await waitCancelable(scale(16000))) return;

                for (let i = 0; i < 4; i++) {
                    setAutoPhase("SCHRÄG-DRIFT", currentSec);
                    writeCommand({ setPlatte: 0.88, setKreuz: 0.18 });
                    if (!await waitCancelable(scale(5500))) return;
                    setAutoPhase("WHIP-PEAK!", currentSec);
                    writeCommand({ setPlatte: 0.68, setKreuz: 0.95 });
                    triggerPeepsTimed('random', 5000, 0.45);
                    if (!await waitCancelable(scale(6500))) return;
                }

                // Übergang 2: Bremse & Doppel-Hupe vor Vollgas (6s)
                setAutoPhase("BREMSE & DROP", currentSec);
                writeCommand({ setPlatte: 0.50, setKreuz: 0.10, setGondelbremse: true });
                if (!await waitCancelable(1500)) return;
                writeCommand({ setGondelbremse: false });
                if (!await doubleHorn()) return;
                if (!await waitCancelable(scale(3500))) return;

                // Phase C: Vollgas, Slingshot & Finale (65s)
                setAutoPhase("VOLLGAS 100%!", currentSec);
                writeCommand({ setPlatte: 1.00, setKreuz: 1.00 });
                triggerPeepsTimed('random', 5500, 0.85);
                if (!await waitCancelable(scale(22000))) return;

                for (let i = 0; i < 2; i++) {
                    setAutoPhase("SLINGSHOT", currentSec);
                    writeCommand({ setPlatte: 1.00, setKreuz: 0.15 });
                    if (!await waitCancelable(scale(5500))) return;
                    if (!await stutterBrake(2, 400, 400)) return;
                    setAutoPhase("TURBO-SCHUB!", currentSec);
                    writeCommand({ setPlatte: 1.00, setKreuz: 1.00 });
                    if (i === 1) triggerPeepsTimed('random', 6000);
                    if (!await waitCancelable(scale(8500))) return;
                }

                setAutoPhase("FINALE 100%!", currentSec);
                writeCommand({ setPlatte: 1.00, setKreuz: 1.00 });
                triggerPeepsTimed('random', 5500, 0.85);
                if (!await waitCancelable(scale(13000))) return;
                break;

            case 1: // REKO-DRIFT (194s Hauptteil -> Gesamt exakt 240s = 4:00 Min!)
                // Phase A: Drift-Start & Brems-Fang-Schübe (54s)
                setAutoPhase("DRIFT-START", currentSec);
                writeCommand({ setPlatte: 0.68, setKreuz: 0.30 });
                if (!await waitCancelable(scale(12000))) return;

                for (let i = 0; i < 3; i++) {
                    setAutoPhase("BREMS-FANG", currentSec);
                    writeCommand({ setPlatte: 0.75, setKreuz: 0.10, setGondelbremse: true });
                    if (!await waitCancelable(1200)) return;
                    writeCommand({ setGondelbremse: false });
                    if (!await waitCancelable(scale(3800))) return;
                    setAutoPhase("DRIFT-SCHUB!", currentSec);
                    writeCommand({ setPlatte: 0.60, setKreuz: 0.90 });
                    triggerPeepsTimed('random', 5000, 0.45);
                    if (!await waitCancelable(scale(9000))) return;
                }

                // Übergang 1: Stotter-Bremse (6s)
                setAutoPhase("STOTTER-BREMSE", currentSec);
                if (!await stutterBrake(4, 400, 450)) return;
                if (!await waitCancelable(scale(3000))) return;

                // Phase B: High-Drift & Snap-Bremsen (65s)
                setAutoPhase("HIGH-DRIFT", currentSec);
                writeCommand({ setPlatte: 0.85, setKreuz: 0.55 });
                triggerPeepsTimed('random', 4200, 0.70);
                if (!await waitCancelable(scale(14000))) return;

                for (let i = 0; i < 4; i++) {
                    setAutoPhase("SCHRÄGFAHRT", currentSec);
                    writeCommand({ setPlatte: 0.92, setKreuz: 0.12 });
                    if (!await waitCancelable(scale(5000))) return;
                    setAutoPhase("SNAP-BREMSE!", currentSec);
                    writeCommand({ setGondelbremse: true });
                    if (!await waitCancelable(700)) return;
                    setAutoPhase("UMSCHLAG!", currentSec);
                    writeCommand({ setGondelbremse: false, setPlatte: 0.78, setKreuz: 1.00 });
                    triggerPeepsTimed('random', 5000, 0.45);
                    if (!await waitCancelable(scale(7000))) return;
                }

                // Phase C: Turbo-Drift, Freiflug-Gaps & Finale (69s)
                if (!await doubleHorn()) return;
                setAutoPhase("TURBO-DRIFT!", currentSec);
                writeCommand({ setPlatte: 1.00, setKreuz: 1.00 });
                triggerPeepsTimed('random', 5500, 0.85);
                if (!await waitCancelable(scale(20000))) return;

                for (let i = 0; i < 2; i++) {
                    setAutoPhase("FREIFLUG-GAP", currentSec);
                    writeCommand({ setPlatte: 1.00, setKreuz: 0.05 });
                    if (!await waitCancelable(scale(5500))) return;
                    if (!await stutterBrake(2, 400, 400)) return;
                    setAutoPhase("VOLLGAS-WHIP!", currentSec);
                    writeCommand({ setPlatte: 1.00, setKreuz: 1.00 });
                    if (!await waitCancelable(scale(10000))) return;
                }

                setAutoPhase("FINALE 100%!", currentSec);
                triggerPeepsTimed('random', 5500, 0.85);
                if (!await waitCancelable(scale(15000))) return;
                break;

            case 2: // TURBO-POWER (194s Hauptteil -> Gesamt exakt 240s = 4:00 Min!)
                // Phase A: Power-Start & Druck-Wellen (52s)
                setAutoPhase("POWER-START", currentSec);
                writeCommand({ setPlatte: 0.72, setKreuz: 0.65 });
                if (!await waitCancelable(scale(14000))) return;

                for (let i = 0; i < 3; i++) {
                    setAutoPhase("DRUCK-AUFBAU", currentSec);
                    writeCommand({ setPlatte: 0.85, setKreuz: 0.25 });
                    if (!await waitCancelable(scale(5500))) return;
                    setAutoPhase("POWER-WELLE!", currentSec);
                    writeCommand({ setPlatte: 0.68, setKreuz: 0.95 });
                    triggerPeepsTimed('random', 5000, 0.45);
                    if (!await waitCancelable(scale(7000))) return;
                }

                // Übergang 1: Sportbremse (6s)
                setAutoPhase("SPORTBREMSE", currentSec);
                if (!await stutterBrake(3, 450, 450)) return;
                if (!await waitCancelable(scale(3500))) return;

                // Phase B: Speed-Pumping (64s)
                setAutoPhase("TURBO-STUFE", currentSec);
                writeCommand({ setPlatte: 0.88, setKreuz: 0.80 });
                triggerPeepsTimed('random', 4200, 0.70);
                if (!await waitCancelable(scale(16000))) return;

                for (let i = 0; i < 4; i++) {
                    setAutoPhase("PLATTEN-SCHUB", currentSec);
                    writeCommand({ setPlatte: 0.96, setKreuz: 0.20 });
                    if (!await waitCancelable(scale(5000))) return;
                    setAutoPhase("KREUZ-EXPLOSION!", currentSec);
                    writeCommand({ setPlatte: 0.80, setKreuz: 1.00 });
                    triggerPeepsTimed('random', 5000, 0.45);
                    if (!await waitCancelable(scale(7000))) return;
                }

                // Übergang 2: Hard-Brake & Doppel-Hupe (6s)
                setAutoPhase("HARD-BRAKE", currentSec);
                writeCommand({ setPlatte: 0.45, setKreuz: 0.15, setGondelbremse: true });
                if (!await waitCancelable(1500)) return;
                writeCommand({ setGondelbremse: false });
                if (!await doubleHorn()) return;
                if (!await waitCancelable(scale(3500))) return;

                // Phase C: Vollgas-Sturm & Overdrive-Pulse (66s)
                setAutoPhase("VOLLGAS-STURM!", currentSec);
                writeCommand({ setPlatte: 1.00, setKreuz: 1.00 });
                triggerPeepsTimed('random', 5500, 0.85);
                if (!await waitCancelable(scale(21000))) return;

                for (let i = 0; i < 3; i++) {
                    setAutoPhase("LUFT HOLEN", currentSec);
                    writeCommand({ setPlatte: 1.00, setKreuz: 0.18 });
                    if (!await waitCancelable(scale(5000))) return;
                    setAutoPhase("MAXIMUM POWER!", currentSec);
                    writeCommand({ setPlatte: 1.00, setKreuz: 1.00 });
                    if (i === 2) triggerPeepsTimed('random', 5500, 0.85);
                    if (!await waitCancelable(scale(10000))) return;
                }
                break;

            case 3: // KATAPULT (194s Hauptteil -> Gesamt exakt 240s = 4:00 Min!)
                // Phase A: Aufbau & Gondel-Lock Slingshots (56s)
                setAutoPhase("AUFBAU", currentSec);
                writeCommand({ setPlatte: 0.70, setKreuz: 0.60 });
                if (!await waitCancelable(scale(14000))) return;

                for (let i = 0; i < 3; i++) {
                    setAutoPhase("GONDEL-LOCK", currentSec);
                    writeCommand({ setPlatte: 0.75, setKreuz: 0.05, setGondelbremse: true });
                    if (!await waitCancelable(1400)) return;
                    setAutoPhase("AUFLADEN...", currentSec);
                    writeCommand({ setPlatte: 0.85, setKreuz: 0.05 });
                    if (!await waitCancelable(scale(3600))) return;
                    setAutoPhase("KATAPULT-SCHUSS!", currentSec);
                    writeCommand({ setGondelbremse: false, setPlatte: 0.70, setKreuz: 0.95 });
                    triggerPeepsTimed('random', 5000, 0.55);
                    if (!await waitCancelable(scale(9000))) return;
                }

                // Übergang 1: Stotter-Bremse (6s)
                setAutoPhase("BREMSE", currentSec);
                if (!await stutterBrake(3, 500, 500)) return;
                if (!await waitCancelable(scale(3500))) return;

                // Phase B: Highspeed Schock-Drops (64s)
                setAutoPhase("SPEED-AUFBAU", currentSec);
                writeCommand({ setPlatte: 0.88, setKreuz: 0.80 });
                triggerPeepsTimed('random', 4200, 0.70);
                if (!await waitCancelable(scale(13000))) return;

                for (let i = 0; i < 4; i++) {
                    setAutoPhase("SCHOCK-DROP!", currentSec);
                    writeCommand({ setPlatte: 0.92, setKreuz: 0.05 });
                    if (!await waitCancelable(scale(4500))) return;
                    writeCommand({ setGondelbremse: true });
                    if (!await waitCancelable(800)) return;
                    setAutoPhase("SLINGSHOT 100%!", currentSec);
                    writeCommand({ setGondelbremse: false, setPlatte: 0.88, setKreuz: 1.00 });
                    triggerPeepsTimed('random', 5000, 0.45);
                    if (!await waitCancelable(scale(7500))) return;
                }

                // Phase C: Vollgas & Mega-Abschuss-Finale (68s)
                if (!await doubleHorn()) return;
                setAutoPhase("VOLLGAS 100%!", currentSec);
                writeCommand({ setPlatte: 1.00, setKreuz: 1.00 });
                triggerPeepsTimed('random', 5500, 0.85);
                if (!await waitCancelable(scale(20000))) return;

                for (let i = 0; i < 2; i++) {
                    setAutoPhase("FINAL-LOCK!", currentSec);
                    writeCommand({ setPlatte: 1.00, setKreuz: 0.05, setGondelbremse: true });
                    if (!await waitCancelable(1800)) return;
                    writeCommand({ setGondelbremse: false });
                    if (!await waitCancelable(scale(4200))) return;
                    setAutoPhase("MEGA-ABSCHUSS!", currentSec);
                    writeCommand({ setPlatte: 1.00, setKreuz: 1.00 });
                    triggerPeepsTimed('random', 5500, 0.85);
                    if (!await waitCancelable(scale(17500))) return;
                }
                break;

            case 5: // FREITAG ABEND PARTY (Brake-Dancer Style, ~194s Hauptteil -> Gesamt exakt 240s = 4:00 Min!)
                // Phase A: Party-Auftakt & erste Schwünge (54s)
                setAutoPhase("PARTY-START", currentSec);
                writeCommand({ setPlatte: 0.55, setKreuz: 0.35, mhSpeed: 0.85 });
                if (!await waitCancelable(scale(10000))) return;

                for (let i = 0; i < 3; i++) {
                    setAutoPhase("GONDEL-SCHWUNG", currentSec);
                    writeCommand({ setPlatte: 0.65, setKreuz: 0.15, mhSpeed: 0.90 });
                    if (!await waitCancelable(scale(6000))) return;
                    setAutoPhase("KREUZ-KICK!", currentSec);
                    writeCommand({ setPlatte: 0.50, setKreuz: 0.85, mhSpeed: 1.00 });
                    triggerPeepsTimed('random', 5000, 0.45);
                    if (!await waitCancelable(scale(7000))) return;
                }

                // Übergang 1: Sportbremse (6s)
                setAutoPhase("SPORTBREMSE", currentSec);
                writeCommand({ mhSpeed: 0.60 });
                if (!await stutterBrake(3, 400, 400)) return;
                if (!await waitCancelable(scale(3000))) return;

                // Phase B: Tanzfloor & Richtungswechsel (63s)
                setAutoPhase("TEMPO-PARTY", currentSec);
                writeCommand({ setPlatte: 0.80, setKreuz: 0.60, mhSpeed: 1.00 });
                triggerPeepsTimed('random', 4200, 0.70);
                if (!await waitCancelable(scale(14000))) return;

                for (let i = 0; i < 4; i++) {
                    setAutoPhase("SCHRÄG-DRIFT", currentSec);
                    writeCommand({ setPlatte: 0.90, setKreuz: 0.20, mhSpeed: 0.95 });
                    if (!await waitCancelable(scale(5000))) return;
                    setAutoPhase("WHIP-PEAK!", currentSec);
                    writeCommand({ setPlatte: 0.70, setKreuz: 1.00, mhSpeed: 1.00 });
                    triggerPeepsTimed('random', 5000, 0.45);
                    if (!await waitCancelable(scale(6000))) return;
                }

                // Übergang 2: Bremse & Doppel-Hupe vor Vollgas (6s)
                setAutoPhase("BREMSE & DROP", currentSec);
                writeCommand({ setPlatte: 0.50, setKreuz: 0.10, setGondelbremse: true });
                if (!await waitCancelable(1500)) return;
                writeCommand({ setGondelbremse: false });
                if (!await doubleHorn()) return;
                if (!await waitCancelable(scale(3000))) return;

                // Phase C: Maximaler Party-Schwung (60s)
                setAutoPhase("VOLLGAS PARTY!", currentSec);
                writeCommand({ setPlatte: 1.00, setKreuz: 1.00 });
                triggerPeepsTimed('random', 5500, 0.85);
                if (!await waitCancelable(scale(20000))) return;

                for (let i = 0; i < 2; i++) {
                    setAutoPhase("SLINGSHOT", currentSec);
                    writeCommand({ setPlatte: 1.00, setKreuz: 0.15 });
                    if (!await waitCancelable(scale(5500))) return;
                    if (!await stutterBrake(2, 300, 300)) return;
                    setAutoPhase("TURBO-SCHUB!", currentSec);
                    writeCommand({ setPlatte: 1.00, setKreuz: 1.00 });
                    if (i === 1) triggerPeepsTimed('random', 5500, 0.85);
                    if (!await waitCancelable(scale(8000))) return;
                }

                setAutoPhase("FINALE PARTY!", currentSec);
                writeCommand({ setPlatte: 1.00, setKreuz: 1.00 });
                triggerPeepsTimed('random', 5500, 0.85);
                if (!await waitCancelable(scale(12000))) return;
                break;

                       case 6: // FREITAG ABEND PARTY - DYNAMISCHER MIX (IMMER ANDERS)
                // <<- sStart tour 6
                setAutoPhase("PARTY-START", currentSec);
                if (!await doubleHorn()) return;

                // Gesamtlaufzeit der dynamischen Phase (ca. 2,5 bis 3 Minuten)
                const targetDurationMs = Math.max(25000, targetMainSec * 1000);
                const startTime = Date.now();

                // Die verschiedenen Bausteine – perfekt dosiert
                const actionModules = [
                    // 1. Action: Volle Peitsche (Vollgas, aber nur kurz!)
                    async function highPowerWhip() {
                        setAutoPhase("VOLLGAS PEITSCHE!", currentSec);
                        writeCommand({ setPlatte: 1.00, setKreuz: 1.00 });
                        triggerPeepsTimed('random', 3000, 0.95);
                        // Nur kurz halten (3 bis 4.5 Sekunden), damit es nicht langweilig wird
                        return await waitCancelable(scale(3000 + Math.floor(Math.random() * 1500)));
                    },

                    // 2. Rhythmus: Kreuzer ballert, Platte läuft mittelschnell (Typischer Mega Dance Effekt)
                    async function crossOverdrive() {
                        setAutoPhase("KREUZER-ATTACKE", currentSec);
                        writeCommand({ setPlatte: (0.60 + Math.random()*0.15).toFixed(2), setKreuz: 1.00 });
                        triggerPeepsTimed('random', 4000, 0.80);
                        return await waitCancelable(scale(4000 + Math.floor(Math.random() * 1500)));
                    },

                    // 3. Kurze Pause: Platte drückt, Kreuzer atmet durch (Gondeln schwingen frei)
                    async function shortBreather() {
                        setAutoPhase("SCHWUNG-PAUSE", currentSec);
                        // Kreuzer fast aus, Platte hält das Tempo oben
                        writeCommand({ setPlatte: (0.75 + Math.random()*0.10).toFixed(2), setKreuz: 0.15 });
                        // Sehr kurze Erholung für die Motoren (nur 3 bis 4 Sekunden)
                        return await waitCancelable(scale(3000 + Math.floor(Math.random() * 1000)));
                    },

                    // 4. Action: Schrägdrift mit Brems-Kick
                    async function driftKick() {
                        setAutoPhase("DRIFT-KICK", currentSec);
                        writeCommand({ setPlatte: 0.85, setKreuz: 0.30 });
                        if (!await waitCancelable(scale(2500 + Math.floor(Math.random() * 1000)))) return false;
                        
                        // Ein kurzer, knackiger Bremsstoß, um die Gondeln wild zu überschlagen
                        writeCommand({ setGondelbremse: true }); if (!await waitCancelable(300)) return false; writeCommand({ setGondelbremse: false });
                        
                        writeCommand({ setPlatte: 0.50, setKreuz: 0.90 }); // Direkt danach Gegengewicht aufbauen
                        return await waitCancelable(scale(3500 + Math.floor(Math.random() * 1000)));
                    },

                    // 5. Rhythmus: Stotterbremse im Flug (Sportbremse)
                    async function flyingBrake() {
                        setAutoPhase("DANCE-BREAK", currentSec);
                        if (!await stutterBrake(2, 300, 300)) return false; // Nur 2 schnelle Ticks
                        writeCommand({ setPlatte: 0.70, setKreuz: 0.70 });
                        return await waitCancelable(scale(4000 + Math.floor(Math.random() * 1500)));
                    }
                ];

                // Die Hauptschleife wirft die Phasen durcheinander
                let lastModuleIndex = -1;
                while (Date.now() - startTime < targetDurationMs) {
                    let nextModuleIndex;
                    // Verhindern, dass zweimal hintereinander das gleiche Modul kommt
                    do {
                        nextModuleIndex = Math.floor(Math.random() * actionModules.length);
                    } while (nextModuleIndex === lastModuleIndex);
                    
                    lastModuleIndex = nextModuleIndex;

                    // Modul ausführen
                    const success = await actionModules[nextModuleIndex]();
                    if (!success) return; // Abbruch bei manuellem Stop
                }

                // --- DAS ABSCHLUSS-FINALE (Immer am Ende der Tour) ---
                setAutoPhase("FINAL-ABRISS!", currentSec);
                writeCommand({ setPlatte: 1.00, setKreuz: 1.00 }); // Zum Schluss noch mal alles geben
                triggerPeepsTimed('random', 5000, 0.99);
                if (!await waitCancelable(scale(5500 + Math.floor(Math.random() * 1000)))) return;

                // Letzter, fetter Bremsschlag bei Fullspeed für den finalen Thrill
                writeCommand({ setGondelbremse: true }); 
                if (!await waitCancelable(700)) return; 
                writeCommand({ setGondelbremse: false });

                // Schneller Auslauf
                setAutoPhase("AUSLAUF", currentSec);
                writeCommand({ setPlatte: 0.30, setKreuz: 0.00 });
                if (!await waitCancelable(scale(4000))) return;
                
                // <<- sEnd tour 6
                break;


            case 7: // SAMSTAG ABEND (Variabel)
                // <<- sStart tour 8
                for (let i = 0; i < 3; i++) {
                    setAutoPhase("PARTY-START", currentSec);
                    writeCommand({ setPlatte: (0.40 + Math.random()*0.50).toFixed(2), setKreuz: (0.20 + Math.random()*0.60).toFixed(2) });
                    if (!await waitCancelable(scale(1500 + Math.floor(Math.random()*1500)))) return;
                }
                setAutoPhase("FINALE PARTY!", currentSec);
                writeCommand({ setPlatte: 1.00, setKreuz: 1.00 });
                triggerPeepsTimed('random', 5500, 0.85);
                if (!await waitCancelable(scale(5000 + Math.floor(Math.random()*1500)))) return;
                // <<- sEnd tour 8
                break;

﻿            case 7: // SAMSTAG ABEND PREMIUM PARTY (4 MINUTEN LIVE-SHOW)
                // <<- sStart tour 7
                
                // === AKT 1: WARM-UP & EINFAHREN (ca. 30-40 Sek) ===
                // Gemütliches Kennenlernen, Gondeln leicht anschaukeln lassen
                setAutoPhase("PREMIUM WARM-UP", currentSec);
                writeCommand({ setPlatte: 0.35, setKreuz: 0.15, setGondelbremse: false });
                triggerPeepsTimed('random', 5000, 0.75);
                if (!await waitCancelable(scale(15000 + Math.floor(Math.random() * 3000)))) return;

                setAutoPhase("ERSTE STEIGERUNG", currentSec);
                writeCommand({ setPlatte: 0.55, setKreuz: 0.40 });
                if (!await waitCancelable(scale(15000 + Math.floor(Math.random() * 3000)))) return;


                // === AKT 2: DER POWER-DRIFT (ca. 60 Sek) ===
                // Die Platte zieht voll an, die Kreuzer halten sich zurück.
                // Durch die Fliehkraft drückt es die Gondeln extrem weit nach außen.
                for (let i = 0; i < 2; i++) {
                    setAutoPhase("HIGH-SPEED DRIFT", currentSec);
                    writeCommand({ setPlatte: (0.85 + Math.random() * 0.10).toFixed(2), setKreuz: 0.25 });
                    triggerPeepsTimed('random', 6000, 0.85);
                    if (!await waitCancelable(scale(18000 + Math.floor(Math.random() * 2000)))) return;
                    
                    // Ein kurzer, sauberer Bremsschlag, um die Flugrichtung der Gondeln umzureißen
                    setAutoPhase("DRIFT-TICK", currentSec);
                    writeCommand({ setGondelbremse: true }); if (!await waitCancelable(300)) return; writeCommand({ setGondelbremse: false });
                    writeCommand({ setPlatte: 0.70, setKreuz: 0.60 }); 
                    if (!await waitCancelable(scale(10000 + Math.floor(Math.random() * 2000)))) return;
                }


                // === AKT 3: DAS PEITSCHEN-GEWITTER (ca. 60 Sek) ===
                // Jetzt wird es sportlich. Harte Richtungswechsel und unberechenbare Kreuzer-Schübe.
                for (let i = 0; i < 2; i++) {
                    setAutoPhase("PEITSCHEN-STORM", currentSec);
                    writeCommand({ setPlatte: 0.65, setKreuz: 1.00 }); // Kreuzer auf Max für wildes Überschlagen
                    if (!await waitCancelable(scale(16000 + Math.floor(Math.random() * 2000)))) return;

                    setAutoPhase("RHYTHMUS-BREMSE", currentSec);
                    if (!await stutterBrake(3, 250, 250)) return; // Kirmes-Klacken der Magnetbremsen
                    writeCommand({ setPlatte: 0.80, setKreuz: 0.75 });
                    triggerPeepsTimed('random', 5000, 0.90);
                    if (!await waitCancelable(scale(12000 + Math.floor(Math.random() * 2000)))) return;
                }


                // === AKT 4: DER SILENT DROP (ca. 30 Sek SHOW-EFFEKT) ===
                // Das psychologische Highlight. Das Geschäft tourt fast komplett ab. 
                // Die Gondeln werden starr gesperrt. Die Fahrgäste denken, die 15 Euro sind vorbei...
                setAutoPhase("SHOW-DROP (FAKE ENDE)", currentSec);
                writeCommand({ setPlatte: 0.30, setKreuz: 0.00, setGondelbremse: true });
                if (!await waitCancelable(6000)) return; // Lange, spannende Pause im Fast-Stillstand
                
                // ...und plötzlich schlägt die Physik ohne Vorwarnung wieder ein!
                setAutoPhase("KATAPULT-ATTACKE!", currentSec);
                writeCommand({ setGondelbremse: false, setPlatte: 0.95, setKreuz: 0.95 });
                triggerPeepsTimed('random', 6000, 0.99);
                if (!await waitCancelable(scale(15000 + Math.floor(Math.random() * 3000)))) return;


                // === AKT 5: DAS ULTIMATIVE FINALE (ca. 50-60 Sek) ===
                // Jetzt glühen die Motoren. Maximaler Dauerdruck für den Endspurt.
                setAutoPhase("FINALE STEIGERUNG", currentSec);
                writeCommand({ setPlatte: 1.00, setKreuz: 0.70 });
                if (!await waitCancelable(scale(15000 + Math.floor(Math.random() * 2000)))) return;

                setAutoPhase("TOTALER ABRISS! (100%)", currentSec);
                writeCommand({ setPlatte: 1.00, setKreuz: 1.00 }); // Alles auf Anschlag
                triggerPeepsTimed('random', 8000, 1.00); // Maximale Lautstärke bei der Menge
                if (!await waitCancelable(scale(25000 + Math.floor(Math.random() * 3000)))) return;


                // === DER OUTRO-LOCKDOWN ===
                // Ein gigantischer Abschlussschlag aus voller Fahrt schleudert die Gondeln ein letztes Mal
                setAutoPhase("FINAL LOCK", currentSec);
                writeCommand({ setGondelbremse: true });
                if (!await waitCancelable(1200)) return;
                writeCommand({ setGondelbremse: false });

                // Sanftes Auslaufen lassen für den Fahrgastwechsel
                setAutoPhase("AUSLAUF", currentSec);
                writeCommand({ setPlatte: 0.20, setKreuz: 0.00 });
                if (!await waitCancelable(scale(6000))) return;

                // <<- sEnd tour 7
                break;


            default: // Case 4: SHOWDOWN (194s Hauptteil -> Gesamt exakt 240s = 4:00 Min!)
                // Phase A: Showdown-Start & Cross-Swings (53s)
                setAutoPhase("SHOWDOWN-START", currentSec);
                writeCommand({ setPlatte: 0.68, setKreuz: 0.55 });
                if (!await waitCancelable(scale(14000))) return;

                for (let i = 0; i < 3; i++) {
                    setAutoPhase("CROSS-SWING", currentSec);
                    writeCommand({ setPlatte: 0.78, setKreuz: 0.12 });
                    if (!await waitCancelable(scale(5500))) return;
                    setAutoPhase("POWER-WHIP!", currentSec);
                    writeCommand({ setPlatte: 0.65, setKreuz: 0.92 });
                    triggerPeepsTimed('random', 5000, 0.45);
                    if (!await waitCancelable(scale(7500))) return;
                }

                // Übergang 1: Sportbremse (6s)
                setAutoPhase("SPORTBREMSE", currentSec);
                if (!await stutterBrake(3, 450, 450)) return;
                if (!await waitCancelable(scale(3500))) return;

                // Phase B: High-Speed & Drift-Attacken (63s)
                setAutoPhase("HIGH SPEED", currentSec);
                writeCommand({ setPlatte: 0.88, setKreuz: 0.85 });
                triggerPeepsTimed('random', 6000);
                if (!await waitCancelable(scale(18000))) return;

                for (let i = 0; i < 3; i++) {
                    setAutoPhase("DRIFT-GAP", currentSec);
                    writeCommand({ setPlatte: 0.95, setKreuz: 0.08 });
                    if (!await waitCancelable(scale(6000))) return;
                    setAutoPhase("ATTACKE!", currentSec);
                    writeCommand({ setPlatte: 0.85, setKreuz: 1.00 });
                    if (!await waitCancelable(scale(9000))) return;
                }

                // === FAKE-ENDE (12s - Fahrt tut so als wäre Schluss!) ===
                setAutoPhase("FAKE-AUSLAUF...", currentSec);
                writeCommand({ setPlatte: 0.25, setKreuz: 0.10, setGondelbremse: true });
                if (!await waitCancelable(1500)) return;
                writeCommand({ setGondelbremse: false });
                triggerPeepsTimed('again', 5000);
                if (!await waitCancelable(scale(8500))) return;

                // === ZUGABE-ALARM! Doppel-Hupe + 60s 100% Nachschlag! ===
                setAutoPhase("ZUGABE?! HUPE!", currentSec);
                if (!await doubleHorn()) return;
                if (!await waitCancelable(1000)) return;

                setAutoPhase("ZUGABE VOLLGAS!", currentSec);
                writeCommand({ setPlatte: 1.00, setKreuz: 1.00 });
                triggerPeepsTimed('random', 5500, 0.85);
                if (!await waitCancelable(scale(22000))) return;

                for (let i = 0; i < 2; i++) {
                    setAutoPhase("FINAL-STUTTER!", currentSec);
                    writeCommand({ setPlatte: 1.00, setKreuz: 0.15 });
                    if (!await waitCancelable(scale(4500))) return;
                    if (!await stutterBrake(2, 400, 400)) return;
                    setAutoPhase("EXTREME FINALE!", currentSec);
                    writeCommand({ setPlatte: 1.00, setKreuz: 1.00 });
                    if (i === 1) triggerPeepsTimed('random', 5500, 0.85);
                    if (!await waitCancelable(scale(13000))) return;
                }
                break;
        }

        // ============================================================
        // OUTRO-BLOCK (Exakt 18 Sekunden -> Summe = 28 + 194 + 18 = 240s!)
        // ============================================================
        // 5. AUSPENDELN (13s)
        setAutoPhase("AUSPENDELN", currentSec);
        writeCommand({ setPlatte: 0.32, setKreuz: 0.18 });
        if (!await waitCancelable(scale(8000))) return;
        writeCommand({ setGondelbremse: true });
        if (!await waitCancelable(1000)) return;
        writeCommand({ setGondelbremse: false });
        triggerPeepsTimed('random', 4000, 0.85);
        if (!await waitCancelable(scale(4000))) return;

        // 6. ABFAHRT (Sanfter Stopp, 5s)
        setAutoPhase("ABFAHRT", 0);
        writeCommand({ setPlatte: 0.00, setKreuz: 0.00 });
        if (!await waitCancelable(5000)) return;
        writeCommand({ setMotorPlateOn: false, setMotorCrossOn: false, peepHandsUp: false, peepClap: false });

        setAutoPhase("FERTIG!", 0);
        if (pkTipUserActive) writeCommand({ tipPK: true });
        if (!await waitCancelable(3000)) return;

        // AUTO-LOOP MODUS: Wenn aktiv, Pause herunterzählen und automatisch nächste Fahrt starten!
        clearInterval(timerInterval);
        if (autoDriveState.loop && !autoDriveCancel) {
            let remPause = Math.max(5, parseInt(autoDriveState.pauseSec) || 60);
            while (remPause > 0 && !autoDriveCancel && autoDriveState.loop) {
                setAutoPhase(`PAUSE (${remPause}s)`, remPause);
                if (!await waitCancelable(1000)) return;
                remPause--;
            }
            if (!autoDriveCancel && autoDriveState.loop) {
                setImmediate(() => runAutoDriveRoutine(tourIdx, autoDriveState.night, dur));
                return;
            }
        }
    } catch (e) {
        console.error("AutoDrive Error:", e);
        setAutoPhase("FEHLER", 0);
    } finally {
        clearInterval(timerInterval);
        if (!autoDriveState.loop || autoDriveCancel) {
            autoDriveState.running = false;
            setAutoPhase("BEREIT", 0);
        }
    }
}

function stopAutoDrive() {
    autoDriveCancel = true;
    autoDriveState.running = false;
    setAutoPhase("ABBRUCH", 0);
    writeCommand({ setPlatte: 0.00, setKreuz: 0.00, setMotorPlateOn: false, setMotorCrossOn: false });
}

let lastValidState = {};
let lastValidTelemetry = {};

function getMergedState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const raw = fs.readFileSync(STATE_FILE, 'utf8');
            if (raw.trim().length > 0) {
                lastValidState = JSON.parse(raw);
            }
        }
    } catch (e) {
        // file might be locked during game write -> keep lastValidState
    }

    try {
        if (fs.existsSync(TELEMETRY_FILE)) {
            const raw = fs.readFileSync(TELEMETRY_FILE, 'utf8');
            if (raw.trim().length > 0) {
                lastValidTelemetry = JSON.parse(raw);
            }
        }
    } catch (e) {
        // file might be locked during game write -> keep lastValidTelemetry
    }

    return {
        gameConnected: (Object.keys(lastValidState).length > 0 || Object.keys(lastValidTelemetry).length > 0 || fs.existsSync(STATE_FILE) || fs.existsSync(TELEMETRY_FILE)),
        timestamp: Date.now(),
        ...lastValidState,
        telemetry: { ...lastValidTelemetry, ...s2lServerOverrides },
        autoDrive: autoDriveState,
        xplosionAutoDrive: xplosionAutoDriveState,
        pinballAutoDrive: pinballAutoDriveState
    };
}


function writeCommand(newCommands) {
    // Persist S2L settings & update in-memory override immediately
    saveS2LSettingsToDisk(newCommands);

    // Check if an S2L setting (checkbox/slider) was changed so we can also sync into old in-memory DLLs without game restart
    let hasS2LSettingKey = false;
    for (const k of Object.keys(newCommands)) {
        if (S2L_KEY_TO_FILE[k] !== undefined) {
            hasS2LSettingKey = true;
            break;
        }
    }

    const currentS2LActive = (newCommands.setS2LLight !== undefined)
        ? !!newCommands.setS2LLight
        : (s2lServerOverrides.s2lLightActive !== undefined ? !!s2lServerOverrides.s2lLightActive : !!(lastValidTelemetry && lastValidTelemetry.s2lLightActive));

    const s2lSyncPayload = hasS2LSettingKey ? {
        ...s2lServerOverrides,
        ...(newCommands.setS2LLight !== undefined ? { setS2LLight: currentS2LActive } : {})
    } : {};
    delete s2lSyncPayload.s2lLightActive;

    // 1. Write to command.json for FairgroundBridge
    let existing = {};
    try {
        if (fs.existsSync(CMD_FILE)) {
            const raw = fs.readFileSync(CMD_FILE, 'utf8');
            existing = JSON.parse(raw);
        }
    } catch (e) {
        existing = {};
    }

    const merged = { ...existing, ...s2lSyncPayload, ...newCommands };
    const json = JSON.stringify(merged);
    const tmp = CMD_FILE + '.tmp';

    try {
        fs.writeFileSync(tmp, json, 'utf8');
        fs.renameSync(tmp, CMD_FILE);
    } catch (e) {
        try { fs.writeFileSync(CMD_FILE, json, 'utf8'); } catch (err) {}
    }

    // 2. Write to command_telemetry.json specifically for FairgroundTelemetry so it never gets deleted by FairgroundBridge
    let existingTel = {};
    try {
        if (fs.existsSync(CMD_TELEMETRY_FILE)) {
            const raw = fs.readFileSync(CMD_TELEMETRY_FILE, 'utf8');
            existingTel = JSON.parse(raw);
        }
    } catch (e) {
        existingTel = {};
    }

    const mergedTel = { ...existingTel, ...s2lSyncPayload, ...newCommands };
    const jsonTel = JSON.stringify(mergedTel);
    const tmpTel = CMD_TELEMETRY_FILE + '.tmp';

    try {
        fs.writeFileSync(tmpTel, jsonTel, 'utf8');
        fs.renameSync(tmpTel, CMD_TELEMETRY_FILE);
    } catch (e) {
        try { fs.writeFileSync(CMD_TELEMETRY_FILE, jsonTel, 'utf8'); } catch (err) {}
    }
}

// --- LIVE JINGLE -> NPC REACTION MONITOR (Coupled to AutoDrive) ---
let wasJinglePlaying = false;
let lastJingleIdentity = '';
let lastJingleReactTime = 0;

function checkJinglePeepReaction(mergedState) {
    try {
        const tel = mergedState.telemetry || {};
        const telMusic = tel.music || {};
        const stateMusic = mergedState.music || {};

        const isJingleNow = !!(telMusic.jingle || stateMusic.jingle);
        const jingleName = String(telMusic.jingleName || '').trim();
        const jinglePath = String(telMusic.jinglePath || '').trim();
        const jingleFolderIdx = typeof telMusic.jingleFolder === 'number' ? telMusic.jingleFolder : -1;
        const currentIdentity = jinglePath || jingleName || (isJingleNow ? 'active_jingle' : '');

        const startedOrChanged = isJingleNow && (!wasJinglePlaying || (currentIdentity && currentIdentity !== lastJingleIdentity));
        wasJinglePlaying = isJingleNow;
        if (!isJingleNow) {
            lastJingleIdentity = '';
            return;
        }
        lastJingleIdentity = currentIdentity;

        // Reagieren, wenn entweder Breakdance oder Pinball AutoDrive aktiv ist ODER allgemein wenn Jingle-Reaktion an ist!
        const anyRideReactEnabled = !!(autoDriveState.jinglePeepReact || pinballAutoDriveState.jinglePeepReact || jingleConfig.enabled);
        if (!startedOrChanged) return;
        if (!anyRideReactEnabled) return;

        // Cooldown 1.5s gegen Doppel-Trigger
        const now = Date.now();
        if (now - lastJingleReactTime < 1500) return;

        // Bestimme konfigurierte Reaktion für diesen Jingle
        let reaction = null;
        const deckLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
        const deckLetter = (jingleFolderIdx >= 0 && jingleFolderIdx < deckLetters.length) ? deckLetters[jingleFolderIdx] : '';

        if (jinglePath) {
            const fileBase = path.basename(jinglePath);
            const parentDeck = path.basename(path.dirname(jinglePath));
            const exactKey = `${parentDeck}/${fileBase}`;
            if (jingleConfig.reactions[exactKey] !== undefined) {
                reaction = jingleConfig.reactions[exactKey];
            }
        }

        if (!reaction && jingleName) {
            const lowerName = jingleName.toLowerCase();
            for (const [k, val] of Object.entries(jingleConfig.reactions)) {
                const kLower = k.toLowerCase();
                const filePart = kLower.includes('/') ? kLower.split('/')[1] : kLower;
                const fileNoExt = filePart.replace(/\.(ogg|mp3|wav|flac)$/i, '');
                if (filePart === lowerName || fileNoExt === lowerName || (deckLetter && kLower === `${deckLetter.toLowerCase()}/${lowerName}`)) {
                    reaction = val;
                    break;
                }
            }
            if (!reaction) {
                reaction = guessDefaultJingleReaction(jingleName);
            }
        }

        // Fallback falls Jingle ohne Dateinamen-Telemetrie (z.B. vor Spiel-Neustart via state.json) erkannt wurde
        if (!reaction) {
            reaction = 'random';
        }

        if (reaction === 'none') return;

        lastJingleReactTime = now;
        autoDriveState.lastJingleTriggered = jingleName || path.basename(jinglePath) || 'Jingle';

        let chosen = reaction;
        if (chosen === 'random') {
            const pool = ['hands', 'clap', 'scream'];
            chosen = pool[Math.floor(Math.random() * pool.length)];
        }

        const delayMs = 450 + Math.floor(Math.random() * 250); // 450-700ms Verzögerung damit der Jingle zuerst anläuft!
        const ratio = Number((0.55 + Math.random() * 0.35).toFixed(2)); // 55% bis 90% der Besucher reagieren

        setTimeout(() => {
            const stillActive = !!(autoDriveState.jinglePeepReact || pinballAutoDriveState.jinglePeepReact || jingleConfig.enabled);
            if (!stillActive) return;
            if (chosen === 'hands') {
                writeCommand({ peepHandsUp: true, peepRatio: ratio });
            } else if (chosen === 'clap') {
                writeCommand({ peepClap: true, peepRatio: ratio });
            } else if (chosen === 'scream') {
                writeCommand({ peepScream: true, peepRatio: ratio });
            } else if (chosen === 'again') {
                writeCommand({ peepAgain: true, peepRatio: ratio });
            }
        }, delayMs);
    } catch (e) {}
}

// Broadcast SSE updates ~5 times/second (200ms) - entlastet Festplatte & verhindert Unity-Mikroruckler
setInterval(() => {
    const current = getMergedState();
    checkJinglePeepReaction(current);
    if (sseClients.length === 0) return;
    const json = JSON.stringify(current);
    if (json !== lastMergedStateJson) {
        lastMergedStateJson = json;
        const msg = `data: ${json}\n\n`;
        sseClients.forEach(res => {
            try { res.write(msg); } catch (e) {}
        });
    }
}, 200);

const server = http.createServer((req, res) => {
    // CORS headers for local network access
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    // API: Current state
    if (url.pathname === '/api/state' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(getMergedState()));
    }

    // API: Local Network Info & QR-Code Target URL
    if (url.pathname === '/api/network-info' && req.method === 'GET') {
        const interfaces = os.networkInterfaces();
        const ips = [];
        for (const name of Object.keys(interfaces)) {
            for (const net of interfaces[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    ips.push(net.address);
                }
            }
        }
        const primaryIp = ips[0] || '127.0.0.1';
        const urlStr = `http://${primaryIp}:${PORT}`;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            ip: primaryIp,
            port: PORT,
            url: urlStr,
            allIps: ips
        }));
    }

    // API: Real-time SSE Stream
    if (url.pathname === '/api/events' && req.method === 'GET') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        });
        res.write(`data: ${JSON.stringify(getMergedState())}\n\n`);
        sseClients.push(res);

        req.on('close', () => {
            sseClients = sseClients.filter(client => client !== res);
        });
        return;
    }

    // API: Jingles List & Reaction Config
    if (url.pathname === '/api/jingles' && req.method === 'GET') {
        const list = scanUserJingles();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            enabled: autoDriveState.jinglePeepReact,
            jingles: list,
            reactions: jingleConfig.reactions
        }));
    }

    if (url.pathname === '/api/jingles' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (typeof data.enabled === 'boolean') {
                    jingleConfig.enabled = data.enabled;
                    autoDriveState.jinglePeepReact = data.enabled;
                }
                if (data.key && typeof data.reaction === 'string') {
                    jingleConfig.reactions[data.key] = data.reaction;
                }
                if (data.reactions && typeof data.reactions === 'object') {
                    Object.assign(jingleConfig.reactions, data.reactions);
                }
                if (data.resetDefaults) {
                    jingleConfig.reactions = {};
                    scanUserJingles();
                } else {
                    saveJingleConfig();
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({
                    success: true,
                    enabled: autoDriveState.jinglePeepReact,
                    reactions: jingleConfig.reactions
                }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // API: Start / Stop Pinball AutoDrive
    if (url.pathname === '/api/pinball-autodrive' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (data.action === 'start') {
                    let isSeatedPinball = false;
                    try {
                        if (fs.existsSync(TELEMETRY_FILE)) {
                            const telRaw = fs.readFileSync(TELEMETRY_FILE, 'utf8');
                            if (telRaw.trim().length > 0) lastValidTelemetry = JSON.parse(telRaw);
                        }
                    } catch (e) {}
                    if (lastValidTelemetry && lastValidTelemetry.operator) {
                        isSeatedPinball = !!lastValidTelemetry.operator.pinballSeated;
                    }
                    if (!isSeatedPinball) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({
                            success: false,
                            blocked: true,
                            reason: 'Du sitzt im Spiel nicht am Flipper (Pinball)-Pult!'
                        }));
                    }
                    const tour = parseInt(data.tour !== undefined ? data.tour : 0) || 0;
                    if (data.loop !== undefined) pinballAutoDriveState.loop = !!data.loop;
                    if (data.pauseSec !== undefined) pinballAutoDriveState.pauseSec = Math.max(10, parseInt(data.pauseSec) || 45);
                    if (data.durationMin !== undefined) pinballAutoDriveState.durationMin = Math.max(1, Math.min(6, parseInt(data.durationMin) || 3));
                    if (data.jinglePeepReact !== undefined) {
                        pinballAutoDriveState.jinglePeepReact = !!data.jinglePeepReact;
                        jingleConfig.enabled = pinballAutoDriveState.jinglePeepReact;
                        saveJingleConfig();
                    }

                    runPinballAutoRoutine(tour, pinballAutoDriveState.durationMin);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: true, running: true }));
                } else if (data.action === 'config') {
                    if (data.loop !== undefined) pinballAutoDriveState.loop = !!data.loop;
                    if (data.pauseSec !== undefined) pinballAutoDriveState.pauseSec = Math.max(10, parseInt(data.pauseSec) || 45);
                    if (data.durationMin !== undefined) pinballAutoDriveState.durationMin = Math.max(1, Math.min(6, parseInt(data.durationMin) || 3));
                    if (data.jinglePeepReact !== undefined) {
                        pinballAutoDriveState.jinglePeepReact = !!data.jinglePeepReact;
                        jingleConfig.enabled = pinballAutoDriveState.jinglePeepReact;
                        saveJingleConfig();
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: true, pinballAutoDrive: pinballAutoDriveState }));
                } else if (data.action === 'stop') {
                    stopPinballAutoDrive();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: true, running: false }));
                }
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Unknown action' }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // API: Start / Stop Xplosion AutoDrive
    if (url.pathname === '/api/xplosion-autodrive' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (data.action === 'start') {
                    let isSeatedXplosion = false;
                    try {
                        if (fs.existsSync(TELEMETRY_FILE)) {
                            const telRaw = fs.readFileSync(TELEMETRY_FILE, 'utf8');
                            if (telRaw.trim().length > 0) lastValidTelemetry = JSON.parse(telRaw);
                        }
                    } catch (e) {}
                    if (lastValidTelemetry && lastValidTelemetry.operator) {
                        isSeatedXplosion = !!lastValidTelemetry.operator.xplosionSeated;
                    }
                    if (!isSeatedXplosion) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({
                            success: false,
                            blocked: true,
                            reason: 'Du sitzt im Spiel nicht am Xplosion-Pult!'
                        }));
                    }
                    if (data.loop !== undefined) xplosionAutoDriveState.loop = !!data.loop;
                    if (data.pauseSec !== undefined) xplosionAutoDriveState.pauseSec = Math.max(5, parseInt(data.pauseSec) || 20);
                    if (data.autoFog !== undefined) xplosionAutoDriveState.autoFog = !!data.autoFog;
                    if (data.smartSensors !== undefined) xplosionAutoDriveState.smartSensors = !!data.smartSensors;
                    if (data.autoCollectTickets !== undefined) xplosionAutoDriveState.autoCollectTickets = !!data.autoCollectTickets;

                    runXplosionAutoRoutine();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: true, running: true }));
                } else if (data.action === 'stop') {
                    stopXplosionAutoDrive();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: true, running: false }));
                }
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Unknown action' }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // API: Start / Stop AutoDrive
    if (url.pathname === '/api/autodrive' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (data.action === 'start') {
                    let isSeatedMegaDance = false;
                    try {
                        if (fs.existsSync(TELEMETRY_FILE)) {
                            const telRaw = fs.readFileSync(TELEMETRY_FILE, 'utf8');
                            if (telRaw.trim().length > 0) lastValidTelemetry = JSON.parse(telRaw);
                        }
                    } catch (e) {}
                    if (lastValidTelemetry && lastValidTelemetry.operator) {
                        isSeatedMegaDance = !!lastValidTelemetry.operator.megadanceSeated;
                    }
                    if (!isSeatedMegaDance) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({
                            success: false,
                            blocked: true,
                            reason: 'Du sitzt im Spiel nicht am MegaDance-Pult!'
                        }));
                    }
                    const tour = parseInt(data.tour !== undefined ? data.tour : 0);
                    const night = !!data.night;
                    if (data.loop !== undefined) autoDriveState.loop = !!data.loop;
                    if (data.pauseSec !== undefined) autoDriveState.pauseSec = Math.max(5, parseInt(data.pauseSec) || 60);
                    if (data.durationMin !== undefined) autoDriveState.durationMin = Math.max(1, Math.min(6, parseInt(data.durationMin) || 4));
                    if (data.jinglePeepReact !== undefined) {
                        autoDriveState.jinglePeepReact = !!data.jinglePeepReact;
                        jingleConfig.enabled = autoDriveState.jinglePeepReact;
                        saveJingleConfig();
                    }
                    runAutoDriveRoutine(tour, night, autoDriveState.durationMin);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: true, running: true }));
                } else if (data.action === 'config') {
                    if (data.loop !== undefined) autoDriveState.loop = !!data.loop;
                    if (data.pauseSec !== undefined) autoDriveState.pauseSec = Math.max(5, parseInt(data.pauseSec) || 60);
                    if (data.night !== undefined) autoDriveState.night = !!data.night;
                    if (data.durationMin !== undefined) autoDriveState.durationMin = Math.max(1, Math.min(6, parseInt(data.durationMin) || 4));
                    if (data.jinglePeepReact !== undefined) {
                        autoDriveState.jinglePeepReact = !!data.jinglePeepReact;
                        jingleConfig.enabled = autoDriveState.jinglePeepReact;
                        saveJingleConfig();
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: true, autoDrive: autoDriveState }));
                } else if (data.action === 'stop') {
                    stopAutoDrive();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: true, running: false }));
                }
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Unknown action' }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // API: Send command
    if (url.pathname === '/api/command' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);

                // Option 2 Operator-Lock:
                // Check operator seating status per ride from telemetry
                let isSeatedMegaDance = false;
                let isSeatedBooster = false;
                let isSeatedXplosion = false;
                let isSeatedPinball = false;
                try {
                    if (fs.existsSync(TELEMETRY_FILE)) {
                        const telRaw = fs.readFileSync(TELEMETRY_FILE, 'utf8');
                        if (telRaw.trim().length > 0) {
                            lastValidTelemetry = JSON.parse(telRaw);
                        }
                    }
                } catch (e) {}
                let isSeatedAny = false;
                if (lastValidTelemetry && lastValidTelemetry.operator) {
                    isSeatedMegaDance = !!lastValidTelemetry.operator.megadanceSeated;
                    isSeatedBooster = !!lastValidTelemetry.operator.boosterSeated;
                    isSeatedXplosion = !!lastValidTelemetry.operator.xplosionSeated;
                    isSeatedPinball = !!lastValidTelemetry.operator.pinballSeated;
                    const isSeatedDJ = !!(lastValidTelemetry.operator.djSeated || lastValidTelemetry.operator.activeRide === 'dj');
                    isSeatedAny = !!lastValidTelemetry.operator.hasOperator || isSeatedMegaDance || isSeatedBooster || isSeatedXplosion || isSeatedPinball || isSeatedDJ;
                } else if (lastValidTelemetry && lastValidTelemetry.selfControlling) {
                    isSeatedAny = true;
                }

                // Allowed commands while unseated: Emergency stop, Host controls, and passive S2L config checkboxes
                const allowedAlways = [
                    'eStop', 'setXplosionEStop', 'setPinballEStop', 'setWorldTime', 'setWeatherId', 'setRealTimeMode',
                    'setPeepsEnabled', 'setMaxPeeps', 'ticketPriceUp', 'ticketPriceDown',
                    's2lSensitivity', 's2lPresetLow', 's2lPresetHigh', 's2lStrobo', 's2lFog', 's2lFlame',
                    's2lLED', 's2lLight1', 's2lLight2', 's2lLight3', 's2lLight4', 's2lLight5', 's2lLight6',
                    's2lLight7', 's2lLight8', 's2lLight9', 's2lColorStrobe', 's2lSpot', 's2lBubble',
                    's2lPeepsHands', 's2lPeepsClap',
                    's2lAllEffects', 's2lNightMode', 's2lLoop', 's2lKreuzMotorPauseEnabled', 's2lTowerLights', 's2lUpperLights', 's2lInLights', 's2lLedWall', 's2lTexAnim', 'setS2LLight',
                    'setLightProg', 'setTLProg', 'setMHLightProg', 'mhColorProg', 'mhProg', 'mhSpeed', 'setMHGobo', 'setMHGoboRot', 'setMHIntensity', 'setMHLightSync', 'setMHOn', 'setSpotsOn', 'setSpotColor',
                    'setLedColorProg', 'setChaserProg', 'setLedWallProg', 'setLedWallSpeed', 'setAllLightsOn'
                ];

                const megadanceCommands = [
                    'setPlatte', 'setKreuz', 'setMotorPlateOn', 'setMotorCrossOn',
                    'setGondelbremse', 'setCrossReverse', 'tipPK', 'harnessClose', 'harnessOpen',
                    'setPlatteTip', 'setKreuzTip'
                ];

                const boosterCommands = [
                    'setBoosterArmSpeed', 'setBoosterArmOn', 'setBoosterArmReverse',
                    'setBoosterPark', 'setBoosterG1Brake', 'setBoosterG2Brake',
                    'setBoosterPower', 'setBoosterAirPistole', 'boosterPodium'
                ];

                const xplosionCommands = [
                    'setXplosionPower', 'setXplosionGondola', 'setXplosionGondolaUp',
                    'setXplosionGondolaDown', 'setXplosionGondolaStop', 'setXplosionLaunch',
                    'xpDispatch', 'xpUpDown', 'xpSwitch', 'xpReset', 'xpEStop',
                    'setXplosionHarness', 'setXplosionReset'
                ];

                const pinballCommands = [
                    'setPinballKey', 'setPinballControl', 'setPinballPump', 'setPinballDispatch',
                    'setPinballHarness', 'setPinballPlateSpeed', 'setPinballDirection',
                    'setPinballMoveFwd', 'setPinballMoveBwd', 'setPinballGondolaBrake',
                    'setPinballAutoBrake', 'setPinballHub', 'setPinballReset', 'setPinballEStop'
                ];

                const allowedCommands = {};
                let hasBlockedCommands = false;
                let blockedReason = '';

                for (const key of Object.keys(data)) {
                    if (allowedAlways.includes(key)) {
                        allowedCommands[key] = data[key];
                    } else if (megadanceCommands.includes(key)) {
                        if (isSeatedMegaDance || isSeatedAny) {
                            allowedCommands[key] = data[key];
                        } else {
                            hasBlockedCommands = true;
                            blockedReason = 'MegaDance Pult ist im Spiel nicht besetzt!';
                        }
                    } else if (boosterCommands.includes(key)) {
                        if (isSeatedBooster || isSeatedAny) {
                            allowedCommands[key] = data[key];
                        } else {
                            hasBlockedCommands = true;
                            blockedReason = 'Booster Pult ist im Spiel nicht besetzt!';
                        }
                    } else if (xplosionCommands.includes(key)) {
                        if (isSeatedXplosion || isSeatedAny) {
                            allowedCommands[key] = data[key];
                        } else {
                            hasBlockedCommands = true;
                            blockedReason = 'Xplosion Pult ist im Spiel nicht besetzt!';
                        }
                    } else if (pinballCommands.includes(key)) {
                        if (isSeatedPinball || isSeatedAny) {
                            allowedCommands[key] = data[key];
                        } else {
                            hasBlockedCommands = true;
                            blockedReason = 'Flipper (Pinball) Pult ist im Spiel nicht besetzt!';
                        }
                    } else {
                        // General show/light/music/peep/S2L commands: ONLY allow if local player is seated at an operator desk!
                        if (isSeatedAny) {
                            allowedCommands[key] = data[key];
                        } else {
                            hasBlockedCommands = true;
                            blockedReason = 'Du sitzt im Spiel an keinem Fahrpult (Operator-Sperre aktiv)!';
                        }
                    }
                }

                if (Object.keys(allowedCommands).length > 0) {
                if (allowedCommands.tipPK !== undefined) pkTipUserActive = !!allowedCommands.tipPK;
                    writeCommand(allowedCommands);
                }

                if (hasBlockedCommands) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ 
                        success: false, 
                        blocked: true, 
                        reason: blockedReason || 'Operator-Pult ist im Spiel nicht besetzt!' 
                    }));
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, commands: data }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // Static files
    let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
    // Prevent path traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        return res.end('Forbidden');
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('404 Not Found');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
    });
});

// S2L / Command-Dateien beim Start initialisieren, damit sie sofort existieren
try {
    if (!fs.existsSync(CMD_FILE)) fs.writeFileSync(CMD_FILE, '{}', 'utf8');
    if (!fs.existsSync(CMD_TELEMETRY_FILE)) fs.writeFileSync(CMD_TELEMETRY_FILE, '{}', 'utf8');
} catch (e) { /* ignore */ }

server.listen(PORT, '0.0.0.0', () => {
    console.log('====================================================');
    console.log(`[+] Fairground Online - Control App Server laeuft!`);
    console.log(`[*] Am PC:                http://localhost:${PORT}`);

    // Print local network IPs
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`[*] Am Smartphone/Tablet: http://${net.address}:${PORT}`);
            }
        }
    }
    console.log('====================================================');
});
