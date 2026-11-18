
let clientRideStartTime = 0;
let clientRideRunning = false;
let clientRideLastElapsed = 0;
let clientRideStopGraceUntil = 0;

function updateHeaderHarnessDisplay() {
    const tel = currentState.telemetry || {};
    const md = currentState.megadance || {};

    if (activeRideMode === 'xplosion') {
        const hs = tel.xplosion || {};
        const isClosed = !!hs.harnessClosed;
        setText('safetyText', `BÜGEL: ${isClosed ? 'GESCHLOSSEN' : 'OFFEN'}`);
        setText('occDetailVal', '2 Sitze Bungee');
        setText('occPctVal', isClosed ? '100%' : '0%');
        const bar = document.getElementById('occBarFill');
        if (bar) bar.style.width = isClosed ? '100%' : '0%';
        const safetyPill = document.getElementById('harnessSafetyPill');
        if (safetyPill) safetyPill.className = 'safety-indicator ' + (isClosed ? 'safe' : 'danger');
    } else if (activeRideMode === 'pinball') {
        const pb = tel.pinball || {};
        const totalG = pb.totalGondolas || 12;
        const closedG = pb.closedGondolas !== undefined ? pb.closedGondolas : (pb.harnessClosed ? totalG : 0);
        const occG = pb.occupiedGondolas || 0;
        const occPct = totalG > 0 ? Math.round((occG / totalG) * 100) : 0;
        setText('safetyText', `BÜGEL: ${closedG} / ${totalG} GONDELN`);
        setText('occDetailVal', `${occG} / ${totalG} Gondeln besetzt`);
        setText('occPctVal', `${occPct}%`);
        const bar = document.getElementById('occBarFill');
        if (bar) bar.style.width = `${occPct}%`;
        const safetyPill = document.getElementById('harnessSafetyPill');
        if (safetyPill) {
            safetyPill.className = 'safety-indicator ' + (pb.harnessClosed ? 'safe' : 'danger');
        }
    } else if (activeRideMode === 'booster') {
        const b = tel.booster || {};
        const g1Closed = !!b.g1Closed;
        const g2Closed = !!b.g2Closed;
        const closedCount = (g1Closed ? 1 : 0) + (g2Closed ? 1 : 0);
        const allClosed = g1Closed && g2Closed;
        
        setText('safetyText', `BÜGEL: ${closedCount} / 2 GONDELN`);
        setText('occDetailVal', `16 Sitze (2x8)`);
        setText('occPctVal', allClosed ? '100%' : (closedCount === 1 ? '50%' : '0%'));
        const bar = document.getElementById('occBarFill');
        if (bar) bar.style.width = allClosed ? '100%' : (closedCount === 1 ? '50%' : '0%');

        const safetyPill = document.getElementById('harnessSafetyPill');
        if (safetyPill) {
            safetyPill.className = 'safety-indicator ' + (allClosed ? 'safe' : 'danger');
        }
    } else {
        // MegaDance / BreakDance
        if (tel.seats) {
            const s = tel.seats;
            const occPct = s.occupancyPercent !== undefined ? s.occupancyPercent : 0;
            setText('occPctVal', `${occPct}%`);
            const bar = document.getElementById('occBarFill');
            if (bar) bar.style.width = `${occPct}%`;
            
            setText('occDetailVal', `${s.passengers || 0} / ${s.capacity || 48} Sitze`);

            const closed = s.closedHarnesses !== undefined ? s.closedHarnesses : 0;
            const total = s.totalHarnesses || 24;
            setText('safetyText', `BÜGEL: ${closed} / ${total}`);

            const safetyPill = document.getElementById('harnessSafetyPill');
            if (safetyPill) {
                if (s.allClosed || closed === total) {
                    safetyPill.className = 'safety-indicator safe';
                } else if (s.allOpened || closed === 0) {
                    safetyPill.className = 'safety-indicator danger';
                } else {
                    safetyPill.className = 'safety-indicator';
                }
            }
        } else {
            // Fallback wenn noch keine Sitze-Telemetrie da ist
            const closed = (md.harnessClosed !== undefined) ? !!md.harnessClosed : false;
            setText('safetyText', closed ? 'BÜGEL: VERRIEGELT' : 'BÜGEL: GEÖFFNET');
            setText('occDetailVal', closed ? 'Passagiere bereit' : 'Freigabe Ausstieg');
            setText('occPctVal', closed ? '100%' : '0%');
            const bar = document.getElementById('occBarFill');
            if (bar) bar.style.width = closed ? '100%' : '0%';
            const safetyPill = document.getElementById('harnessSafetyPill');
            if (safetyPill) {
                safetyPill.className = 'safety-indicator ' + (closed ? 'safe' : 'danger');
            }
        }
    }
}

function handleRideStopwatch(tel, md) {
    const ad = currentState.autoDrive;
    const stateEl = document.getElementById('stopwatchState');

    // 1. Wenn AutoDrive aktiv läuft (oder im Pausen-Countdown ist), zeige den exakten AutoDrive-Timer:
    const pbad = currentState.pinballAutoDrive;
    if (activeRideMode === 'pinball' && pbad && pbad.running) {
        setText('stopwatchDisplay', pbad.timeFormatted || formatSeconds(pbad.remaining || 0));
        if (stateEl) {
            const isPause = pbad.phase && pbad.phase.includes('WECHSEL');
            stateEl.textContent = isPause ? 'PAUSE' : 'AUTODRIVE';
            stateEl.className = isPause ? 'timer-state' : 'timer-state running';
        }
        return;
    }
    if (ad && ad.running) {
        setText('stopwatchDisplay', ad.timeFormatted || formatSeconds(ad.remaining || 0));
        if (stateEl) {
            const isPause = ad.phase && ad.phase.startsWith('PAUSE');
            stateEl.textContent = isPause ? 'PAUSE' : 'AUTODRIVE';
            stateEl.className = isPause ? 'timer-state' : 'timer-state running';
        }
        return;
    }

    // 2. Prüfen ob Motoren oder Fahrt im Spiel aktiv laufen (MegaDance oder Booster)
    const plateMoving = (tel.plateSpeedPercent !== undefined && Math.abs(tel.plateSpeedPercent) > 0.02) ||
                        (md && Math.abs(md.plateSpeed || 0) > 0.02) ||
                        !!tel.motorPlateOn;
    const crossMoving = (tel.crossSpeedPercent !== undefined && Math.abs(tel.crossSpeedPercent) > 0.02) ||
                        (md && Math.abs(md.crossSpeed || 0) > 0.02) ||
                        !!tel.motorCrossOn;
    const boosterMoving = tel.booster && (Math.abs(tel.booster.armSpeedPercent || 0) > 0.02 || !!tel.booster.armOn);
    const pinballMoving = tel.pinball && (Math.abs(tel.pinball.plateSpeedPercent || 0) > 1.5 || !!tel.pinball.plateOn || !!tel.pinball.hubOn);

    const isRunningNow = (activeRideMode === 'booster') ? boosterMoving : (activeRideMode === 'pinball' ? pinballMoving : (plateMoving || crossMoving));

    if (isRunningNow) {
        clientRideStopGraceUntil = Date.now() + 2500; // 2.5s Nachlauf-Toleranz gegen kurzes Richtungswechsel-Stoppen
        if (!clientRideRunning) {
            clientRideRunning = true;
            clientRideStartTime = Date.now();
        }
        clientRideLastElapsed = Math.floor((Date.now() - clientRideStartTime) / 1000);
        setText('stopwatchDisplay', formatSeconds(clientRideLastElapsed));
        if (stateEl) {
            stateEl.textContent = 'RUNNING';
            stateEl.className = 'timer-state running';
        }
        return;
    }

    // Falls die Motoren nur für einen kurzen Moment (< 2.5s) z.B. beim Drehrichtungswechsel auf 0 sind, Timer weiterlaufen lassen:
    if (clientRideRunning && Date.now() < clientRideStopGraceUntil) {
        clientRideLastElapsed = Math.floor((Date.now() - clientRideStartTime) / 1000);
        setText('stopwatchDisplay', formatSeconds(clientRideLastElapsed));
        if (stateEl) {
            stateEl.textContent = 'RUNNING';
            stateEl.className = 'timer-state running';
        }
        return;
    }

    // 3. Fahrt steht still -> Letzte Fahrzeit stehen lassen (oder 00:00), Status auf STOP
    if (clientRideRunning) {
        clientRideRunning = false;
    }
    setText('stopwatchDisplay', formatSeconds(clientRideLastElapsed));
    if (stateEl) {
        stateEl.textContent = 'STOP';
        stateEl.className = 'timer-state';
    }
}

// Fairground Online Control Center - Frontend Application (Unified All-in-One Console)

const RIDE_NAMES = {
    0: "MegaDance",
    1: "Starlight",
    2: "Turaka",
    3: "X-Plosion",
    4: "Rotator",
    5: "Funhouse",
    255: "Standby"
};

let currentState = {};
let isDraggingSlider = {
    faderPlate: false,
    faderCross: false,
    sliderMHSpeed: false,
    sliderMHGoboRot: false,
    sliderMHIntensity: false
};

// Kopier- & Markiersperre für Tablets/Handys (Verhindert Textauswahl, Lupe und Kontextmenü beim Gedrückthalten)
document.addEventListener('contextmenu', e => {
    // Erlaube Kontextmenü auf normalen Inputs nicht, verhindert Popup beim Halten der Taster
    e.preventDefault();
});
document.addEventListener('selectstart', e => e.preventDefault());

// Safe helper to set text if element exists
function setText(id, text) {
    const el = document.getElementById(id);
    if (el && el.textContent !== String(text)) {
        el.textContent = text;
    }
}

// --- Command Sending ---
async function sendCmd(cmds) {
    // Wenn das Pult im Spiel unbesetzt ist, blockiere Klicks clientseitig sofort (außer Not-Aus & Host-Funktionen)
    const tel = currentState.telemetry || {};
    const hasOp = tel.operator ? !!tel.operator.hasOperator : true;
    const allowedWhenUnseated = [
        'eStop', 'setWorldTime', 'setWeatherId', 'setRealTimeMode', 'setPeepsEnabled', 'setMaxPeeps',
        'ticketPriceUp', 'ticketPriceDown', 'setS2LLight', 'setLightProg', 'setTLProg', 'setMHLightProg', 'setSpotsOn', 'setSpotColor',
        'setMHProg', 'setMHGobo', 'setMHSpeed', 'setMHGoboRot', 'setMHIntensity', 'setMHLightSync', 'setMHOn', 'setLedColorProg', 'setChaserProg',
        'setAllLightsOn', 'peepHandsToggle', 'peepHandsUp', 'peepClapToggle', 'peepClap', 'peepAgain',
        's2lSensitivity', 's2lPresetLow', 's2lPresetHigh', 's2lStrobo', 's2lFog', 's2lFlame',
        's2lLED', 's2lLight1', 's2lLight2', 's2lLight3', 's2lLight4', 's2lLight5', 's2lLight6',
        's2lLight7', 's2lLight8', 's2lLight9', 's2lColorStrobe', 's2lSpot', 's2lBubble',
        's2lPeepsHands', 's2lPeepsClap', 's2lAllEffects', 's2lNightMode', 's2lLoop', 's2lKreuzMotorPauseEnabled'
    ];

    if (!hasOp) {
        const isAllowed = Object.keys(cmds).some(k => allowedWhenUnseated.includes(k));
        if (!isAllowed) {
            console.warn("Befehl blockiert: Pult ist im Spiel unbesetzt!");
            return;
        }
    }

    try {
        await fetch('/api/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cmds)
        });
    } catch (err) {
        console.error("Failed to send command:", err);
    }
}

function toggleCmd(key) {
    let currentVal = false;
    const tel = currentState.telemetry || {};
    const md = currentState.megadance || {};
    const mh = currentState.movingHeads || {};
    const lights = currentState.lights || {};

    if (key === 'setAllLightsOn') currentVal = !!lights.on;
    else if (key === 'setS2LLight') currentVal = !!tel.s2lLightActive;
    else if (key === 'setStrobo') currentVal = !!lights.strobo;
    else if (key === 'setSpotsOn') currentVal = !!(tel.spots && tel.spots.on);
    else if (key === 'setFog') currentVal = (tel.fogOn !== undefined) ? !!tel.fogOn : !!(currentState.fog && currentState.fog.on);
    else if (key === 'setBubbles') currentVal = (tel.bubblesOn !== undefined) ? !!tel.bubblesOn : !!(currentState.bubbles && currentState.bubbles.on);
    else if (key === 'setMHOn') currentVal = (tel.mhOn !== undefined) ? !!tel.mhOn : !!mh.on;
    else if (key === 'setMHColorStrobo') currentVal = (tel.mhColorStrobo !== undefined) ? !!tel.mhColorStrobo : !!mh.colorStrobo;
    else if (key === 'setMHLightSync') currentVal = (tel.mhLightSync !== undefined) ? !!tel.mhLightSync : !!mh.lightSync;
    else if (key === 'setCrossReverse') currentVal = (tel.crossReversed !== undefined) ? !!tel.crossReversed : !!md.crossReversed;
    else if (key === 'setMotorPlateOn') currentVal = (tel.motorPlateOn !== undefined) ? !!tel.motorPlateOn : !!md.on;
    else if (key === 'setMotorCrossOn') currentVal = (tel.motorCrossOn !== undefined) ? !!tel.motorCrossOn : (md.crossSpeed !== 0);
    else if (key === 'setGondelbremse') currentVal = (tel.gondolaBrakeOn !== undefined) ? !!tel.gondolaBrakeOn : !!currentState.gondelbremse;
    else if (key === 'setPinballKey') currentVal = !!(tel.pinball && (tel.pinball.keySwitch > 0 || tel.pinball.booted));
    else if (key === 'setPinballControl') currentVal = !!(tel.pinball && tel.pinball.controlOn);
    else if (key === 'setPinballPump') currentVal = !!(tel.pinball && tel.pinball.pumpOn);
    else if (key === 'setPinballGondolaBrake') currentVal = !!(tel.pinball && tel.pinball.gondolaBrakeOn);
    else if (key === 'selfControl') currentVal = (tel.selfControlling !== undefined) ? !!tel.selfControlling : !!md.selfControl;
    else if (key === 'eStop') {
        if (activeRideMode === 'pinball' && tel.pinball) currentVal = !!tel.pinball.estop;
        else if (activeRideMode === 'xplosion' && tel.xplosion) currentVal = !!tel.xplosion.eStop;
        else currentVal = (tel.eStopOn !== undefined) ? !!tel.eStopOn : !!md.eStop;
    }
    else if (currentState[key] !== undefined) currentVal = currentState[key];

    const nextVal = !currentVal;
    if (key === 'setGondelbremse') currentState.gondelbremse = nextVal;

    if (key === 'eStop') {
        if (activeRideMode === 'pinball') {
            if (nextVal) {
                setText('valPinballPlate', '0%');
                const fp = document.getElementById('faderPinballPlate');
                if (fp) fp.value = 0;
                highlightSpeedButton('faderPinballPlate', 0);
                sendCmd({ setPinballEStop: true, setPinballPlateSpeed: 0, setPinballGondolaBrake: true, setPinballHub: 1 });
            } else {
                sendCmd({ setPinballEStop: false });
            }
            return;
        }
        if (activeRideMode === 'pinball') {
        const pb = tel.pinball || {};
        const isEStop = !!pb.estop;
        const isBooted = !!(pb.booted && pb.controlOn && pb.pumpOn);
        const isHarnessClosed = !!pb.harnessClosed;

        if (isEStop) {
            readyBox.className = 'all-ready-box not-ready';
            if (icon) icon.textContent = '🛑';
            if (statusTxt) statusTxt.textContent = 'NOT-AUS AKTIV!';
            if (subTxt) subTxt.textContent = 'Flipper gesperrt';
        } else if (!isBooted) {
            readyBox.className = 'all-ready-box not-ready';
            if (icon) icon.textContent = '⏳';
            if (statusTxt) statusTxt.textContent = 'SYSTEM / PUMPE AUS';
            if (subTxt) subTxt.textContent = 'Schlüssel, Steuerung & Pumpe einschalten';
        } else if (!isHarnessClosed) {
            readyBox.className = 'all-ready-box not-ready';
            if (icon) icon.textContent = '⚠️';
            if (statusTxt) statusTxt.textContent = 'BÜGEL OFFEN!';
            if (subTxt) subTxt.textContent = '12 Flipper-Gondeln verriegeln';
        } else {
            readyBox.className = 'all-ready-box ready';
            if (icon) icon.textContent = '✅';
            if (statusTxt) statusTxt.textContent = 'ALL READY / START FREI';
            if (subTxt) subTxt.textContent = pb.dispatch ? 'Fahrt läuft (Freigabe aktiv)' : 'Alle 12 Gondeln gesichert';
        }
        return;
    }

    if (activeRideMode === 'xplosion') {
            sendCmd({ setXplosionEStop: nextVal });
            return;
        }
        if (nextVal) {
            setText('valPlate', '0%');
            setText('valCross', '0%');
            if (faderPlate) faderPlate.value = 0;
            if (faderCross) faderCross.value = 0;
            highlightSpeedButton('faderPlate', 0);
            highlightSpeedButton('faderCross', 0);
            sendCmd({ eStop: true, setKreuz: 0, setPlatte: 0, setGondelbremse: true, setMotorPlateOn: false, setMotorCrossOn: false });
        } else {
            sendCmd({ eStop: false });
        }
        return;
    }

    sendCmd({ [key]: nextVal });
}

