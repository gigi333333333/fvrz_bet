'use strict';

/* ---------- Speicher ---------- */
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem('mp.' + key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('mp.' + key, JSON.stringify(value)); } catch { /* privat-Modus */ }
  }
};

const DEFAULT_STEPS = [
  { name: 'Aufstehen, Licht & Wasser', min: 3 },
  { name: 'Duschen', min: 5 },
  { name: 'Anziehen', min: 5 },
  { name: 'Frühstück', min: 10 },
  { name: 'Zähne & Frischmachen', min: 10 },
  { name: 'Tasche & Schuhe', min: 3 }
];
const DEFAULT_SETTINGS = {
  mode: 'leave', leaveTime: '07:15', wakeTime: '06:30',
  sound: 'sunrise', fadeSec: 60, dawnMin: 10, snooze: 0,
  autoRoutine: true, speechOn: true
};

let steps = store.get('steps', DEFAULT_STEPS);
let settings = Object.assign({}, DEFAULT_SETTINGS, store.get('settings', {}));

const $ = id => document.getElementById(id);

/* ---------- Zeit-Helfer ---------- */
const pad = n => String(n).padStart(2, '0');
const fmtClock = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
const toMin = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const fromMin = m => { m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
const totalMin = () => steps.reduce((s, x) => s + x.min, 0);
const fmtMMSS = sec => { const s = Math.max(0, Math.ceil(sec)); return Math.floor(s / 60) + ':' + pad(s % 60); };

function spokenDuration(sec) {
  sec = Math.round(sec);
  const m = Math.floor(sec / 60), s = sec % 60;
  const parts = [];
  if (m) parts.push(m === 1 ? 'eine Minute' : m + ' Minuten');
  if (s) parts.push(s + ' Sekunden');
  return parts.join(' und ') || 'null Sekunden';
}

function wakeMin() {
  return settings.mode === 'leave' ? toMin(settings.leaveTime) - totalMin() : toMin(settings.wakeTime);
}
function leaveMin() {
  return settings.mode === 'leave' ? toMin(settings.leaveTime) : toMin(settings.wakeTime) + totalMin();
}
function nextOccurrence(minOfDay) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(minOfDay / 60), minOfDay % 60, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 1);
  return d;
}

/* ---------- Audio ---------- */
let ctx = null, master = null, keepAlive = null;
function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// Ein unhörbarer Ton verhindert, dass der Browser den Audio-Kontext schlafen legt.
function startKeepAlive() {
  audio();
  if (keepAlive) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  g.gain.value = 0.0001;
  o.connect(g).connect(ctx.destination);
  o.start();
  keepAlive = o;
}
function stopKeepAlive() { if (keepAlive) { keepAlive.stop(); keepAlive = null; } }

const NOTE = n => 440 * Math.pow(2, (n - 69) / 12); // MIDI -> Hz

function marimba(t, freq, vel = 1) {
  [[1, 1, 1.4], [4, 0.25, 0.25], [10, 0.08, 0.08]].forEach(([mult, amp, dec]) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq * mult;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp * vel * 0.5, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    o.connect(g).connect(master); o.start(t); o.stop(t + dec + 0.05);
  });
}
function bell(t, freq, vel = 1) {
  [[1, 1, 3], [2.76, 0.4, 1.6], [5.4, 0.2, 0.8], [8.93, 0.1, 0.4]].forEach(([mult, amp, dec]) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq * mult;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp * vel * 0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    o.connect(g).connect(master); o.start(t); o.stop(t + dec + 0.05);
  });
}
function soft(t, freq, vel = 1) {
  const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'triangle'; o.frequency.value = freq;
  f.type = 'lowpass'; f.frequency.value = 2200;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.45 * vel, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  o.connect(f).connect(g).connect(master); o.start(t); o.stop(t + 0.5);
}

// Melodien: aufsteigend, klar erkennbar, 100–120 BPM (vgl. McFarlane et al. 2020)
const SOUNDS = {
  sunrise: { voice: marimba, step: 60 / 112 / 2, // Achtel bei 112 BPM
    notes: [72, 74, 76, 79, 81, 84, 81, 79, 74, 76, 79, 81, 84, 86, 88, null] },
  birds: { voice: bell, step: 60 / 100,
    notes: [76, 79, 84, 83, 79, 81, 88, null] },
  pulse: { voice: soft, step: 60 / 120 / 2,
    notes: [67, 72, null, 72, 67, 74, null, 76, 67, 72, null, 79, 76, 74, 72, null] }
};