function stepLightProg(delta) {
    let curr = (currentState.lights && currentState.lights.program !== undefined) ? currentState.lights.program : 0;
    let next = Math.max(0, curr + delta);
    sendCmd({ setLightProg: next });
}

function stepMHProg(delta) {
    let curr = (currentState.movingHeads && currentState.movingHeads.program !== undefined) ? currentState.movingHeads.program : 0;
    let next = Math.max(0, Math.min(26, curr + delta));
    sendCmd({ setMHProg: next });
}

function stepMHColorProg(delta) {
    let curr = (currentState.movingHeads && currentState.movingHeads.colorProg !== undefined) ? currentState.movingHeads.colorProg : 0;
    let next = Math.max(0, Math.min(14, curr + delta));
    sendCmd({ setMHLightProg: next });
}

function stepMHGobo(delta) {
    let curr = (currentState.movingHeads && currentState.movingHeads.gobo !== undefined) ? currentState.movingHeads.gobo : 0;
    let next = Math.max(0, Math.min(10, curr + delta));
    sendCmd({ setMHGobo: next });
}

// Visual feedback on speed buttons matching current value
function highlightSpeedButton(faderId, pct) {
    const parent = document.getElementById(faderId)?.closest('.fader-strip');
    if (!parent) return;
    const buttons = parent.querySelectorAll('.btn-speed');
    buttons.forEach(btn => {
        const text = btn.textContent.trim().replace('%', '');
        const btnVal = parseInt(text, 10);
        if (btnVal === pct) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function setSlider(id, pct) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = pct;
    highlightSpeedButton(id, pct);

    if (id === 'faderPlate') {
        sendCmd({ setPlatte: pct / 100 });
        setText('valPlate', `${pct}%`);
    } else if (id === 'faderCross') {
        sendCmd({ setKreuz: pct / 100 });
        setText('valCross', `${pct}%`);
    } else if (id === 'faderBoosterArm') {
        sendCmd({ setBoosterArmSpeed: pct / 100 });
        setText('valBoosterArm', `${pct}%`);
    } else if (id === 'faderPinballPlate') {
        sendCmd({ setPinballPlateSpeed: pct / 100 });
        setText('valPinballPlate', `${pct}%`);
    }
}

// Ride Selector Switcher
let activeRideMode = 'megadance';
function switchActiveRide(mode) {
    activeRideMode = mode;
    document.getElementById('tabRideMD')?.classList.toggle('active', mode === 'megadance');
    document.getElementById('tabRideBooster')?.classList.toggle('active', mode === 'booster');
    document.getElementById('tabRideXplosion')?.classList.toggle('active', mode === 'xplosion');
    document.getElementById('tabRidePinball')?.classList.toggle('active', mode === 'pinball');
    document.getElementById('tabRideSoundExpress')?.classList.toggle('active', mode === 'soundexpress');

    const mdView = document.getElementById('driveViewMegaDance');
    const boosterView = document.getElementById('driveViewBooster');
    const xplosionView = document.getElementById('driveViewXplosion');
    const pinballView = document.getElementById('driveViewPinball');
    const seView = document.getElementById('driveViewSoundExpress');
    if (mdView) mdView.style.display = (mode === 'megadance') ? 'block' : 'none';
    if (boosterView) boosterView.style.display = (mode === 'booster') ? 'block' : 'none';
    if (xplosionView) xplosionView.style.display = (mode === 'xplosion') ? 'block' : 'none';
    if (pinballView) pinballView.style.display = (mode === 'pinball') ? 'block' : 'none';
    if (seView) seView.style.display = (mode === 'soundexpress') ? 'block' : 'none';

    const leftMd = document.getElementById('leftViewMegaDance');
    const leftBooster = document.getElementById('leftViewBooster');
    const leftXplosion = document.getElementById('leftViewXplosion');
    const leftPinball = document.getElementById('leftViewPinball');
    const leftSe = document.getElementById('leftViewSoundExpress');
    if (leftMd) leftMd.style.display = (mode === 'megadance') ? 'block' : 'none';
    if (leftBooster) leftBooster.style.display = (mode === 'booster') ? 'block' : 'none';
    if (leftXplosion) leftXplosion.style.display = (mode === 'xplosion') ? 'block' : 'none';
    if (leftPinball) leftPinball.style.display = (mode === 'pinball') ? 'block' : 'none';
    if (leftSe) leftSe.style.display = (mode === 'soundexpress') ? 'block' : 'none';

    const sub = document.getElementById('rideDeskSub');
    if (sub) {
        if (mode === 'megadance') sub.textContent = 'LEITSTAND / MEGADANCE';
        else if (mode === 'booster') sub.textContent = 'LEITSTAND / BOOSTER PROPELLER';
        else if (mode === 'xplosion') sub.textContent = 'LEITSTAND / XPLOSION SKYSHOT';
        else if (mode === 'pinball') sub.textContent = 'LEITSTAND / FLIPPER (PINBALL)';
        else if (mode === 'soundexpress') sub.textContent = 'LEITSTAND / SOUND EXPRESS';
    }

    const isXplosion = (mode === 'xplosion');
    const isSoundExpress = (mode === 'soundexpress');

    // Funktionen ausblenden, die das jeweilige Fahrgeschäft im Spiel gar nicht hat:
    const hideOnXplosionIds = [
        'btnFlame', 'btnBubbles', 'btnSpots', 'spotColorIndicator',
        'btnMHOn', 'btnMHLightSync', 's2lBtn_gondelpause',
        'lbl_s2lFlame', 'lbl_s2lBubble', 'lbl_s2lSpot', 's2lSingleLightsBox',
        'tabBtnMhGobo', 'mhSlidersBox'
    ];
    const hideOnSoundExpressIds = [
        'btnFlame', 'lbl_s2lFlame',
        'btnBubbles', 'lbl_s2lBubble',
        's2lBtn_gondelpause'
    ];
    hideOnXplosionIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const shouldHide = (isXplosion && hideOnXplosionIds.includes(id)) ||
                           (isSoundExpress && hideOnSoundExpressIds.includes(id));
        el.style.display = shouldHide ? 'none' : '';
    });

    // Tab-Beschriftung für Licht-Matrix an aktives Fahrgeschäft anpassen
    const tabProg = document.getElementById('tabBtnMhProg');
    const tabColor = document.getElementById('tabBtnMhColor');
    if (tabProg) tabProg.textContent = isXplosion ? '🌈 STANGEN-FARBE (30)' : '🎯 MUSTER';
    if (tabColor) tabColor.textContent = isXplosion ? '⚡ LAUFLICHT / CHASER (15)' : '🌈 FARBE';
    if (isXplosion && document.getElementById('tabBtnMhGobo')?.classList.contains('active')) {
        switchMhTab('prog');
    }

    // Matrix-Cache leeren, damit sofort die richtigen Programme gerendert werden
    lastMhProgNames = [];
    lastMhColorNames = [];
    lastMhGoboNames = [];
    if (currentState && currentState.telemetry) {
        updateMhMatrix(currentState.telemetry);
    }

    // Sofort Header-Sicherheitsanzeige & Bügel anpassen
    updateHeaderHarnessDisplay();
    updateMasterReadyStatus(currentState.telemetry || {}, currentState.megadance);
}

// --- Slider Input Handlers ---
const faderPlate = document.getElementById('faderPlate');
if (faderPlate) {
    faderPlate.addEventListener('mousedown', () => isDraggingSlider.faderPlate = true);
    faderPlate.addEventListener('touchstart', () => isDraggingSlider.faderPlate = true);
    faderPlate.addEventListener('mouseup', () => isDraggingSlider.faderPlate = false);
    faderPlate.addEventListener('touchend', () => isDraggingSlider.faderPlate = false);
    faderPlate.addEventListener('input', e => {
        const val = parseInt(e.target.value, 10);
        setText('valPlate', `${val}%`);
        highlightSpeedButton('faderPlate', val);
        sendCmd({ setPlatte: val / 100 });
    });
}

const faderCross = document.getElementById('faderCross');
if (faderCross) {
    faderCross.addEventListener('mousedown', () => isDraggingSlider.faderCross = true);
    faderCross.addEventListener('touchstart', () => isDraggingSlider.faderCross = true);
    faderCross.addEventListener('mouseup', () => isDraggingSlider.faderCross = false);
    faderCross.addEventListener('touchend', () => isDraggingSlider.faderCross = false);
    faderCross.addEventListener('input', e => {
        const val = parseInt(e.target.value, 10);
        setText('valCross', `${val}%`);
        highlightSpeedButton('faderCross', val);
        sendCmd({ setKreuz: val / 100 });
    });
}

const faderBoosterArm = document.getElementById('faderBoosterArm');
if (faderBoosterArm) {
    faderBoosterArm.addEventListener('mousedown', () => isDraggingSlider.faderBoosterArm = true);
    faderBoosterArm.addEventListener('touchstart', () => isDraggingSlider.faderBoosterArm = true);
    faderBoosterArm.addEventListener('mouseup', () => isDraggingSlider.faderBoosterArm = false);
    faderBoosterArm.addEventListener('touchend', () => isDraggingSlider.faderBoosterArm = false);
    faderBoosterArm.addEventListener('input', e => {
        const val = parseInt(e.target.value, 10);
        setText('valBoosterArm', `${val}%`);
        highlightSpeedButton('faderBoosterArm', val);
        sendCmd({ setBoosterArmSpeed: val / 100 });
    });
}

const faderPinballPlate = document.getElementById('faderPinballPlate');
if (faderPinballPlate) {
    faderPinballPlate.addEventListener('mousedown', () => isDraggingSlider.faderPinballPlate = true);
    faderPinballPlate.addEventListener('touchstart', () => isDraggingSlider.faderPinballPlate = true);
    faderPinballPlate.addEventListener('mouseup', () => isDraggingSlider.faderPinballPlate = false);
    faderPinballPlate.addEventListener('touchend', () => isDraggingSlider.faderPinballPlate = false);
    faderPinballPlate.addEventListener('input', e => {
        const val = parseInt(e.target.value, 10);
        setText('valPinballPlate', `${val}%`);
        highlightSpeedButton('faderPinballPlate', val);
        sendCmd({ setPinballPlateSpeed: val / 100 });
    });
}

// --- State Update Function (All-in-One Console) ---
function updateUI(data) {
    if (!data) return;
    currentState = data;
    
    // Connection Indicator
    const pill = document.getElementById('connStatus');
    if (pill) {
        if (data.gameConnected) {
            pill.className = 'plc-indicator online';
            pill.title = 'PLC / Spiel Online';
        } else {
            pill.className = 'plc-indicator offline';
            pill.title = 'Warte auf Spielverbindung...';
        }
    }

    // Telemetry Data (from telemetry.json)
    const tel = data.telemetry || {};

    // Operator & Staff Telemetry & Desk Lock (Per Ride & Global)
    if (tel.operator) {
        const mdSeated = !!tel.operator.megadanceSeated;
        const boosterSeated = !!tel.operator.boosterSeated;
        const xplosionSeated = !!tel.operator.xplosionSeated;
        const pinballSeated = !!tel.operator.pinballSeated;
        const soundExpressSeated = !!tel.operator.soundExpressSeated;
        const hasOp = mdSeated || boosterSeated || xplosionSeated || pinballSeated || soundExpressSeated;

        // Auto-Switch Tab zum aktuell im Spiel besetzten Fahrgeschäft
        if (tel.operator.activeRide === 'pinball' && activeRideMode !== 'pinball') {
            switchActiveRide('pinball');
        } else if (tel.operator.activeRide === 'xplosion' && activeRideMode !== 'xplosion') {
            switchActiveRide('xplosion');
        } else if (tel.operator.activeRide === 'booster' && activeRideMode !== 'booster') {
            switchActiveRide('booster');
        } else if (tel.operator.activeRide === 'megadance' && activeRideMode !== 'megadance') {
            switchActiveRide('megadance');
        } else if (tel.operator.activeRide === 'soundexpress' && activeRideMode !== 'soundexpress') {
            switchActiveRide('soundexpress');
        }

        const currentRideSeated = (activeRideMode === 'megadance') ? mdSeated : (activeRideMode === 'booster' ? boosterSeated : (activeRideMode === 'pinball' ? pinballSeated : (activeRideMode === 'soundexpress' ? soundExpressSeated : xplosionSeated)));

        let opStatusTitle = 'UNBESETZT';
        if (hasOp) {
            if (pinballSeated) opStatusTitle = 'OPERATOR (FLIPPER)';
            else if (xplosionSeated) opStatusTitle = 'OPERATOR (XPLOSION)';
            else if (boosterSeated) opStatusTitle = 'OPERATOR (BOOSTER)';
            else if (mdSeated) opStatusTitle = 'OPERATOR (MEGADANCE)';
            else if (soundExpressSeated) opStatusTitle = 'OPERATOR (SOUND EXPRESS)';
        }

        setText('operatorNameVal', tel.operator.name || (hasOp ? 'Bediener' : 'Unbesetzt'));
        const roleBadge = document.getElementById('operatorRoleBadge');
        if (roleBadge) {
            roleBadge.textContent = tel.operator.role || opStatusTitle;
            roleBadge.style.display = 'inline-block';
            roleBadge.className = 'op-role-badge' + (hasOp ? '' : ' unbesetzt');
        }

        const opBox = document.querySelector('.operator-box');
        if (opBox) {
            opBox.classList.toggle('locked', !hasOp);
        }

        // Hardware-Sperre: Ride-spezifisch und Global
        document.body.classList.toggle('desk-locked', !hasOp);
        document.body.classList.toggle('megadance-locked', !mdSeated);
        document.body.classList.toggle('booster-locked', !boosterSeated);
        document.body.classList.toggle('xplosion-locked', !xplosionSeated);
        document.body.classList.toggle('pinball-locked', !pinballSeated);
        document.body.classList.toggle('soundexpress-locked', !soundExpressSeated);
    }

    // In-Game Time & Weather
    if (tel.dayTimeFloat !== undefined) {
        // Wenn worldTime vom Spiel auf "00:00" eingefroren ist (weil In-Game Tablet zu ist), berechne echte HH:MM aus dayTimeFloat:
        if (!tel.worldTime || (tel.worldTime === '00:00' && tel.dayTimeFloat >= 0.02)) {
            const totalMin = Math.floor(tel.dayTimeFloat * 60);
            const hh = Math.floor(totalMin / 60) % 24;
            const mm = totalMin % 60;
            setText('worldTimeVal', `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
        } else {
            setText('worldTimeVal', tel.worldTime);
        }

        const slider = document.getElementById('envTimeSlider');
        const modal = document.getElementById('envModalOverlay');
        const isModalOpen = modal && modal.classList.contains('open');
        if (slider && !isModalOpen) {
            slider.value = tel.dayTimeFloat;
            setText('envModalTimeDisplay', formatTimeFloat(tel.dayTimeFloat));
        }
    } else if (tel.worldTime) {
        setText('worldTimeVal', tel.worldTime);
    }

    if (tel.worldDate) {
        if (tel.worldDate.includes('ddd') || tel.worldDate.includes('yyyy')) {
            const now = new Date();
            const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
            const fallbackDate = `${days[now.getDay()]}, ${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
            setText('worldDateVal', fallbackDate);
        } else {
            setText('worldDateVal', tel.worldDate);
        }
    }
    if (tel.realTimeMode !== undefined) {
        const check = document.getElementById('envRealTimeCheck');
        if (check) check.checked = tel.realTimeMode;
    }
    if (tel.weatherId !== undefined) {
        const WEATHER_MAP = {
            0: "☀️ SONNIG",
            1: "⛅ HEITER",
            2: "☁️ BEWÖLKT",
            3: "🌧️ REGEN",
            4: "⛈️ GEWITTER",
            5: "🌫️ NEBEL"
        };
        const wStr = WEATHER_MAP[tel.weatherId] || `WETTER #${tel.weatherId}`;
        setText('worldWeatherVal', wStr);
        setText('envModalWeatherActive', wStr);
        for (let i = 0; i <= 5; i++) {
            const btn = document.getElementById(`btnWeather${i}`);
            if (btn) btn.classList.toggle('active', i === tel.weatherId);
        }
    }

    // Visitors, Queue & Chips
    if (tel.parkGuests !== undefined) {
        setText('parkGuestsVal', tel.parkGuests);
    }
    if (tel.peepsEnabled !== undefined) {
        const check = document.getElementById('envPeepsEnabledCheck');
        if (check) check.checked = tel.peepsEnabled;
    }
    if (tel.maxPeeps !== undefined) {
        const slider = document.getElementById('envMaxPeepsSlider');
        const modal = document.getElementById('envModalOverlay');
        const isModalOpen = modal && modal.classList.contains('open');
        if (slider && !isModalOpen) {
            slider.value = tel.maxPeeps;
            setText('envMaxPeepsDisplay', tel.maxPeeps);
        }
    }
    if (tel.ticketPriceText) {
        setText('envTicketPriceVal', tel.ticketPriceText);
    }
    if (tel.cashierQueue !== undefined) {
        setText('cashierQueueVal', tel.cashierQueue);
    }
    if (tel.collectedTokens !== undefined) {
        setText('tokensVal', tel.collectedTokens);
    }
    if (tel.clickableTokens !== undefined) {
        setText('clickableTokensVal', tel.clickableTokens);
    }

    // Seat Occupancy & Harness Safety (Dynamic per active ride)
    updateHeaderHarnessDisplay();
    updateMasterReadyStatus(tel, data.megadance);

    // Fahrzeit / Ride Stopwatch Timer (Dynamic & Realtime)
    handleRideStopwatch(tel, data.megadance);

    // Music System
    if (tel.music) {
        const m = tel.music;
        const fullTitle = m.title ? `${m.title}${m.artist ? ' — ' + m.artist : ''}` : 'Keine Musik aktiv';
        setText('musicTitle', m.title || 'Keine Musik aktiv');
        setText('headerMusicTitle', fullTitle);
        setText('musicArtist', m.artist ? `— ${m.artist}` : '');
        setText('musicTime', `${formatSeconds(m.trackTime)} / ${m.length || '00:00'}`);
    }

    // MegaDance Speeds & Controls
    if (data.megadance) {
        const md = data.megadance;
        if (!isDraggingSlider.faderPlate && md.plateSpeed !== undefined) {
            const pct = Math.round(Math.abs(md.plateSpeed) * 100);
            if (faderPlate) faderPlate.value = pct;
            setText('valPlate', `${pct}%`);
            highlightSpeedButton('faderPlate', pct);
        }
        if (!isDraggingSlider.faderCross && md.crossSpeed !== undefined) {
            const pct = Math.round(Math.abs(md.crossSpeed) * 100);
            if (faderCross) faderCross.value = pct;
            setText('valCross', `${pct}%`);
            highlightSpeedButton('faderCross', pct);
        }

        const plateActive = (tel.motorPlateOn !== undefined) ? !!tel.motorPlateOn : !!md.on;
        const crossActive = (tel.motorCrossOn !== undefined) ? !!tel.motorCrossOn : (md.crossSpeed !== 0);
        const crossRevActive = (tel.crossReversed !== undefined) ? !!tel.crossReversed : !!md.crossReversed;
        const gondolaBrakeActive = (tel.gondolaBrakeOn !== undefined) ? !!tel.gondolaBrakeOn : !!currentState.gondelbremse;
        const isEStop = (tel.eStopOn !== undefined) ? !!tel.eStopOn : !!md.eStop;
        const selfCtrlActive = (tel.selfControlling !== undefined) ? !!tel.selfControlling : !!md.selfControl;

        document.getElementById('btnCrossReverse')?.classList.toggle('active', crossRevActive);
        document.getElementById('btnGondelbremse')?.classList.toggle('active', gondolaBrakeActive);
        document.getElementById('btnMotorPlate')?.classList.toggle('active', plateActive);
        document.getElementById('btnMotorCross')?.classList.toggle('active', crossActive);
        document.getElementById('btnEStop')?.classList.toggle('active', isEStop);

        // Gondola Swing & Safety Telemetry (Swing Controller)
        document.getElementById('statInSwinging')?.classList.toggle('active', !!tel.inSwinging);
        document.getElementById('statAllStand')?.classList.toggle('active', !!tel.allStand);
        document.getElementById('statAllOnZero')?.classList.toggle('active', !!tel.allOnZero);


    // Xplosion AutoDrive Live-Status Rendering
    if (data.xplosionAutoDrive) {
        const xad = data.xplosionAutoDrive;
        const isRunning = !!xad.running;
        const btn = document.getElementById('btnXplosionAutoDriveToggle');
        const led = document.getElementById('adXplosionLed');
        const lbl = document.getElementById('adXplosionBtnLabel');
        const phaseTxt = document.getElementById('adXplosionPhaseText');
        const timerTxt = document.getElementById('adXplosionTimer');

        if (btn) {
            btn.classList.toggle('active', isRunning);
            if (isRunning) {
                btn.style.background = '#dc2626';
                btn.style.borderColor = '#ef4444';
            } else {
                btn.style.background = '#0284c7';
                btn.style.borderColor = '#38bdf8';
            }
        }
        if (led) led.classList.toggle('on', isRunning);
        if (lbl) lbl.textContent = isRunning ? '⏹️ STOPPEN' : '▶️ AUTO START';
        if (phaseTxt) {
            phaseTxt.textContent = xad.phase || 'BEREIT';
            if (isRunning) {
                phaseTxt.style.color = (xad.phase && xad.phase.includes('LAUNCH')) ? '#ef4444' : '#38bdf8';
            } else {
                phaseTxt.style.color = '#94a3b8';
            }
        }
        if (timerTxt) timerTxt.textContent = xad.timeFormatted || '0:00';
    }

    // AutoDrive Live-Status Rendering
    if (data.autoDrive) {
        const ad = data.autoDrive;
        const btn = document.getElementById('btnAutoDriveToggle');
        const led = document.getElementById('adLed');
        const lbl = document.getElementById('adBtnLabel');
        const phaseTxt = document.getElementById('adPhaseText');
        const badge = document.getElementById('adTimerBadge');

        if (phaseTxt) {
            phaseTxt.textContent = ad.phase || 'BEREIT';
            phaseTxt.style.color = ad.running ? '#22c55e' : '#38bdf8';
        }
        if (badge) {
            badge.textContent = ad.timeFormatted || '0:00';
            badge.style.color = ad.running ? '#f59e0b' : '#fff';
        }
        if (btn) {
            btn.classList.toggle('active', !!ad.running);
            if (ad.running) {
                btn.style.borderColor = '#ef4444';
                if (lbl) lbl.textContent = 'ABBRECHEN';
                if (led) { led.style.background = '#ef4444'; led.style.boxShadow = '0 0 8px #ef4444'; }
            } else {
                btn.style.borderColor = '';
                if (lbl) lbl.textContent = 'STARTEN';
                if (led) { led.style.background = ''; led.style.boxShadow = ''; }
            }
        }
        const jingleChk = document.getElementById('adJingleReactCheck');
        if (jingleChk && ad.jinglePeepReact !== undefined && (!jingleChk._lastUserToggle || Date.now() - jingleChk._lastUserToggle > 1500)) {
            jingleChk.checked = !!ad.jinglePeepReact;
        }
        const durationSel = document.getElementById('adDurationSelect');
        if (durationSel && ad.durationMin !== undefined && (!durationSel._lastUserToggle || Date.now() - durationSel._lastUserToggle > 1500)) {
            durationSel.value = String(ad.durationMin);
        }
    }

        // Physical Rotation Speed Display (°/s)
        if (tel.plateSpeedPercent !== undefined && tel.plateMaxSpeed !== undefined) {
            const deg = (Math.abs(tel.plateSpeedPercent) * tel.plateMaxSpeed).toFixed(1);
            setText('plateSpeedDeg', `${deg}°/s (MAX ${tel.plateMaxSpeed.toFixed(0)}°/s)`);
        } else if (md.plateSpeed !== undefined) {
            setText('plateSpeedDeg', `${(Math.abs(md.plateSpeed) * 14).toFixed(1)}°/s`);
        }

        if (tel.crossSpeedPercent !== undefined && tel.crossMaxSpeed !== undefined) {
            const deg = (Math.abs(tel.crossSpeedPercent) * tel.crossMaxSpeed).toFixed(1);
            setText('crossSpeedDeg', `${deg}°/s (MAX ${tel.crossMaxSpeed.toFixed(0)}°/s)`);
        } else if (md.crossSpeed !== undefined) {
            setText('crossSpeedDeg', `${(Math.abs(md.crossSpeed) * 28).toFixed(1)}°/s`);
        }

        // Master ALL-READY Safety Check
        updateMasterReadyStatus(tel, data.megadance);

        // 24 Gondeln Belegungs- & Sicherheitsplan
        if (tel.seats && tel.seats.gondolas) {
            renderGondolaMatrix(tel.seats.gondolas);
        }

        const badge = document.getElementById('mdStatusBadge');
        if (badge) {
            const mdSeated = tel.operator ? !!tel.operator.megadanceSeated : false;
            const boosterSeated = tel.operator ? !!tel.operator.boosterSeated : false;
            const xplosionSeated = tel.operator ? !!tel.operator.xplosionSeated : false;
            const pinballSeated = tel.operator ? !!tel.operator.pinballSeated : false;
            const soundExpressSeated = tel.operator ? !!tel.operator.soundExpressSeated : false;
            const currentRideSeated = (activeRideMode === 'megadance') ? mdSeated : (activeRideMode === 'booster' ? boosterSeated : (activeRideMode === 'pinball' ? pinballSeated : (activeRideMode === 'soundexpress' ? soundExpressSeated : xplosionSeated)));

            if (!currentRideSeated) {
                badge.textContent = `${activeRideMode.toUpperCase()} UNBESETZT`;
                badge.className = 'mode-badge locked';
            } else if (isEStop || (activeRideMode === 'pinball' && tel.pinball && tel.pinball.estop) || (activeRideMode === 'soundexpress' && tel.soundExpress && tel.soundExpress.eStop)) {
                badge.textContent = 'NOT-AUS AKTIV';
                badge.className = 'mode-badge estop-active';
            } else if (md.booted || (tel.operator && (tel.operator.megadanceSeated || tel.operator.pinballSeated || tel.operator.soundExpressSeated)) || !!tel.selfControlling) {
                badge.textContent = 'BETRIEBSBEREIT';
                badge.className = 'mode-badge ready';
            } else {
                badge.textContent = 'STANDBY';
                badge.className = 'mode-badge';
            }
        }
    }

    // Booster Telemetry & Live Controls
    if (tel.booster) {
        const b = tel.booster;
        if (!isDraggingSlider.faderBoosterArm && b.armSpeedPercent !== undefined) {
            const pct = Math.round(Math.abs(b.armSpeedPercent) * 100);
            const armSlider = document.getElementById('faderBoosterArm');
            if (armSlider) armSlider.value = pct;
            setText('valBoosterArm', `${pct}%`);
            highlightSpeedButton('faderBoosterArm', pct);
        }

        document.getElementById('btnBoosterArmMotor')?.classList.toggle('active', !!b.armOn);
        document.getElementById('btnBoosterArmRev')?.classList.toggle('active', !!b.armReversed);
        document.getElementById('btnBoosterPark1')?.classList.toggle('active', b.currentParkedGondola === 1);
        document.getElementById('btnBoosterPark2')?.classList.toggle('active', b.currentParkedGondola === 2);
        document.getElementById('btnBoosterG1Brake')?.classList.toggle('active', !!b.g1BrakeOn);
        document.getElementById('btnBoosterG2Brake')?.classList.toggle('active', !!b.g2BrakeOn);
        document.getElementById('btnBoosterPower')?.classList.toggle('active', !!b.booted);

        setText('statBoosterG1', b.g1Closed ? 'BÜGEL ZU' : 'BÜGEL OFFEN');
        setText('statBoosterG2', b.g2Closed ? 'BÜGEL ZU' : 'BÜGEL OFFEN');
        setText('bStatG1Txt', b.g1Closed ? 'VERRIEGELT (SICHER)' : 'OFFEN');
        setText('bStatG2Txt', b.g2Closed ? 'VERRIEGELT (SICHER)' : 'OFFEN');

        // Booster Gondel 1 & 2 Box Visuals
        const boxG1 = document.getElementById('bBoxG1');
        const boxG2 = document.getElementById('bBoxG2');
        if (boxG1) boxG1.className = 'booster-gondola-box ' + (b.g1Closed ? 'safe' : 'warn');
        if (boxG2) boxG2.className = 'booster-gondola-box ' + (b.g2Closed ? 'safe' : 'warn');
        setText('bBadgeG1', b.g1Closed ? 'VERRIEGELT' : 'OFFEN');
        setText('bBadgeG2', b.g2Closed ? 'VERRIEGELT' : 'OFFEN');

        // Header Safety Badge Anpassung bei Xplosion & Booster
        if (activeRideMode === 'xplosion') {
            const hs = tel.xplosion || {};
            const isClosed = !!hs.harnessClosed;
            setText('safetyText', `BÜGEL: ${isClosed ? 'GESCHLOSSEN' : 'OFFEN'}`);
            setText('occDetailVal', '2 Sitze Bungee');
            setText('occPctVal', isClosed ? '100%' : '0%');
            const bar = document.getElementById('occBarFill');
            if (bar) bar.style.width = isClosed ? '100%' : '0%';
            const safetyPill = document.getElementById('harnessSafetyPill');
            if (safetyPill) safetyPill.className = 'safety-indicator ' + (isClosed ? 'safe' : 'danger');
        } else if (activeRideMode === 'pinball') {
        const pb = tel.pinball || {};
        const totalG = pb.totalGondolas || 12;
        const closedG = pb.closedGondolas !== undefined ? pb.closedGondolas : (pb.harnessClosed ? totalG : 0);
        const occG = pb.occupiedGondolas || 0;
        const occPct = totalG > 0 ? Math.round((occG / totalG) * 100) : 0;
        setText('safetyText', `BÜGEL: ${closedG} / ${totalG} GONDELN`);
        setText('occDetailVal', `${occG} / ${totalG} Gondeln besetzt`);
        setText('occPctVal', `${occPct}%`);
        const bar = document.getElementById('occBarFill');
        if (bar) bar.style.width = `${occPct}%`;
        const safetyPill = document.getElementById('harnessSafetyPill');
        if (safetyPill) {
            safetyPill.className = 'safety-indicator ' + (pb.harnessClosed ? 'safe' : 'danger');
        }
    } else if (activeRideMode === 'booster') {
            const allBoosterClosed = !!b.g1Closed && !!b.g2Closed;
            const closedCount = (b.g1Closed ? 1 : 0) + (b.g2Closed ? 1 : 0);
            setText('safetyText', `BÜGEL: ${closedCount} / 2 GONDELN`);
            setText('occDetailVal', `16 Sitze (2x8)`);
            const safetyPill = document.getElementById('harnessSafetyPill');
            if (safetyPill) {
                safetyPill.className = 'safety-indicator ' + (allBoosterClosed ? 'safe' : 'danger');
            }
        } else if (activeRideMode === 'soundexpress') {
            const se = tel.soundExpress || {};
            const totalS = se.totalSeats || 20;
            const closedS = se.closedSeats || 0;
            const occS = se.occupiedSeats || 0;
            const occPct = totalS > 0 ? Math.round((occS / totalS) * 100) : 0;
            setText('safetyText', `BÜGEL: ${closedS} / ${totalS} BÜGEL`);
            setText('occDetailVal', `${occS} / ${totalS} Plätze besetzt`);
            setText('occPctVal', `${occPct}%`);
            const bar = document.getElementById('occBarFill');
            if (bar) bar.style.width = `${occPct}%`;
            const safetyPill = document.getElementById('harnessSafetyPill');
            if (safetyPill) {
                safetyPill.className = 'safety-indicator ' + (se.harnessClosed ? 'safe' : 'danger');
            }
        }

        const windBox = document.getElementById('boosterWindAlarmBox');
        if (windBox) {
            windBox.classList.toggle('alarm', !!b.windAlarm);
            setText('boosterWindText', b.windAlarm ? '⚠️ WIND-ALARM! ANLAGE SICHERN' : 'WIND-STATUS: NORMAL (KEIN ALARM)');
        }
    }

    // Xplosion Telemetry & Live Controls
    if (tel.xplosion) {
        const hs = tel.xplosion;
        document.getElementById('btnXplosionPower')?.classList.toggle('active', !!hs.powerSwitch);
        
        // Seilspannung (Unity c_Rope_Tension: 1.0 = entspannt 0%, 0.0 = maximal gespannt 100%)
        const curTension = (hs.ropeTension !== undefined) ? hs.ropeTension : 1.0;
        const minTension = (hs.maxRopeTension !== undefined && hs.maxRopeTension >= 0) ? hs.maxRopeTension : 0.0;
        const denom = Math.max(0.01, 1.0 - minTension);
        const tensionPct = Math.min(100, Math.max(0, Math.round(((1.0 - curTension) / denom) * 100)));
        setText('xplosionTensionVal', `${tensionPct}%`);
        const tensionBar = document.getElementById('xplosionTensionBar');
        if (tensionBar) tensionBar.style.width = `${tensionPct}%`;

        // Sitze / Bügel Visualisierung (2 Sitze) mit Gast- und Bügel-Erkennung
        const isHarnessSafe = !!hs.harnessClosed;
        const seat1Occ = !!hs.seat1Occupied;
        const seat2Occ = !!hs.seat2Occupied;
        const sBox1 = document.getElementById('hsSeatBox1');
        const sBox2 = document.getElementById('hsSeatBox2');
        const sStat1 = document.getElementById('hsSeatStat1');
        const sStat2 = document.getElementById('hsSeatStat2');
        if (sBox1 && sStat1) {
            sBox1.classList.toggle('occupied', seat1Occ || isHarnessSafe);
            if (seat1Occ && isHarnessSafe) {
                sStat1.textContent = 'GAST & ZU ✓';
                sStat1.className = 'xplosion-seat-status safe';
            } else if (seat1Occ) {
                sStat1.textContent = 'GAST SITZT';
                sStat1.className = 'xplosion-seat-status warn';
            } else if (isHarnessSafe) {
                sStat1.textContent = 'BÜGEL ZU';
                sStat1.className = 'xplosion-seat-status safe';
            } else {
                sStat1.textContent = 'LEER / OFFEN';
                sStat1.className = 'xplosion-seat-status';
            }
        }
        if (sBox2 && sStat2) {
            sBox2.classList.toggle('occupied', seat2Occ || isHarnessSafe);
            if (seat2Occ && isHarnessSafe) {
                sStat2.textContent = 'GAST & ZU ✓';
                sStat2.className = 'xplosion-seat-status safe';
            } else if (seat2Occ) {
                sStat2.textContent = 'GAST SITZT';
                sStat2.className = 'xplosion-seat-status warn';
            } else if (isHarnessSafe) {
                sStat2.textContent = 'BÜGEL ZU';
                sStat2.className = 'xplosion-seat-status safe';
            } else {
                sStat2.textContent = 'LEER / OFFEN';
                sStat2.className = 'xplosion-seat-status';
            }
        }

        // Active state on Hebewerk buttons
        const swState = hs.gondolaSwitchState !== undefined ? hs.gondolaSwitchState : 1;
        document.getElementById('btnXplosionGondolaDown')?.classList.toggle('active-state', swState === 0);
        document.getElementById('btnXplosionGondolaStop')?.classList.toggle('active-state', swState === 1);
        document.getElementById('btnXplosionGondolaUp')?.classList.toggle('active-state', swState === 2);

        // Gondelposition
        let posText = 'UNTEN (EINSTIEG)';
        let posColor = '#10b981';
        if (hs.gondolaSwitchState === 2) {
            posText = 'OBEN (GESPANNT / HALT)';
            posColor = '#f59e0b';
        } else if (hs.gondolaSwitchState === 1) {
            posText = 'HALT / STOP';
            posColor = '#38bdf8';
        }
        const gPosVal = document.getElementById('xplosionGondolaPosVal');
        if (gPosVal) {
            gPosVal.textContent = posText;
            gPosVal.style.color = posColor;
        }

        // Ready Badge
        const rBadge = document.getElementById('badgeXplosionReady');
        if (rBadge) {
            if (hs.eStop) {
                rBadge.textContent = 'NOT-AUS';
                rBadge.className = 'bg-badge danger';
            } else if (hs.dispatchable || hs.ropeAtMaxTension) {
                rBadge.textContent = 'START FREI';
                rBadge.className = 'bg-badge safe';
            } else if (hs.booted) {
                rBadge.textContent = 'BETRIEBSBEREIT';
                rBadge.className = 'bg-badge ready';
            } else {
                rBadge.textContent = 'STANDBY';
                rBadge.className = 'bg-badge';
            }
        }
    }

    // Pinball (Flipper) Telemetry & Live Controls
    if (tel.pinball) {
        const pb = tel.pinball;
        if (!isDraggingSlider.faderPinballPlate && pb.platePoti !== undefined) {
            const pct = Math.round(Math.abs(pb.platePoti) * 100);
            const pbSlider = document.getElementById('faderPinballPlate');
            if (pbSlider) pbSlider.value = pct;
            setText('valPinballPlate', `${pct}%`);
            highlightSpeedButton('faderPinballPlate', pct);
        }
        const realSpdPct = Math.round(Math.abs(pb.plateSpeedPercent || 0));
        setText('pinballSpeedVal', `${realSpdPct}%`);

        document.getElementById('btnPinballKey')?.classList.toggle('active', !!(pb.keySwitch > 0 || pb.booted));
        document.getElementById('btnPinballControl')?.classList.toggle('active', !!pb.controlOn);
        document.getElementById('btnPinballPump')?.classList.toggle('active', !!pb.pumpOn);
        document.getElementById('btnPinballBrake')?.classList.toggle('active', !!pb.gondolaBrakeOn);
        document.getElementById('btnPinballAutoBrake')?.classList.toggle('active', !!pb.breakAutomatic);
        document.getElementById('btnPinballDispatch')?.classList.toggle('active', !!pb.dispatch);

        const dispLed = document.getElementById('ledPinballDispatch');
        if (dispLed) {
            if (pb.dispatch) {
                dispLed.style.background = '#22c55e';
                dispLed.style.boxShadow = '0 0 8px #22c55e';
            } else if (pb.dispatchPossible) {
                dispLed.style.background = '#f59e0b';
                dispLed.style.boxShadow = '0 0 8px #f59e0b';
            } else {
                dispLed.style.background = '';
                dispLed.style.boxShadow = '';
            }
        }

        // Drehrichtung (0=FWD, 1=STOP, 2=BWD)
        const dir = pb.direction !== undefined ? pb.direction : 1;
        document.getElementById('btnPinballDirFwd')?.classList.toggle('active', dir === 0);
        document.getElementById('btnPinballDirStop')?.classList.toggle('active', dir === 1);
        document.getElementById('btnPinballDirBwd')?.classList.toggle('active', dir === 2);

        // Hubarm (0=Up, 1=Stop, 2=Down)
        const hubPct = Math.min(100, Math.max(0, Math.round(pb.hubPercent || 0)));
        setText('pinballHubPctVal', `${hubPct}%`);
        const hubBar = document.getElementById('pinballHubBar');
        if (hubBar) hubBar.style.width = `${hubPct}%`;

        const hMode = pb.hubMode !== undefined ? pb.hubMode : 1;
        document.getElementById('btnPinballHubUp')?.classList.toggle('active', hMode === 0 && !!pb.hubOn);
        document.getElementById('btnPinballHubStop')?.classList.toggle('active', !pb.hubOn || hMode === 1);
        document.getElementById('btnPinballHubDown')?.classList.toggle('active', hMode === 2 && !!pb.hubOn);

        // SPS Diagnose LEDs
        document.getElementById('statPbPotiZero')?.classList.toggle('active', pb.dispPotiOnNull !== undefined ? !!pb.dispPotiOnNull : ((pb.platePoti || 0) < 0.02));
        document.getElementById('statPbPump')?.classList.toggle('active', pb.dispPumpOn !== undefined ? !!pb.dispPumpOn : !!pb.pumpOn);
        document.getElementById('statPbHarness')?.classList.toggle('active', pb.dispHarnessState !== undefined ? !!pb.dispHarnessState : !!pb.harnessClosed);
        document.getElementById('statPbRpmUnder')?.classList.toggle('active', pb.dispRpmOn !== undefined ? !!pb.dispRpmOn : !!pb.onSpeedUnder);
        document.getElementById('statPbBrakeOpen')?.classList.toggle('active', pb.dispBrakeOpen !== undefined ? !!pb.dispBrakeOpen : !pb.gondolaBrakeOn);
        document.getElementById('statPbOnZero')?.classList.toggle('active', !!pb.gondolasOnZero);

        // Status Info Text
        const infoBox = document.getElementById('pinballStatusInfoBox');
        if (infoBox) {
            infoBox.classList.toggle('alarm', !!pb.estop);
            let statusStr = 'BEREIT FÜR EINSTIEG';
            if (pb.estop) statusStr = '🛑 NOT-AUS AKTIV!';
            else if (!pb.booted) statusStr = '🔑 SCHLÜSSELSCHALTER AUS';
            else if (!pb.controlOn) statusStr = '⚡ STEUERUNG EINSCHALTEN';
            else if (!pb.pumpOn) statusStr = '🛢️ HYDRAULIKPUMPE EINSCHALTEN';
            else if (!pb.harnessClosed) statusStr = '🔓 BÜGEL OFFEN (EINSTIEG / AUSSTIEG)';
            else if (pb.dispatchPossible && !pb.dispatch) statusStr = '🟢 STARTBEREIT – FREIGABE DRÜCKEN!';
            else if (pb.dispatch || pb.plateOn) statusStr = `🎡 FAHRT AKTIV (TEMPO ${realSpdPct}% | HUB ${hubPct}%)`;
            setText('pinballStatusInfoText', statusStr);
        }

        // 12 Gondeln Sicherheitsplan rendern
        if (pb.gondolas && Array.isArray(pb.gondolas)) {
            renderPinballGondolaMatrix(pb.gondolas);
        }
    }

    // Pinball AutoDrive Live-Status Rendering
    if (data.pinballAutoDrive) {
        const pbad = data.pinballAutoDrive;
        const btn = document.getElementById('btnPinballAutoDriveToggle');
        const led = document.getElementById('adPinballLed');
        const lbl = document.getElementById('adPinballBtnLabel');
        const phaseTxt = document.getElementById('adPinballPhaseText');
        const badge = document.getElementById('adPinballTimerBadge');

        if (phaseTxt) {
            phaseTxt.textContent = pbad.phase || 'BEREIT';
            phaseTxt.style.color = pbad.running ? '#22c55e' : '#c084fc';
        }
        if (badge) {
            badge.textContent = pbad.timeFormatted || '0:00';
            badge.style.color = pbad.running ? '#c084fc' : '#fff';
        }
        if (btn) {
            btn.classList.toggle('active', !!pbad.running);
            if (pbad.running) {
                btn.style.borderColor = '#ef4444';
                if (lbl) lbl.textContent = 'ABBRECHEN';
                if (led) { led.style.background = '#ef4444'; led.style.boxShadow = '0 0 8px #ef4444'; }
            } else {
                btn.style.borderColor = '#a855f7';
                if (lbl) lbl.textContent = 'STARTEN';
                if (led) { led.style.background = ''; led.style.boxShadow = ''; }
            }
        }
        const pbJingleChk = document.getElementById('adPinballJingleReactCheck');
        if (pbJingleChk && pbad.jinglePeepReact !== undefined && (!pbJingleChk._lastUserToggle || Date.now() - pbJingleChk._lastUserToggle > 1500)) {
            pbJingleChk.checked = !!pbad.jinglePeepReact;
        }
    }

    // Booster AutoDrive Live-Status Rendering
    if (data.boosterAutoDrive) {
        const bad = data.boosterAutoDrive;
        const btn = document.getElementById('btnBoosterAutoDriveToggle');
        const led = document.getElementById('adBoosterLed');
        const lbl = document.getElementById('adBoosterBtnLabel');
        const phaseTxt = document.getElementById('adBoosterPhaseText');
        const badge = document.getElementById('adBoosterTimerBadge');
        if (phaseTxt) {
            phaseTxt.textContent = bad.phase || 'BEREIT';
            phaseTxt.style.color = bad.running ? '#22c55e' : '#fb923c';
        }
        if (badge) {
            badge.textContent = bad.timeFormatted || '0:00';
            badge.style.color = bad.running ? '#fb923c' : '#fff';
        }
        if (btn) {
            btn.classList.toggle('active', !!bad.running);
            if (bad.running) {
                btn.style.borderColor = '#ef4444';
                if (lbl) lbl.textContent = 'ABBRECHEN';
                if (led) { led.style.background = '#ef4444'; led.style.boxShadow = '0 0 8px #ef4444'; }
            } else {
                btn.style.borderColor = '#f97316';
                if (lbl) lbl.textContent = 'STARTEN';
                if (led) { led.style.background = ''; led.style.boxShadow = ''; }
            }
        }
    }

    // Sound Express Telemetry & AutoDrive Rendering
    if (tel.soundExpress) {
        const se = tel.soundExpress;
        const setToggleBtn = (id, active) => document.getElementById(id)?.classList.toggle('active', !!active);
        setToggleBtn('btnSeEngine', se.engineOn && se.rideOn);
        setToggleBtn('btnSeDispatch', se.dispatchOn);
        setToggleBtn('btnSoundExpressEngineOnly', se.engineOn);
        setToggleBtn('btnSoundExpressRideOnly', se.rideOn);
        setToggleBtn('btnSoundExpressDir', se.direction === 1);
        setToggleBtn('btnSoundExpressAdv', se.advancedOn);
        setToggleBtn('btnSoundExpressSiren', se.sirenOn);
        setToggleBtn('btnSoundExpressEStop', se.eStop);

        setText('lblSoundExpressDir', (se.direction === 1) ? 'RICHTUNG: RÜCKWÄRTS' : 'RICHTUNG: VORWÄRTS');

        const speedPct = Math.round((se.potiVal || 0) * 100);
        setText('valSoundExpressSpeed', `${speedPct}%`);
        const seFader = document.getElementById('faderSoundExpressSpeed');
        if (seFader && document.activeElement !== seFader) {
            seFader.value = speedPct;
        }

        document.getElementById('statSeBooted')?.classList.toggle('active', !!se.booted);
        document.getElementById('statSeDispatched')?.classList.toggle('active', !!se.dispatched);
        document.getElementById('statSeHarnessClosed')?.classList.toggle('active', !!se.harnessClosed);

        const occ = se.occupiedSeats || 0;
        const tot = se.totalSeats || 0;
        const liveSpd = Math.round((se.speedPercent || 0) * 100);
        setText('seSeatsSummary', `SITZPLÄTZE (${occ}/${tot}) • ${liveSpd}%`);
        if (Array.isArray(se.seats)) {
            renderSoundExpressSeats(se.seats);
        }
    }

    if (data.soundExpressAutoDrive) {
        const sead = data.soundExpressAutoDrive;
        setText('adSeTimerBadge', sead.timeFormatted || '0:00');
        setText('adSePhaseText', sead.phase || 'BEREIT');

        const btn = document.getElementById('btnSeAutoDriveToggle');
        const lbl = document.getElementById('adSeBtnLabel');
        const led = document.getElementById('adSeLed');
        if (btn) {
            btn.classList.toggle('active', !!sead.running);
            if (sead.running) {
                btn.style.borderColor = '#ef4444';
                if (lbl) lbl.textContent = 'ABBRECHEN';
                if (led) { led.style.background = '#ef4444'; led.style.boxShadow = '0 0 8px #ef4444'; }
            } else {
                btn.style.borderColor = '#38bdf8';
                if (lbl) lbl.textContent = 'STARTEN';
                if (led) { led.style.background = ''; led.style.boxShadow = ''; }
            }
        }
        const tourSel = document.getElementById('adSeTourSelect');
        if (tourSel && document.activeElement !== tourSel && sead.tourIndex !== undefined) {
            tourSel.value = String(sead.tourIndex);
        }
        const durSel = document.getElementById('adSeDurationSelect');
        if (durSel && document.activeElement !== durSel && sead.durationMin) {
            durSel.value = String(sead.durationMin);
        }
        const pauseSel = document.getElementById('adSePauseSelect');
        if (pauseSel && document.activeElement !== pauseSel && sead.pauseSec) {
            pauseSel.value = String(sead.pauseSec);
        }
        const loopChk = document.getElementById('adSeLoopCheck');
        if (loopChk && document.activeElement !== loopChk) {
            loopChk.checked = !!sead.loop;
        }
    }

    // Lights
    if (data.lights) {
        document.getElementById('btnAllLights')?.classList.toggle('active', !!data.lights.on);
        document.getElementById('btnStrobo')?.classList.toggle('active', !!data.lights.strobo);
        if (data.lights.program !== undefined) {
            setText('lightProgNum', data.lights.program + 1);
        }
    }

    // Moving Heads
    const mh = data.movingHeads || {};
    const mhOn = (tel.mhOn !== undefined) ? !!tel.mhOn : !!mh.on;
    const mhColorStrobo = (tel.mhColorStrobo !== undefined) ? !!tel.mhColorStrobo : !!mh.colorStrobo;
    const mhLightSync = (tel.mhLightSync !== undefined) ? !!tel.mhLightSync : !!mh.lightSync;

    document.getElementById('btnMHOn')?.classList.toggle('active', mhOn);
    document.getElementById('btnMHColorStrobo')?.classList.toggle('active', mhColorStrobo);
    document.getElementById('btnMHLightSync')?.classList.toggle('active', mhLightSync);
    
    const mhProg = (tel.mhProg !== undefined) ? tel.mhProg : mh.program;
    if (mhProg !== undefined) setText('mhProgNum', mhProg);
    const mhColor = (tel.mhColorProg !== undefined) ? tel.mhColorProg : mh.colorProg;
    if (mhColor !== undefined) setText('mhColorProgNum', mhColor);
    const mhGobo = (tel.mhGobo !== undefined) ? tel.mhGobo : mh.gobo;
    if (mhGobo !== undefined) setText('mhGoboNum', mhGobo);

    // FX Buttons (Nebel, Seifenblasen & Feuerstoß)
    const fogActive = (tel.fogOn !== undefined) ? !!tel.fogOn : !!(data.fog && data.fog.on);
    const bubblesActive = (tel.bubblesOn !== undefined) ? !!tel.bubblesOn : !!(data.bubbles && data.bubbles.on);
    const flameActive = (tel.flameOn !== undefined) ? !!tel.flameOn : !!(data.flame && data.flame.on);
    // Sync Vorruecken (P+K Tip) live from Telemetry across all devices (PC & Tablet)
    if (tel.tipPK !== undefined) {
        pkTipActive = !!tel.tipPK;
        document.getElementById('btnPkTip')?.classList.toggle('active', pkTipActive);
 }
    document.getElementById('btnFog')?.classList.toggle('active', fogActive);
    document.getElementById('btnBubbles')?.classList.toggle('active', bubblesActive);
    document.getElementById('btnFlame')?.classList.toggle('active', flameActive);

    // S2L In-Game Beat Sync
    const s2lActive = !!tel.s2lLightActive;
    syncS2LSettingsUI(tel);
    const btnS2L = document.getElementById('btnS2LLight');
    if (btnS2L) {
        btnS2L.classList.toggle('active', s2lActive);
        const led = document.getElementById('s2lBeatLed');
        if (led) {
            if (s2lActive && tel.s2lBeat) {
                led.style.background = '#e879f9';
                led.style.boxShadow = '0 0 12px #f43f5e';
            } else if (s2lActive) {
                led.style.background = '#a855f7';
                led.style.boxShadow = '0 0 6px #c084fc';
            } else {
                led.style.background = '';
                led.style.boxShadow = '';
            }
        }
    }

    // Xplosion Direkt-Status für S2L
    const xpBtnS2L = document.getElementById('btnXplosionS2L');
    if (xpBtnS2L) {
        xpBtnS2L.classList.toggle('active', s2lActive);
        const xpLed = document.getElementById('xplosionS2LLed');
        if (xpLed) {
            if (s2lActive && tel.s2lBeat) {
                xpLed.style.background = '#e879f9';
                xpLed.style.boxShadow = '0 0 12px #f43f5e';
            } else if (s2lActive) {
                xpLed.style.background = '#a855f7';
                xpLed.style.boxShadow = '0 0 6px #c084fc';
            } else {
                xpLed.style.background = '';
                xpLed.style.boxShadow = '';
            }
        }
    }
    const xpBadge = document.getElementById('xplosionS2LBadge');
    if (xpBadge) {
        if (s2lActive) {
            xpBadge.textContent = tel.s2lBeat ? 'BEAT 🎵' : 'S2L LIVE';
            xpBadge.style.background = tel.s2lBeat ? '#a855f7' : 'rgba(168, 85, 247, 0.3)';
            xpBadge.style.color = '#fff';
            xpBadge.style.borderColor = '#c084fc';
        } else {
            xpBadge.textContent = 'S2L AUS';
            xpBadge.style.background = 'rgba(39, 39, 42, 0.6)';
            xpBadge.style.color = '#a1a1aa';
            xpBadge.style.borderColor = '#3f3f46';
        }
    }

    // Peep / Besucher Interaktions Buttons Status
    const btnPeepHands = document.getElementById('btnPeepHands');
    if (btnPeepHands) {
        btnPeepHands.classList.toggle('active', !!tel.peepHandsUp);
    }
    const btnPeepClap = document.getElementById('btnPeepClap');
    if (btnPeepClap) {
        btnPeepClap.classList.toggle('active', !!tel.peepClap);
    }
    const btnPeepAgain = document.getElementById('btnPeepAgain');
    if (btnPeepAgain) {
        btnPeepAgain.classList.toggle('active', !!tel.peepAgain);
    }

    // SkySpots (Live-Farbe & Status aus Telemetrie)
    if (tel.spots) {
        document.getElementById('btnSpots')?.classList.toggle('active', !!tel.spots.on);
        const ind = document.getElementById('spotColorIndicator');
        if (ind && tel.spots.color) {
            ind.style.backgroundColor = tel.spots.color;
            ind.style.borderColor = tel.spots.on ? '#00ff73' : '#444';
            ind.style.boxShadow = tel.spots.on ? `0 0 12px ${tel.spots.color}` : 'none';
            ind.title = `Live: ${tel.spots.color} (${tel.spots.on ? 'AN' : 'AUS'})`;
        }
    }

    // Moving Head Dynamic Lists & Direct Selection Matrix
    updateMhMatrix(tel);

    // MH Live Sliders (Tempo, Gobo Rotation & Lichtintensität)
    if (!isDraggingSlider.mhSpeed && tel.mhSpeed !== undefined) {
        const pct = Math.round(tel.mhSpeed * 100);
        const sl = document.getElementById('sliderMhSpeed');
        if (sl) sl.value = pct;
        setText('mhSpeedVal', `${pct}%`);
    }
    if (!isDraggingSlider.mhGoboRot && tel.mhGoboRot !== undefined) {
        const pct = Math.round(tel.mhGoboRot * 100);
        const sl = document.getElementById('sliderMhGoboRot');
        if (sl) sl.value = pct;
        setText('mhGoboRotVal', `${pct}%`);
    }
    if (!isDraggingSlider.mhIntensity && tel.mhIntensity !== undefined) {
        const pct = Math.round(tel.mhIntensity * 100);
        const sl = document.getElementById('sliderMhIntensity');
        if (sl) sl.value = pct;
        setText('mhIntensityVal', `${pct}%`);
    }

    // Audio Play/Pause Button State
    const isPlaying = (tel.music && tel.music.playing !== undefined) ? !!tel.music.playing : false;
    const playBtn = document.getElementById('btnAudioPlay');
    if (playBtn) {
        playBtn.textContent = isPlaying ? '⏸️' : '▶️';
        playBtn.classList.toggle('active', isPlaying);
    }
}

function onMhSpeedInput(val) {
    isDraggingSlider.mhSpeed = true;
    setText('mhSpeedVal', `${val}%`);
    sendCmd({ setMHSpeed: parseFloat(val) / 100.0 });
    clearTimeout(window._mhSpeedTimeout);
    window._mhSpeedTimeout = setTimeout(() => { isDraggingSlider.mhSpeed = false; }, 800);
}

function onMhGoboRotInput(val) {
    isDraggingSlider.mhGoboRot = true;
    setText('mhGoboRotVal', `${val}%`);
    sendCmd({ setMHGoboRot: parseFloat(val) / 100.0 });
    clearTimeout(window._mhGoboTimeout);
    window._mhGoboTimeout = setTimeout(() => { isDraggingSlider.mhGoboRot = false; }, 800);
}

function onMhIntensityInput(val) {
    isDraggingSlider.mhIntensity = true;
    setText('mhIntensityVal', `${val}%`);
    sendCmd({ setMHIntensity: parseFloat(val) / 100.0 });
    clearTimeout(window._mhIntensityTimeout);
    window._mhIntensityTimeout = setTimeout(() => { isDraggingSlider.mhIntensity = false; }, 800);
}

// Farbmatrix: Mapping von 12 Grundfarben auf Scheinwerfer (42) & Türme (30)
// Rot = Scheinwerfer 2, Türme 26
const COLOR_MAPPINGS = {
    0:  { spot: 0,  mh: 0,  tower: 0 },   // Weiß
    1:  { spot: 1,  mh: 2,  tower: 27 },  // Rot (27 = "26-Red" im Texture_Array_Light_Animation_Controller)
    2:  { spot: 2,  mh: 4,  tower: 3 },   // Blau
    3:  { spot: 3,  mh: 6,  tower: 5 },   // Grün
    4:  { spot: 4,  mh: 8,  tower: 7 },   // Gelb
    5:  { spot: 5,  mh: 10, tower: 9 },   // Magenta
    6:  { spot: 6,  mh: 12, tower: 11 },  // Cyan
    7:  { spot: 7,  mh: 14, tower: 13 },  // Orange
    8:  { spot: 8,  mh: 16, tower: 15 },  // Lila
    9:  { spot: 9,  mh: 18, tower: 17 },  // Pink
    10: { spot: 10, mh: 20, tower: 19 },  // Mint
    11: { spot: 11, mh: 22, tower: 21 }   // Limette
};

function setGlobalColor(colorIdx) {
    const map = COLOR_MAPPINGS[colorIdx] || { spot: colorIdx, mh: colorIdx % 42, tower: colorIdx % 30 };
    sendCmd({
        setSpotColor: map.spot,
        setMHLightProg: map.mh,
        setTLProg: map.tower,
        setLightProg: map.tower
    });
}

// Default Fallback-Listen (falls Spiel noch lädt)
const DEFAULT_MH_PROGS = [
    "All Down", "Up", "Up A Sync", "Wiper", "Wiper A Sync", 
    "Rotation", "All Up", "Down A Sync", "Cross", "Random", "Sweep", "Fan"
];
const DEFAULT_MH_COLORS = [
    "White", "Rainbow Chaser", "Color Jump", "Slow Fade", "Strobe Burst", "Dual Sweep", "Sunset", "Ocean Breeze"
];
const DEFAULT_MH_GOBOS = [
    "Open / Dot", "Stars", "Spiral", "Circle Dots", "Tunnel", "Slash", "Sunburst", "Triangle"
];

let lastMhProgNames = [];
let lastMhColorNames = [];
let lastMhGoboNames = [];

function switchMhTab(tab) {
    document.getElementById('tabBtnMhProg')?.classList.toggle('active', tab === 'prog');
    document.getElementById('tabBtnMhColor')?.classList.toggle('active', tab === 'color');
    document.getElementById('tabBtnMhGobo')?.classList.toggle('active', tab === 'gobo');

    document.getElementById('panelMhProg')?.classList.toggle('active', tab === 'prog');
    document.getElementById('panelMhColor')?.classList.toggle('active', tab === 'color');
    document.getElementById('panelMhGobo')?.classList.toggle('active', tab === 'gobo');
}

function updateMhMatrix(tel) {
    if (activeRideMode === 'pinball' || activeRideMode === 'xplosion') {
        const ledColors = (tel.ledProgNames && tel.ledProgNames.length > 0)
            ? tel.ledProgNames
            : ((tel.ledColorProgNames && tel.ledColorProgNames.length > 0) ? tel.ledColorProgNames : []);
        const chasers = (tel.chaserProgNames && tel.chaserProgNames.length > 0)
            ? tel.chaserProgNames
            : ["Chris Cross", "Color Wave", "Downwards", "Upwards", "Ping Pong", "Random", "Strobe"];

        const curLedCol = tel.cLightProgIndex !== undefined ? tel.cLightProgIndex : (tel.ledColorProgIndex !== undefined ? tel.ledColorProgIndex : 0);
        const curChaser = tel.chaserProgIndex !== undefined ? tel.chaserProgIndex : 0;

        renderMhGrid('gridMhProg', ledColors, curLedCol, 'setLightProg', lastMhProgNames);
        renderMhGrid('gridMhColor', chasers, curChaser, 'setChaserProg', lastMhColorNames);
        return;
    }

    const progs = (tel.mhProgNames && tel.mhProgNames.length > 0) ? tel.mhProgNames : DEFAULT_MH_PROGS;
    const colors = (tel.mhColorProgNames && tel.mhColorProgNames.length > 0) ? tel.mhColorProgNames : DEFAULT_MH_COLORS;
    const gobos = (tel.mhGoboNames && tel.mhGoboNames.length > 0) ? tel.mhGoboNames : DEFAULT_MH_GOBOS;

    const curProg = tel.mhProg !== undefined ? tel.mhProg : 0;
    const curColor = tel.mhColorProg !== undefined ? tel.mhColorProg : 0;
    const curGobo = tel.mhGobo !== undefined ? tel.mhGobo : 0;

    renderMhGrid('gridMhProg', progs, curProg, 'setMHProg', lastMhProgNames);
    renderMhGrid('gridMhColor', colors, curColor, 'setMHLightProg', lastMhColorNames);
    renderMhGrid('gridMhGobo', gobos, curGobo, 'setMHGobo', lastMhGoboNames);
}

function renderMhGrid(containerId, list, activeIdx, cmdKey, lastCacheList) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Prüfen, ob Buttons neu gerendert werden müssen
    const listKey = list.join('|');
    const prevKey = lastCacheList.join('|');
    const needRebuild = (listKey !== prevKey) || (container.children.length !== list.length);

    if (needRebuild) {
        lastCacheList.length = 0;
        lastCacheList.push(...list);
        container.innerHTML = '';

        list.forEach((name, idx) => {
            const btn = document.createElement('button');
            btn.className = `mh-prog-btn ${idx === activeIdx ? 'active' : ''}`;
            btn.id = `${containerId}_btn_${idx}`;
            btn.onclick = () => {
                const cmd = {};
                cmd[cmdKey] = idx;
                sendCmd(cmd);
            };

            const idxSpan = document.createElement('span');
            idxSpan.className = 'mh-prog-idx';
            idxSpan.textContent = (idx + 1).toString().padStart(2, '0');

            const nameSpan = document.createElement('span');
            nameSpan.className = 'mh-prog-name';
            nameSpan.textContent = name;
            nameSpan.title = name;

            btn.appendChild(idxSpan);
            btn.appendChild(nameSpan);
            container.appendChild(btn);
        });
    } else {
        // Nur active status aktualisieren
        list.forEach((_, idx) => {
            const btn = document.getElementById(`${containerId}_btn_${idx}`);
            if (btn) {
                btn.classList.toggle('active', idx === activeIdx);
            }
        });
    }
}

// Master ALL-READY Safety Check
function updateMasterReadyStatus(tel, md) {
    const readyBox = document.getElementById('allReadyBox');
    const icon = document.getElementById('readyIcon');
    const statusTxt = document.getElementById('readyStatusText');
    const subTxt = document.getElementById('readySubText');
    if (!readyBox) return;

    if (activeRideMode === 'pinball') {
        const pb = tel.pinball || {};
        const isEStop = !!pb.estop;
        const isBooted = !!(pb.booted && pb.controlOn && pb.pumpOn);
        const isHarnessClosed = !!pb.harnessClosed;

        if (isEStop) {
            readyBox.className = 'all-ready-box not-ready';
            if (icon) icon.textContent = '🛑';
            if (statusTxt) statusTxt.textContent = 'NOT-AUS AKTIV!';
            if (subTxt) subTxt.textContent = 'Flipper gesperrt';
        } else if (!isBooted) {
            readyBox.className = 'all-ready-box not-ready';
            if (icon) icon.textContent = '⏳';
            if (statusTxt) statusTxt.textContent = 'SYSTEM / PUMPE AUS';
            if (subTxt) subTxt.textContent = 'Schlüssel, Steuerung & Pumpe einschalten';
        } else if (!isHarnessClosed) {
            readyBox.className = 'all-ready-box not-ready';
            if (icon) icon.textContent = '⚠️';
            if (statusTxt) statusTxt.textContent = 'BÜGEL OFFEN!';
            if (subTxt) subTxt.textContent = '12 Flipper-Gondeln verriegeln';
        } else {
            readyBox.className = 'all-ready-box ready';
            if (icon) icon.textContent = '✅';
            if (statusTxt) statusTxt.textContent = 'ALL READY / START FREI';
            if (subTxt) subTxt.textContent = pb.dispatch ? 'Fahrt läuft (Freigabe aktiv)' : 'Alle 12 Gondeln gesichert';
        }
        return;
    }

    if (activeRideMode === 'xplosion') {
        const hs = tel.xplosion || {};
        const isEStop = (hs.eStop !== undefined) ? !!hs.eStop : false;
        const isBooted = (hs.booted !== undefined) ? !!hs.booted : true;
        const isHarnessClosed = !!hs.harnessClosed;
        const isReadyToLaunch = !!hs.dispatchable || !!hs.ropeAtMaxTension;

        if (isEStop) {
            readyBox.className = 'all-ready-box not-ready';
            if (icon) icon.textContent = '🛑';
            if (statusTxt) statusTxt.textContent = 'NOT-AUS AKTIV!';
            if (subTxt) subTxt.textContent = 'Xplosion Bungee gesperrt';
        } else if (!isHarnessClosed) {
            readyBox.className = 'all-ready-box not-ready';
            if (icon) icon.textContent = '⚠️';
            if (statusTxt) statusTxt.textContent = 'BÜGEL OFFEN!';
            if (subTxt) subTxt.textContent = 'Gondelbügel vor Abschuss verriegeln';
        } else if (!isBooted) {
            readyBox.className = 'all-ready-box not-ready';
            if (icon) icon.textContent = '⏳';
            if (statusTxt) statusTxt.textContent = 'SCHLÜSSELSCHALTER AUS';
            if (subTxt) subTxt.textContent = 'Steuerung einschalten';
        } else if (isReadyToLaunch) {
            readyBox.className = 'all-ready-box ready';
            if (icon) icon.textContent = '🚀';
            if (statusTxt) statusTxt.textContent = 'ABSCHUSS FREI!';
            if (subTxt) subTxt.textContent = 'Seile voll gespannt - Launch bereit';
        } else {
            readyBox.className = 'all-ready-box ready';
            if (icon) icon.textContent = '✅';
            if (statusTxt) statusTxt.textContent = 'BETRIEBSBEREIT';
            if (subTxt) subTxt.textContent = 'Gondel spannen für Abschuss';
        }
        return;
    }

    if (activeRideMode === 'booster') {
        const b = tel.booster || {};
        const isEStop = (b.eStop !== undefined) ? !!b.eStop : false;
        const isBooted = (b.booted !== undefined) ? !!b.booted : true;
        const g1Closed = !!b.g1Closed;
        const g2Closed = !!b.g2Closed;
        const isWindAlarm = !!b.windAlarm;

        if (isEStop) {
            readyBox.className = 'all-ready-box not-ready';
            if (icon) icon.textContent = '🛑';
            if (statusTxt) statusTxt.textContent = 'NOT-AUS AKTIV!';
            if (subTxt) subTxt.textContent = 'Booster gesperrt';
        } else if (isWindAlarm) {
            readyBox.className = 'all-ready-box not-ready';
            if (icon) icon.textContent = '💨';
            if (statusTxt) statusTxt.textContent = 'WIND-ALARM!';
            if (subTxt) subTxt.textContent = 'Windgeschwindigkeit zu hoch';
        } else if (!g1Closed || !g2Closed) {
            readyBox.className = 'all-ready-box not-ready';
            if (icon) icon.textContent = '⚠️';
            const openG = (!g1Closed && !g2Closed) ? 'Gondel 1 & 2' : (!g1Closed ? 'Gondel 1' : 'Gondel 2');
            if (statusTxt) statusTxt.textContent = `${openG.toUpperCase()} OFFEN!`;
            if (subTxt) subTxt.textContent = 'Schulterbügel verriegeln';
        } else if (!isBooted) {
            readyBox.className = 'all-ready-box not-ready';
            if (icon) icon.textContent = '⏳';
            if (statusTxt) statusTxt.textContent = 'HAUPTSCHALTER AUS';
            if (subTxt) subTxt.textContent = 'Booster einschalten';
        } else {
            readyBox.className = 'all-ready-box ready';
            if (icon) icon.textContent = '✅';
            if (statusTxt) statusTxt.textContent = 'ALL READY / START FREI';
            if (subTxt) subTxt.textContent = 'Beide Gondeln (16 Sitze) gesichert';
        }
        return;
    }

    // MegaDance Logic
    const isEStop = (tel.eStopOn !== undefined) ? !!tel.eStopOn : (md && !!md.eStop);
    const isBooted = md ? (md.booted || (tel.operator && tel.operator.megadanceSeated) || !!tel.selfControlling) : true;
    
    // Bügel-Status auswerten:
    const s = tel.seats || {};
    const totalHarnesses = s.totalHarnesses || 24;
    const closedHarnesses = s.closedHarnesses !== undefined ? s.closedHarnesses : 0;
    
    // Wenn Sitze-Telemetrie vorhanden ist:
    const hasSeatsTelemetry = (s.totalHarnesses !== undefined || s.gondolas !== undefined);
    const mdHarnessClosed = (md && md.harnessClosed !== undefined) ? !!md.harnessClosed : false;
    const areHarnessesSafe = hasSeatsTelemetry ? (s.allClosed || closedHarnesses === totalHarnesses) : mdHarnessClosed;

    let occupiedOpenCount = 0;
    if (s.gondolas && Array.isArray(s.gondolas)) {
        s.gondolas.forEach(g => {
            if (g.occupied && !g.closed) occupiedOpenCount++;
        });
    }

    if (isEStop) {
        readyBox.className = 'all-ready-box not-ready';
        if (icon) icon.textContent = '🛑';
        if (statusTxt) statusTxt.textContent = 'NOT-AUS AKTIV!';
        if (subTxt) subTxt.textContent = 'Anlage gesperrt';
    } else if (!areHarnessesSafe || occupiedOpenCount > 0) {
        readyBox.className = 'all-ready-box not-ready';
        if (icon) icon.textContent = '⚠️';
        if (statusTxt) statusTxt.textContent = 'BÜGEL OFFEN!';
        if (subTxt) subTxt.textContent = occupiedOpenCount > 0 ? `${occupiedOpenCount} besetzte Gondeln schließen` : 'Bügel verriegeln vor Fahrt';
    } else if (!isBooted) {
        readyBox.className = 'all-ready-box not-ready';
        if (icon) icon.textContent = '🛑';
        if (statusTxt) statusTxt.textContent = 'PULT STANDBY';
        if (subTxt) subTxt.textContent = 'Anlage einschalten';
    } else {
        // ALL READY!
        readyBox.className = 'all-ready-box ready';
        if (icon) icon.textContent = '✅';
        if (statusTxt) statusTxt.textContent = 'ALL READY / START FREI';
        if (subTxt) subTxt.textContent = 'Alle Bügel sicher verriegelt';
    }
}

// 24 Gondeln Belegungs- & Sicherheitsplan Rendering
let lastGondolaState = '';
function renderGondolaMatrix(gondolas) {
    const grid = document.getElementById('gondolaCrossesGrid');
    if (!grid) return;

    const stateKey = gondolas.map(g => `${g.id}:${g.closed ? 1 : 0}:${g.occupied ? 1 : 0}`).join('|');
    if (stateKey === lastGondolaState && grid.children.length === 4) {
        // Schnell-Update bestehender Nodes
        gondolas.forEach(g => {
            const node = document.getElementById(`gondola_node_${g.id}`);
            if (node) {
                node.className = 'gondola-node ' + (g.occupied ? (g.closed ? 'safe' : 'danger') : 'empty');
            }
        });
        return;
    }

    lastGondolaState = stateKey;
    grid.innerHTML = '';

    // 4 Kreuze (je 6 Gondeln: Kreuz 1 = 1-6, Kreuz 2 = 7-12, Kreuz 3 = 13-18, Kreuz 4 = 19-24)
    for (let c = 0; c < 4; c++) {
        const crossBox = document.createElement('div');
        crossBox.className = 'cross-box';

        const title = document.createElement('div');
        title.className = 'cross-title';
        title.textContent = `KREUZ ${c + 1}`;
        crossBox.appendChild(title);

        const row = document.createElement('div');
        row.className = 'cross-gondolas';

        for (let gIdx = c * 6; gIdx < (c + 1) * 6; gIdx++) {
            const g = gondolas[gIdx] || { id: gIdx + 1, closed: false, occupied: false };
            const node = document.createElement('div');
            node.id = `gondola_node_${g.id}`;
            node.className = 'gondola-node ' + (g.occupied ? (g.closed ? 'safe' : 'danger') : 'empty');

            const lamp = document.createElement('span');
            lamp.className = 'g-lamp';

            const num = document.createElement('span');
            num.className = 'g-num';
            num.textContent = g.id.toString().padStart(2, '0');

            node.appendChild(lamp);
            node.appendChild(num);
            row.appendChild(node);
        }

        crossBox.appendChild(row);
        grid.appendChild(crossBox);
    }
}

function formatSeconds(sec) {
    if (!sec || isNaN(sec)) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// --- SSE Realtime Stream Connection ---
function connectSSE() {
    const sse = new EventSource('/api/events');

    sse.onmessage = e => {
        try {
            const data = JSON.parse(e.data);
            updateUI(data);
        } catch (err) {
            console.error("SSE parse error:", err);
        }
    };

    sse.onerror = () => {
        console.warn("SSE connection lost, retrying...");
        const pill = document.getElementById('connStatus');
        if (pill) {
            pill.className = 'plc-indicator offline';
            pill.title = 'Verbindung verloren';
        }
        sse.close();
        setTimeout(connectSSE, 2000);
    };
}

// Initial fetch + SSE start
fetch('/api/state')
    .then(r => r.json())
    .then(data => updateUI(data))
    .catch(() => {});

connectSSE();


async function updateAutoDriveConfig() {
    const loopCheck = document.getElementById('adLoopCheck');
    const pauseSelect = document.getElementById('adPauseSelect');
    const jingleCheck = document.getElementById('adJingleReactCheck');
    const durationSelect = document.getElementById('adDurationSelect');
    if (jingleCheck) jingleCheck._lastUserToggle = Date.now();
    if (durationSelect) durationSelect._lastUserToggle = Date.now();
    const loop = loopCheck ? loopCheck.checked : false;
    const pauseSec = pauseSelect ? parseInt(pauseSelect.value) : 60;
    const jinglePeepReact = jingleCheck ? jingleCheck.checked : true;
    const durationMin = durationSelect ? parseInt(durationSelect.value) : 4;

    try {
        await fetch('/api/autodrive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'config', loop: loop, pauseSec: pauseSec, jinglePeepReact: jinglePeepReact, durationMin: durationMin })
        });
    } catch (e) { console.error('Failed to update autodrive config', e); }
}

async function toggleAutoDrive() {
    const isRunning = currentState.autoDrive && currentState.autoDrive.running;
    if (isRunning) {
        try {
            await fetch('/api/autodrive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'stop' })
            });
        } catch (e) { console.error('Failed to stop autodrive', e); }
    } else {
        const tourSelect = document.getElementById('adTourSelect');
        const loopCheck = document.getElementById('adLoopCheck');
        const pauseSelect = document.getElementById('adPauseSelect');
        const jingleCheck = document.getElementById('adJingleReactCheck');
        const durationSelect = document.getElementById('adDurationSelect');
        const tour = tourSelect ? parseInt(tourSelect.value) : 0;
        const loop = loopCheck ? loopCheck.checked : false;
        const pauseSec = pauseSelect ? parseInt(pauseSelect.value) : 60;
        const jinglePeepReact = jingleCheck ? jingleCheck.checked : true;
        const durationMin = durationSelect ? parseInt(durationSelect.value) : 4;

        try {
            await fetch('/api/autodrive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'start', tour: tour, loop: loop, pauseSec: pauseSec, jinglePeepReact: jinglePeepReact, durationMin: durationMin })
            });
        } catch (e) { console.error('Failed to start autodrive', e); }
    }
}