let player = null;
function playMelody(name, fadeSec, durationSec) {
  stopMelody();
  audio();
  const s = SOUNDS[name] || SOUNDS.sunrise;
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(0.03, now);
  master.gain.linearRampToValueAtTime(1, now + fadeSec);
  let next = now + 0.1, i = 0;
  const timer = setInterval(() => {
    while (next < ctx.currentTime + 0.3) {
      const n = s.notes[i % s.notes.length];
      if (n !== null) s.voice(next, NOTE(n), i % 4 === 0 ? 1 : 0.8);
      next += s.step; i++;
    }
  }, 50);
  player = { timer };
  if (durationSec) player.end = setTimeout(stopMelody, durationSec * 1000);
}
function stopMelody() {
  if (!player) return;
  clearInterval(player.timer); clearTimeout(player.end);
  if (ctx) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(0, ctx.currentTime, 0.05); }
  player = null;
}

// kurzer Hinweiston vor jeder Durchsage
function chime() {
  audio();
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(0.8, t);
  marimba(t, NOTE(79)); marimba(t + 0.16, NOTE(84));
}

/* ---------- Sprache ---------- */
let voice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices();
  voice = vs.find(v => v.lang === 'de-CH') || vs.find(v => v.lang === 'de-DE') || vs.find(v => v.lang.startsWith('de')) || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

function say(text) {
  if (!settings.speechOn) return;
  chime();
  if (!('speechSynthesis' in window)) return;
  setTimeout(() => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice ? voice.lang : 'de-DE';
    if (voice) u.voice = voice;
    u.rate = 1; u.volume = 1;
    speechSynthesis.speak(u);
  }, 450);
}

/* ---------- Bildschirm wach halten ---------- */
let wakeLock = null;
async function lockScreen() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } }
  catch { /* nicht unterstützt */ }
}
function unlockScreen() { if (wakeLock) { wakeLock.release(); wakeLock = null; } }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (alarm.armed || run)) lockScreen();
});

/* ---------- UI: Einstellungen ---------- */
function saveSettings() { store.set('settings', settings); renderSummary(); }

function bindSetting(id, key, parse = v => v) {
  const el = $(id);
  if (el.type === 'checkbox') el.checked = settings[key]; else el.value = settings[key];
  el.addEventListener('change', () => {
    settings[key] = el.type === 'checkbox' ? el.checked : parse(el.value);
    saveSettings();
  });
}
bindSetting('mode', 'mode');
bindSetting('leaveTime', 'leaveTime');
bindSetting('wakeTime', 'wakeTime');
bindSetting('sound', 'sound');
bindSetting('fadeSec', 'fadeSec', Number);
bindSetting('dawnMin', 'dawnMin', Number);
bindSetting('snooze', 'snooze', Number);
bindSetting('autoRoutine', 'autoRoutine');
bindSetting('speechOn', 'speechOn');

function renderSummary() {
  $('leaveRow').classList.toggle('hidden', settings.mode !== 'leave');
  $('wakeRow').classList.toggle('hidden', settings.mode !== 'wake');
  $('sumWake').textContent = fromMin(wakeMin());
  $('sumLeave').textContent = fromMin(leaveMin());
  $('sumTotal').textContent = totalMin() + ' Min';
  const w = wakeMin();
  $('bedtimes').innerHTML = [6, 5, 4].map(c =>
    `<span class="chip"><b>${fromMin(w - c * 90 - 15)}</b> · ${c} Zyklen (${(c * 1.5).toString().replace('.', ',')} h)</span>`
  ).join('');
}

document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
}));

$('preview').addEventListener('click', () => playMelody(settings.sound, 2, 5));
$('testSpeech').addEventListener('click', () => {
  const s = steps[1] || steps[0];
  say(s ? `Halbzeit: ${s.name}. Noch ${spokenDuration(s.min * 30)}.` : 'Test');
});

/* ---------- UI: Routine bearbeiten ---------- */
function saveSteps() { store.set('steps', steps); renderSteps(); renderSummary(); }