let pkTipActive = false;
async function togglePkTip() {
    pkTipActive = !pkTipActive;
    const btn = document.getElementById('btnPkTip');
    if (btn) btn.classList.toggle('active', pkTipActive);
    try {
        if (pkTipActive) {
            await sendCmd({ tipPK: true });
        } else {
            await sendCmd({ tipPK: false });
        }
    } catch (e) {
        console.error('Failed to toggle P+K Tip via API', e);
    }
}

/* ==========================================================================
   WELTZEIT & WETTER HOST-STEUERUNG
   ========================================================================== */
function formatTimeFloat(val) {
    const totalMinutes = Math.floor(val * 60);
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} Uhr`;
}

function toggleEnvModal() {
    const overlay = document.getElementById('envModalOverlay');
    if (!overlay) return;
    overlay.classList.toggle('open');
}

function onEnvModalOverlayClick(e) {
    if (e.target && e.target.id === 'envModalOverlay') {
        toggleEnvModal();
    }
}

function onEnvTimeSliderInput(val) {
    const num = parseFloat(val);
    setText('envModalTimeDisplay', formatTimeFloat(num));
}

async function onEnvTimeSliderChange(val) {
    const num = parseFloat(val);
    await sendCmd({ setWorldTime: num });
}

async function setQuickTime(hours) {
    const slider = document.getElementById('envTimeSlider');
    if (slider) slider.value = hours;
    setText('envModalTimeDisplay', formatTimeFloat(hours));
    await sendCmd({ setWorldTime: hours });
}

async function setQuickWeather(weatherId) {
    for (let i = 0; i <= 5; i++) {
        const btn = document.getElementById(`btnWeather${i}`);
        if (btn) btn.classList.toggle('active', i === weatherId);
    }
    await sendCmd({ setWeatherId: weatherId });
}

async function toggleRealTimeMode(enabled) {
    await sendCmd({ setRealTimeMode: enabled });
}

async function togglePeepsEnabled(enabled) {
    await sendCmd({ setPeepsEnabled: enabled });
}

function onMaxPeepsInput(val) {
    setText('envMaxPeepsDisplay', val);
}

async function onMaxPeepsChange(val) {
    const num = parseInt(val, 10);
    await sendCmd({ setMaxPeeps: num });
}

async function changeTicketPrice(increase) {
    if (increase) {
        await sendCmd({ ticketPriceUp: true });
    } else {
        await sendCmd({ ticketPriceDown: true });
    }
}

/* ==========================================================================
   QR-CODE MODAL (SMARTPHONE & TABLET)
   ========================================================================== */
async function openQrModal() {
    console.log('[DEBUG] openQrModal clicked!');
    const overlay = document.getElementById('qrModalOverlay');
    if (!overlay) {
        console.error('[DEBUG] qrModalOverlay element not found!');
        return;
    }
    overlay.classList.add('open');
    overlay.style.display = 'flex';

    try {
        const res = await fetch('/api/network-info');
        const data = await res.json();
        const targetUrl = data.url || `http://${window.location.hostname}:8080`;
        console.log('[DEBUG] targetUrl is:', targetUrl);

        const urlDisplay = document.getElementById('qrUrlDisplay');
        if (urlDisplay) urlDisplay.textContent = targetUrl;

        const qrImg = document.getElementById('qrCodeImg');
        if (qrImg) {
            // High-res QR code API (QR Server)
            qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(targetUrl)}&margin=1`;
        }
    } catch (e) {
        console.error('Failed to load network info for QR code', e);
    }
}

function closeQrModal() {
    console.log('[DEBUG] closeQrModal clicked!');
    const overlay = document.getElementById('qrModalOverlay');
    if (overlay) {
        overlay.classList.remove('open');
        overlay.style.display = 'none';
    }
}

function onQrModalOverlayClick(e) {
    if (e.target && e.target.id === 'qrModalOverlay') {
        closeQrModal();
    }
}

// Global explizit am window-Objekt registrieren
window.openQrModal = openQrModal;
window.closeQrModal = closeQrModal;
window.onQrModalOverlayClick = onQrModalOverlayClick;
window.toggleEnvModal = toggleEnvModal;
window.onEnvModalOverlayClick = onEnvModalOverlayClick;
window.setQuickTime = setQuickTime;
window.setQuickWeather = setQuickWeather;
window.toggleRealTimeMode = toggleRealTimeMode;
window.togglePeepsEnabled = togglePeepsEnabled;
// Automatische Initialisierung der Netzwerk-URL fr den QR-Code
async function initNetworkQr() {
    try {
        const res = await fetch('/api/network-info');
        const data = await res.json();
        const targetUrl = data.url || `http://${window.location.hostname}:8080`;
        
        const urlElem = document.getElementById('staticQrUrl');
        if (urlElem) urlElem.textContent = targetUrl;

        const imgElem = document.getElementById('staticQrImg');
        if (imgElem) {
            imgElem.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(targetUrl)}&margin=1`;
        }
    } catch (e) {
        // Fallback bleibt lokales qr.svg
    }
}
initNetworkQr();

window.onMaxPeepsChange = onMaxPeepsChange;
window.changeTicketPrice = changeTicketPrice;
window.togglePkTip = togglePkTip;






// ==========================================
// S2L SETTINGS MODAL & STATE HANDLER (1:1 StreamDeck)
// ==========================================
let s2lModalOpen = false;

function toggleS2LModal() {
    const modal = document.getElementById('s2lModal');
    if (!modal) return;
    s2lModalOpen = !s2lModalOpen;
    modal.style.display = s2lModalOpen ? 'flex' : 'none';
}

function sendS2LVal(key, val) {
    const el = document.getElementById('chk_' + key) || document.getElementById(key);
    if (el) el._lastUserToggle = Date.now();
    const payload = {};
    payload[key] = val;
    fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).catch(err => console.error('S2L Command Error:', err));
}

function toggleS2LSetting(key, btnElem) {
    if (btnElem) btnElem._lastUserToggle = Date.now();
    const isActive = btnElem.classList.contains('active');
    const nextVal = !isActive;
    btnElem.classList.toggle('active', nextVal);
    sendS2LVal(key, nextVal);
}

function syncS2LSettingsUI(tel) {
    if (!tel) return;

    // Range: sensitivity
    if (tel.s2lSensitivity !== undefined && !window._isDraggingS2LSens) {
        const rng = document.getElementById('rngS2LSens');
        const lbl = document.getElementById('lblS2LSens');
        if (rng && document.activeElement !== rng) rng.value = tel.s2lSensitivity;
        if (lbl) lbl.innerText = tel.s2lSensitivity + '%';
    }

    // Buttons
    const btnAlles = document.getElementById('s2lBtn_alles');
    if (btnAlles && tel.s2lAllEffects !== undefined && (!btnAlles._lastUserToggle || Date.now() - btnAlles._lastUserToggle > 1500)) btnAlles.classList.toggle('active', !!tel.s2lAllEffects);

    const btnNight = document.getElementById('s2lBtn_night');
    if (btnNight && tel.s2lNightMode !== undefined && (!btnNight._lastUserToggle || Date.now() - btnNight._lastUserToggle > 1500)) btnNight.classList.toggle('active', !!tel.s2lNightMode);

    const btnGP = document.getElementById('s2lBtn_gondelpause');
    if (btnGP && tel.s2lKreuzMotorPauseEnabled !== undefined && (!btnGP._lastUserToggle || Date.now() - btnGP._lastUserToggle > 1500)) btnGP.classList.toggle('active', !!tel.s2lKreuzMotorPauseEnabled);

    // Checkboxes FX
    const fxMap = {
        'chk_s2lStrobo': tel.s2lStrobo,
        'chk_s2lFog': tel.s2lFog,
        'chk_s2lFlame': tel.s2lFlame,
        'chk_s2lLED': tel.s2lLED,
        'chk_s2lColorStrobe': tel.s2lColorStrobe,
        'chk_s2lSpot': tel.s2lSpot,
        'chk_s2lBubble': tel.s2lBubble,
        'chk_s2lPeepsHands': tel.s2lPeepsHands,
        'chk_s2lPeepsClap': tel.s2lPeepsClap,
        'chk_s2lLight1': tel.s2lLight1,
        'chk_s2lLight2': tel.s2lLight2,
        'chk_s2lLight3': tel.s2lLight3,
        'chk_s2lLight4': tel.s2lLight4,
        'chk_s2lLight5': tel.s2lLight5,
        'chk_s2lLight6': tel.s2lLight6,
        'chk_s2lLight7': tel.s2lLight7,
        'chk_s2lLight8': tel.s2lLight8,
        'chk_s2lLight9': tel.s2lLight9
    };

    for (const id of Object.keys(fxMap)) {
        const val = fxMap[id];
        if (val !== undefined) {
            const chk = document.getElementById(id);
            if (chk && (!chk._lastUserToggle || Date.now() - chk._lastUserToggle > 1500)) chk.checked = !!val;
        }
    }
}

window.toggleS2LModal = toggleS2LModal;
window.sendS2LVal = sendS2LVal;
window.toggleS2LSetting = toggleS2LSetting;

// ==========================================
// JINGLE ORDNER -> NPC-REAKTIONS MENÜ (AUTODRIVE)
// ==========================================
let allJinglesData = [];
let currentJingleDeckFilter = 'ALL';

async function openJingleModal() {
    const overlay = document.getElementById('jingleModalOverlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    overlay.classList.add('open');
    await loadJinglesFromServer();
}

function closeJingleModal() {
    const overlay = document.getElementById('jingleModalOverlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.style.display = 'none';
}

async function loadJinglesFromServer() {
    try {
        const res = await fetch('/api/jingles');
        const data = await res.json();
        allJinglesData = Array.isArray(data.jingles) ? data.jingles : [];
        if (typeof data.enabled === 'boolean') {
            const chk = document.getElementById('adJingleReactCheck');
            if (chk) chk.checked = data.enabled;
        }
        renderJingleDeckTabs();
        renderJingleList();
    } catch (e) {
        console.error('Fehler beim Laden der Jingles:', e);
    }
}

function renderJingleDeckTabs() {
    const tabsContainer = document.getElementById('jingleDeckTabs');
    if (!tabsContainer) return;
    const decks = Array.from(new Set(allJinglesData.map(j => j.deck))).sort();
    let html = `<button type="button" class="env-preset-btn ${currentJingleDeckFilter === 'ALL' ? 'active' : ''}" style="padding: 4px 10px; font-size: 0.72rem;" onclick="filterJingleDeck('ALL')">Alle (${allJinglesData.length})</button>`;
    for (const d of decks) {
        const count = allJinglesData.filter(j => j.deck === d).length;
        html += `<button type="button" class="env-preset-btn ${currentJingleDeckFilter === d ? 'active' : ''}" style="padding: 4px 10px; font-size: 0.72rem;" onclick="filterJingleDeck('${d}')">Deck ${d} (${count})</button>`;
    }
    tabsContainer.innerHTML = html;
}

function filterJingleDeck(deck) {
    currentJingleDeckFilter = deck;
    renderJingleDeckTabs();
    renderJingleList();
}

function renderJingleList() {
    const container = document.getElementById('jingleListContainer');
    const countInfo = document.getElementById('jingleCountInfo');
    if (!container) return;

    const searchVal = (document.getElementById('jingleSearchInput')?.value || '').trim().toLowerCase();
    const filtered = allJinglesData.filter(j => {
        if (currentJingleDeckFilter !== 'ALL' && j.deck !== currentJingleDeckFilter) return false;
        if (searchVal && !j.name.toLowerCase().includes(searchVal) && !j.deck.toLowerCase().includes(searchVal)) return false;
        return true;
    });

    if (countInfo) {
        const activeCount = allJinglesData.filter(j => j.reaction && j.reaction !== 'none').length;
        countInfo.textContent = `${filtered.length} angezeigt | ${activeCount} von ${allJinglesData.length} mit NPC-Reaktion aktiv`;
    }

    if (filtered.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: #64748b; padding: 20px; font-family: var(--font-mono);">Keine Jingles für diesen Filter gefunden.</div>`;
        return;
    }

    const options = [
        { val: 'none', label: '➖ Keine Reaktion' },
        { val: 'hands', label: '🙌 Hände hoch!' },
        { val: 'clap', label: '👏 Mitklatschen' },
        { val: 'scream', label: '😱 Kreischen & Jubeln' },
        { val: 'again', label: '🔁 Zugabe! (Nochmal)' },
        { val: 'random', label: '🎲 Zufalls-Reaktion' }
    ];

    const colorForReaction = (r) => {
        if (r === 'hands') return '#22c55e';
        if (r === 'clap') return '#f59e0b';
        if (r === 'scream') return '#ec4899';
        if (r === 'again') return '#38bdf8';
        if (r === 'random') return '#a855f7';
        return '#71717a';
    };

    container.innerHTML = filtered.map(j => {
        const safeKey = j.key.replace(/'/g, "\\'");
        const fKey = (j.slot && j.slot <= 12) ? `F${j.slot}` : `#${j.slot || ''}`;
        const col = colorForReaction(j.reaction);
        const optsHtml = options.map(o => `<option value="${o.val}" ${j.reaction === o.val ? 'selected' : ''}>${o.label}</option>`).join('');
        return `
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 6px 10px; border-bottom: 1px solid #1e293b; background: ${j.reaction !== 'none' ? 'rgba(14, 165, 233, 0.05)' : 'transparent'};">
                <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                    <span style="background: #1e293b; color: #38bdf8; font-family: var(--font-mono); font-size: 0.7rem; font-weight: bold; padding: 2px 6px; border-radius: 4px; flex-shrink: 0;">${j.deck} • ${fKey}</span>
                    <span style="font-family: var(--font-mono); font-size: 0.78rem; color: #e4e4e7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${j.file}">${j.name}</span>
                </div>
                <select onchange="updateSingleJingleReaction('${safeKey}', this.value, this)" style="background: #09090b; color: ${col}; border: 1px solid ${j.reaction !== 'none' ? col : '#3f3f46'}; border-radius: 4px; padding: 4px 8px; font-family: var(--font-mono); font-size: 0.75rem; font-weight: bold; cursor: pointer; flex-shrink: 0;">
                    ${optsHtml}
                </select>
            </div>
        `;
    }).join('');
}

async function updateSingleJingleReaction(key, reaction, selectElem) {
    const item = allJinglesData.find(j => j.key === key);
    if (item) item.reaction = reaction;
    if (selectElem) {
        renderJingleList();
    }
    try {
        await fetch('/api/jingles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, reaction })
        });
    } catch (e) {
        console.error('Fehler beim Speichern der Jingle-Reaktion:', e);
    }
}

async function resetJingleDefaults() {
    try {
        await fetch('/api/jingles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resetDefaults: true })
        });
        await loadJinglesFromServer();
    } catch (e) {
        console.error('Fehler beim Zurücksetzen der Jingles:', e);
    }
}

window.openJingleModal = openJingleModal;
window.closeJingleModal = closeJingleModal;
window.filterJingleDeck = filterJingleDeck;
window.renderJingleList = renderJingleList;
window.updateSingleJingleReaction = updateSingleJingleReaction;
window.resetJingleDefaults = resetJingleDefaults;

// ==========================================
// XPLOSION AUTODRIVE (VOLLAUTOMATIK & SMARTE SENSOREN)
// ==========================================
async function toggleXplosionAutoDrive() {
    const btn = document.getElementById('btnXplosionAutoDriveToggle');
    const isRunning = btn && btn.classList.contains('active');
    const loop = document.getElementById('adXplosionLoopCheck')?.checked || false;
    const pauseSec = parseInt(document.getElementById('adXplosionPauseSelect')?.value) || 25;
    const autoFog = document.getElementById('adXplosionFogCheck')?.checked || false;
    const smartSensors = document.getElementById('adXplosionSensorsCheck')?.checked ?? true;

    try {
        const res = await fetch('/api/xplosion-autodrive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: isRunning ? 'stop' : 'start',
                loop,
                pauseSec,
                autoFog,
                smartSensors
            })
        });
        const result = await res.json();
        if (result && result.blocked) {
            alert(result.reason || 'Du sitzt im Spiel nicht am Xplosion-Pult!');
        }
    } catch (e) {
        console.error('Fehler bei Xplosion AutoDrive:', e);
    }
}
window.toggleXplosionAutoDrive = toggleXplosionAutoDrive;