function renderSteps() {
  const list = $('steps');
  list.innerHTML = '';
  let t = settings.mode === 'leave' ? wakeMin() : toMin(settings.wakeTime);
  steps.forEach((s, i) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="t">${fromMin(t)}</span>
      <span class="name"><input value="" maxlength="40" aria-label="Name"></span>
      <input class="min" type="number" min="1" max="120" aria-label="Minuten">
      <button class="icon" data-a="up" aria-label="nach oben">↑</button>
      <button class="icon" data-a="del" aria-label="löschen">✕</button>`;
    const [nameIn, minIn] = li.querySelectorAll('input');
    nameIn.value = s.name; minIn.value = s.min;
    nameIn.addEventListener('change', () => { s.name = nameIn.value.trim() || s.name; saveSteps(); });
    minIn.addEventListener('change', () => { s.min = Math.min(120, Math.max(1, Math.round(+minIn.value) || 1)); saveSteps(); });
    li.querySelector('[data-a=up]').addEventListener('click', () => { if (i > 0) { [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]]; saveSteps(); } });
    li.querySelector('[data-a=del]').addEventListener('click', () => { steps.splice(i, 1); saveSteps(); });
    list.appendChild(li);
    t += s.min;
  });
}
$('addForm').addEventListener('submit', e => {
  e.preventDefault();
  steps.push({ name: $('newName').value.trim(), min: Math.min(120, Math.max(1, +$('newMin').value || 5)) });
  $('newName').value = '';
  saveSteps();
});
$('mode').addEventListener('change', renderSteps);
$('leaveTime').addEventListener('change', renderSteps);
$('wakeTime').addEventListener('change', renderSteps);

/* ---------- Wecker ---------- */
const alarm = { armed: false, target: null, ringing: false, plannedLeave: null };

function armAlarm() {
  if (!steps.length && settings.mode === 'leave') { alert('Bitte zuerst mindestens einen Schritt in der Routine anlegen.'); return; }
  startKeepAlive();
  if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance('')); // Sprache freischalten (iOS)
  const target = nextOccurrence(((wakeMin() % 1440) + 1440) % 1440);
  alarm.armed = true;
  alarm.target = target.getTime();
  alarm.plannedLeave = target.getTime() + totalMin() * 60000;
  $('armedWake').textContent = fmtClock(target);
  $('armedView').classList.remove('hidden');
  lockScreen();
}
function disarm() {
  alarm.armed = false; alarm.ringing = false;
  stopMelody(); stopKeepAlive(); unlockScreen();
  $('dawn').style.opacity = 0;
  $('armedView').classList.add('hidden');
  $('ringView').classList.add('hidden');
}
function ring() {
  alarm.ringing = true;
  $('dawn').style.opacity = 1;
  $('armedView').classList.add('hidden');
  $('ringView').classList.remove('hidden');
  $('snoozeBtn').classList.toggle('hidden', !settings.snooze);
  $('snoozeBtn').textContent = `${settings.snooze} Min. schlummern (fehlen dann in der Routine)`;
  playMelody(settings.sound, settings.fadeSec);
  if (navigator.vibrate) navigator.vibrate([400, 200, 400]);
}
$('arm').addEventListener('click', armAlarm);
$('disarm').addEventListener('click', disarm);
$('stopAlarm').addEventListener('click', () => {
  const leave = alarm.plannedLeave;
  disarm();
  if (settings.autoRoutine && steps.length) startRoutine(leave);
});
$('snoozeBtn').addEventListener('click', () => {
  stopMelody();
  alarm.ringing = false;
  alarm.target = Date.now() + settings.snooze * 60000;
  $('ringView').classList.add('hidden');
  $('dawn').style.opacity = 0.35;
  $('armedWake').textContent = fmtClock(new Date(alarm.target));
  $('armedView').classList.remove('hidden');
});

function tickAlarm(now) {
  if (!alarm.armed || alarm.ringing) return;
  const left = alarm.target - now;
  const dawnMs = settings.dawnMin * 60000;
  if (dawnMs && left <= dawnMs) {
    const p = 1 - left / dawnMs;
    $('dawn').style.opacity = (p * p).toFixed(3); // langsam beginnend, dann heller
  }
  const h = Math.floor(left / 3600000), m = Math.ceil((left % 3600000) / 60000);
  $('armedIn').textContent = left > 0 ? `in ${h} h ${m} min` : '';
  if (left <= 0) ring();
}

/* ---------- Routine ausführen ---------- */
let run = null;

function startRoutine(plannedLeave) {
  if (!steps.length) return;
  audio();
  const now = Date.now();
  run = {
    steps: steps.map(s => ({ ...s })),
    idx: -1,
    plannedLeave: plannedLeave || now + totalMin() * 60000,
    paused: null
  };
  $('runView').classList.remove('hidden');
  lockScreen();
  goToStep(0, now);
}

function goToStep(i, now, announce = true) {
  run.idx = i;
  if (i >= run.steps.length) { finishRoutine(); return; }
  const s = run.steps[i];
  run.start = now;
  run.dur = s.min * 60000;
  run.saidHalf = s.min < 2;     // zu kurz für Halbzeit
  run.saidOne = s.min <= 2;     // bei 2 Min. fällt „Halbzeit“ auf „noch 1 Minute“
  if (announce) {
    const prev = run.steps[i - 1];
    const intro = prev ? `${prev.name} ist vorbei. ` : '';
    say(`${intro}Jetzt: ${s.name}, ${spokenDuration(s.min * 60)}.`);
  }
  renderRun(now);
}

function finishRoutine() {
  const late = Date.now() - run.plannedLeave;
  say(late > 60000 ? `Fertig. Los geht's, du bist ${Math.round(late / 60000)} Minuten spät dran.` : 'Fertig. Zeit zu gehen. Schönen Tag!');
  run = null;
  stopKeepAlive(); unlockScreen();
  $('runView').classList.add('hidden');
}

function elapsed(now) { return (run.paused ?? now) - run.start; }

function tickRun(now) {
  if (!run || run.paused) { if (run) renderRun(now); return; }
  // nach Hintergrund-Pausen ggf. mehrere Schritte nachholen
  let advanced = false;
  while (run && elapsed(now) >= run.dur) {
    const overflow = elapsed(now) - run.dur;
    const nextIdx = run.idx + 1;
    if (nextIdx >= run.steps.length) { finishRoutine(); return; }
    goToStep(nextIdx, now - overflow, false);
    advanced = true;
  }
  if (advanced) {
    const s = run.steps[run.idx], prev = run.steps[run.idx - 1];
    say(`${prev.name} ist vorbei. Jetzt: ${s.name}, ${spokenDuration((run.dur - elapsed(now)) / 1000)}.`);
  }
  const s = run.steps[run.idx];
  const e = elapsed(now), rem = (run.dur - e) / 1000;
  if (!run.saidHalf && e >= run.dur / 2) {
    run.saidHalf = true;
    if (e - run.dur / 2 < 20000) say(`Halbzeit: ${s.name}. Noch ${spokenDuration(Math.round(rem / 5) * 5)}.`);
  }
  if (!run.saidOne && rem <= 60) {
    run.saidOne = true;
    if (rem > 40) say(`${s.name}: noch eine Minute.`);
  }
  renderRun(now);
}

function renderRun(now) {
  if (!run) return;
  const s = run.steps[run.idx], next = run.steps[run.idx + 1];
  const e = elapsed(now), remMs = run.dur - e;
  $('runStepNo').textContent = `Schritt ${run.idx + 1} von ${run.steps.length}` + (run.paused ? ' · pausiert' : '');
  $('runName').textContent = s.name;
  $('runRemaining').textContent = fmtMMSS(remMs / 1000);
  $('runBar').style.strokeDashoffset = (553 * (e / run.dur)).toFixed(1);
  $('runNext').textContent = next ? `Danach: ${next.name} (${next.min} Min.)` : 'Danach: aus dem Haus!';
  const restMs = run.steps.slice(run.idx + 1).reduce((a, x) => a + x.min * 60000, 0);
  const est = now + remMs + restMs;
  const late = est - run.plannedLeave > 30000;
  $('runLeavePlan').textContent = fmtClock(new Date(run.plannedLeave));
  const estEl = $('runLeaveEst');
  estEl.textContent = fmtClock(new Date(est));
  estEl.className = late ? 'late' : 'ok';
  $('runBar').classList.toggle('late', late);
  $('runRemaining').classList.toggle('late', late);
  $('runPause').textContent = run.paused ? 'Weiter' : 'Pause';
}

$('startNow').addEventListener('click', () => {
  startKeepAlive();
  const planned = settings.mode === 'leave' ? nextOccurrence(toMin(settings.leaveTime)).getTime() : null;
  // Liegt die geplante Abfahrt mehr als 3 h entfernt, gilt: jetzt + Routinedauer
  startRoutine(planned && planned - Date.now() < 3 * 3600000 ? planned : null);
});
$('runDone').addEventListener('click', () => {
  if (!run) return;
  const now = Date.now();
  if (run.paused) { run.paused = null; }
  goToStep(run.idx + 1, now);
});
$('runPause').addEventListener('click', () => {
  if (!run) return;
  const now = Date.now();
  if (run.paused) { run.start += now - run.paused; run.paused = null; }
  else run.paused = now;
  renderRun(now);
});
$('runStop').addEventListener('click', () => {
  if (!confirm('Routine wirklich abbrechen?')) return;
  run = null; stopKeepAlive(); unlockScreen();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  $('runView').classList.add('hidden');
});

/* ---------- Haupttakt ---------- */
function tick() {
  const now = Date.now(), d = new Date(now);
  $('clock').textContent = fmtClock(d);
  $('armedClock').textContent = fmtClock(d);
  $('ringClock').textContent = fmtClock(d);
  tickAlarm(now);
  tickRun(now);
}
setInterval(tick, 250);

renderSummary();
renderSteps();
tick();

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