// ==========================================
// PINBALL (FLIPPER) GONDEL-MATRIX & AUTODRIVE
// ==========================================
let lastPinballGondolaState = '';
function renderPinballGondolaMatrix(gondolas) {
    const grid = document.getElementById('pinballGondolasGrid');
    if (!grid) return;

    const stateKey = gondolas.map(g => `${g.id}:${g.closed ? 1 : 0}:${g.occupied ? 1 : 0}`).join('|');
    if (stateKey === lastPinballGondolaState && grid.children.length === gondolas.length) {
        gondolas.forEach(g => {
            const node = document.getElementById(`pb_gondola_node_${g.id}`);
            if (node) {
                node.className = 'gondola-node ' + (g.occupied ? (g.closed ? 'safe' : 'danger') : (g.closed ? 'safe' : 'empty'));
            }
        });
        return;
    }

    lastPinballGondolaState = stateKey;
    grid.innerHTML = '';

    gondolas.forEach(g => {
        const node = document.createElement('div');
        node.id = `pb_gondola_node_${g.id}`;
        node.className = 'gondola-node ' + (g.occupied ? (g.closed ? 'safe' : 'danger') : (g.closed ? 'safe' : 'empty'));

        const lamp = document.createElement('span');
        lamp.className = 'g-lamp';

        const num = document.createElement('span');
        num.className = 'g-num';
        num.textContent = g.id.toString().padStart(2, '0');

        node.appendChild(lamp);
        node.appendChild(num);
        grid.appendChild(node);
    });
}

async function updatePinballAutoDriveConfig() {
    const loop = document.getElementById('adPinballLoopCheck')?.checked || false;
    const pauseSec = parseInt(document.getElementById('adPinballPauseSelect')?.value) || 45;
    const durationMin = parseInt(document.getElementById('adPinballDurationSelect')?.value) || 3;
    const jinglePeepReact = document.getElementById('adPinballJingleReactCheck')?.checked ?? true;

    try {
        await fetch('/api/pinball-autodrive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'config', loop, pauseSec, durationMin, jinglePeepReact })
        });
    } catch (e) {
        console.error('Fehler beim Update der Pinball AutoDrive Config:', e);
    }
}

async function togglePinballAutoDrive() {
    const isRunning = currentState.pinballAutoDrive && currentState.pinballAutoDrive.running;
    if (isRunning) {
        try {
            await fetch('/api/pinball-autodrive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'stop' })
            });
        } catch (e) {
            console.error('Fehler beim Stoppen von Pinball AutoDrive:', e);
        }
    } else {
        const tour = parseInt(document.getElementById('adPinballTourSelect')?.value) || 0;
        const loop = document.getElementById('adPinballLoopCheck')?.checked || false;
        const pauseSec = parseInt(document.getElementById('adPinballPauseSelect')?.value) || 45;
        const durationMin = parseInt(document.getElementById('adPinballDurationSelect')?.value) || 3;
        const jinglePeepReact = document.getElementById('adPinballJingleReactCheck')?.checked ?? true;

        try {
            const res = await fetch('/api/pinball-autodrive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'start', tour, loop, pauseSec, durationMin, jinglePeepReact })
            });
            const result = await res.json();
            if (result && result.blocked) {
                alert(result.reason || 'Du sitzt im Spiel nicht am Flipper (Pinball)-Pult!');
            }
        } catch (e) {
            console.error('Fehler beim Starten von Pinball AutoDrive:', e);
        }
    }
}
window.togglePinballAutoDrive = togglePinballAutoDrive;
window.updatePinballAutoDriveConfig = updatePinballAutoDriveConfig;

async function forceStartPinballAutoDrive() {
    const tour = parseInt(document.getElementById('adPinballTourSelect')?.value) || 0;
    const loop = document.getElementById('adPinballLoopCheck')?.checked || false;
    const pauseSec = parseInt(document.getElementById('adPinballPauseSelect')?.value) || 45;
    const durationMin = parseInt(document.getElementById('adPinballDurationSelect')?.value) || 3;
    const jinglePeepReact = document.getElementById('adPinballJingleReactCheck')?.checked ?? true;
    try {
        const res = await fetch('/api/pinball-autodrive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'force_start', tour, loop, pauseSec, durationMin, jinglePeepReact })
        });
        const result = await res.json();
        if (result && result.blocked) {
            alert(result.reason || 'Du sitzt im Spiel nicht am Flipper (Pinball)-Pult!');
        }
    } catch (e) {
        console.error('Fehler beim Sofort-Start von Pinball AutoDrive:', e);
    }
}
window.forceStartPinballAutoDrive = forceStartPinballAutoDrive;

async function updateBoosterAutoDriveConfig() {
    const loop = document.getElementById('adBoosterLoopCheck')?.checked || false;
    const pauseSec = parseInt(document.getElementById('adBoosterPauseSelect')?.value) || 30;
    const durationMin = parseInt(document.getElementById('adBoosterDurationSelect')?.value) || 3;
    try {
        await fetch('/api/booster-autodrive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'config', loop, pauseSec, durationMin })
        });
    } catch (e) {}
}

async function toggleBoosterAutoDrive() {
    const isRunning = document.getElementById('btnBoosterAutoDriveToggle')?.classList.contains('active');
    if (isRunning) {
        await fetch('/api/booster-autodrive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'stop' })
        }).catch(() => {});
        return;
    }
    const tour = parseInt(document.getElementById('adBoosterTourSelect')?.value) || 0;
    const loop = document.getElementById('adBoosterLoopCheck')?.checked || false;
    const pauseSec = parseInt(document.getElementById('adBoosterPauseSelect')?.value) || 30;
    const durationMin = parseInt(document.getElementById('adBoosterDurationSelect')?.value) || 3;
    try {
        const res = await fetch('/api/booster-autodrive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'start', tour, loop, pauseSec, durationMin })
        });
        const result = await res.json();
        if (result && result.blocked) {
            alert(result.reason || 'Du sitzt im Spiel nicht am Booster (Turaka)-Pult!');
        }
    } catch (e) {}
}

async function forceStartBoosterAutoDrive() {
    const tour = parseInt(document.getElementById('adBoosterTourSelect')?.value) || 0;
    const loop = document.getElementById('adBoosterLoopCheck')?.checked || false;
    const pauseSec = parseInt(document.getElementById('adBoosterPauseSelect')?.value) || 30;
    const durationMin = parseInt(document.getElementById('adBoosterDurationSelect')?.value) || 3;
    try {
        const res = await fetch('/api/booster-autodrive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'force_start', tour, loop, pauseSec, durationMin })
        });
        const result = await res.json();
        if (result && result.blocked) {
            alert(result.reason || 'Du sitzt im Spiel nicht am Booster (Turaka)-Pult!');
        }
    } catch (e) {}
}
window.updateBoosterAutoDriveConfig = updateBoosterAutoDriveConfig;
window.toggleBoosterAutoDrive = toggleBoosterAutoDrive;
window.forceStartBoosterAutoDrive = forceStartBoosterAutoDrive;

// --- Sound Express Steuerung & AutoDrive ---
let _seSpeedTimeout = null;
function sendSoundExpressSpeed(val) {
    const pct = Math.max(0, Math.min(100, parseInt(val, 10) || 0));
    setText('valSoundExpressSpeed', `${pct}%`);
    clearTimeout(_seSpeedTimeout);
    _seSpeedTimeout = setTimeout(() => {
        sendCmd({ setSoundExpressSpeed: pct / 100 });
    }, 35);
}

function setSoundExpressSpeedPreset(pct) {
    const val = Math.max(0, Math.min(100, parseInt(pct, 10) || 0));
    const fader = document.getElementById('faderSoundExpressSpeed');
    if (fader) fader.value = val;
    setText('valSoundExpressSpeed', `${val}%`);
    sendCmd({ setSoundExpressSpeed: val / 100 });
}

function toggleSoundExpressEngineRide() {
    const se = (currentState && currentState.telemetry && currentState.telemetry.soundExpress) || {};
    const next = !(se.engineOn && se.rideOn);
    sendCmd({ setSoundExpressEngine: next, setSoundExpressRide: next });
}

async function updateSoundExpressAutoDriveConfig() {
    const tour = parseInt(document.getElementById('adSeTourSelect')?.value, 10) || 0;
    const loop = document.getElementById('adSeLoopCheck')?.checked || false;
    const pauseSec = parseInt(document.getElementById('adSePauseSelect')?.value, 10) || 30;
    const durationMin = parseInt(document.getElementById('adSeDurationSelect')?.value, 10) || 3;
    try {
        await fetch('/api/soundexpress-autodrive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'config', tour, loop, pauseSec, durationMin })
        });
    } catch (e) {}
}

async function toggleSoundExpressAutoDrive() {
    const isRunning = !!(currentState && currentState.soundExpressAutoDrive && currentState.soundExpressAutoDrive.running);
    const tour = parseInt(document.getElementById('adSeTourSelect')?.value, 10) || 0;
    const loop = document.getElementById('adSeLoopCheck')?.checked || false;
    const pauseSec = parseInt(document.getElementById('adSePauseSelect')?.value, 10) || 30;
    const durationMin = parseInt(document.getElementById('adSeDurationSelect')?.value, 10) || 3;
    try {
        const res = await fetch('/api/soundexpress-autodrive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: isRunning ? 'stop' : 'start',
                tour,
                loop,
                pauseSec,
                durationMin
            })
        });
        const result = await res.json();
        if (result && result.blocked) {
            alert(result.reason || 'Du sitzt im Spiel nicht am Sound Express-Pult!');
        }
    } catch (e) {}
}

async function forceStartSoundExpressAutoDrive() {
    const tour = parseInt(document.getElementById('adSeTourSelect')?.value, 10) || 0;
    const loop = document.getElementById('adSeLoopCheck')?.checked || false;
    const pauseSec = parseInt(document.getElementById('adSePauseSelect')?.value, 10) || 30;
    const durationMin = parseInt(document.getElementById('adSeDurationSelect')?.value, 10) || 3;
    try {
        const res = await fetch('/api/soundexpress-autodrive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'force_start',
                tour,
                loop,
                pauseSec,
                durationMin
            })
        });
        const result = await res.json();
        if (result && result.blocked) {
            alert(result.reason || 'Du sitzt im Spiel nicht am Sound Express-Pult!');
        }
    } catch (e) {}
}

let lastSeSeatState = '';
function renderSoundExpressSeats(seats) {
    const grid = document.getElementById('seSeatsGrid');
    if (!grid) return;

    const stateKey = seats.map(s => `${s.id}:${s.closed ? 1 : 0}:${s.occupied ? 1 : 0}`).join('|');
    if (stateKey === lastSeSeatState && grid.children.length > 0) return;

    // Schnell-Update wenn sich nur Status ändert, Anzahl gleich bleibt
    if (grid.children.length > 0 && grid.querySelectorAll('.gondola-node').length === seats.length) {
        lastSeSeatState = stateKey;
        seats.forEach(s => {
            const node = document.getElementById(`se_seat_node_${s.id}`);
            if (node) {
                node.className = 'gondola-node ' + (s.occupied ? (s.closed ? 'safe' : 'danger') : 'empty');
                node.title = `Sitz ${s.id}: ${s.occupied ? 'Besetzt' : 'Frei'} | Bügel: ${s.closed ? 'ZU' : 'OFFEN'}`;
            }
        });
        return;
    }

    lastSeSeatState = stateKey;
    grid.innerHTML = '';

    // Gruppieren in Chaisen-Blöcke à 10 Sitze (oder 4 Gruppen) für sauberes Grid
    const total = seats.length;
    const groupSize = total >= 20 ? Math.ceil(total / 4) : Math.max(1, Math.ceil(total / 2));
    for (let g = 0; g < total; g += groupSize) {
        const chunk = seats.slice(g, g + groupSize);
        const box = document.createElement('div');
        box.className = 'cross-box';

        const title = document.createElement('div');
        title.className = 'cross-title';
        title.textContent = `PLATZ ${g + 1}–${g + chunk.length}`;
        box.appendChild(title);

        const row = document.createElement('div');
        row.className = 'cross-gondolas';

        chunk.forEach(s => {
            const node = document.createElement('div');
            node.id = `se_seat_node_${s.id}`;
            node.className = 'gondola-node ' + (s.occupied ? (s.closed ? 'safe' : 'danger') : 'empty');
            node.textContent = s.id;
            node.title = `Sitz ${s.id}: ${s.occupied ? 'Besetzt' : 'Frei'} | Bügel: ${s.closed ? 'ZU' : 'OFFEN'}`;
            row.appendChild(node);
        });

        box.appendChild(row);
        grid.appendChild(box);
    }
}

window.sendSoundExpressSpeed = sendSoundExpressSpeed;
window.setSoundExpressSpeedPreset = setSoundExpressSpeedPreset;
window.toggleSoundExpressEngineRide = toggleSoundExpressEngineRide;
window.updateSoundExpressAutoDriveConfig = updateSoundExpressAutoDriveConfig;
window.toggleSoundExpressAutoDrive = toggleSoundExpressAutoDrive;
window.forceStartSoundExpressAutoDrive = forceStartSoundExpressAutoDrive;

// --- GitHub Update-Checker fuer Fairground-Online-Telemetry ---
(async function checkTelemetryModUpdate() {
    const CURRENT_TELEMETRY_VERSION = '1.0.0-beta';
    try {
        const res = await fetch('https://api.github.com/repos/BlackMautz/Fairground-Online-Telemetry/releases?per_page=1');
        if (!res.ok) return;
        const list = await res.json();
        const rel = Array.isArray(list) ? list[0] : list;
        if (!rel || !rel.tag_name) return;
        const latest = String(rel.tag_name).replace(/^v/i, '').trim();
        if (latest && latest !== CURRENT_TELEMETRY_VERSION) {
            const banner = document.getElementById('telemetryUpdateBanner');
            const text = document.getElementById('telemetryUpdateText');
            const link = document.getElementById('telemetryUpdateLink');
            if (text) text.textContent = `🆕 Neues Web-Fahrpult Update verfügbar: v${latest} (Du nutzt aktuell v${CURRENT_TELEMETRY_VERSION})`;
            if (link && rel.html_url) link.href = rel.html_url;
            if (banner) banner.style.display = 'flex';
        }
    } catch (e) { /* Offline / Rate-Limit ignorieren */ }
})();
