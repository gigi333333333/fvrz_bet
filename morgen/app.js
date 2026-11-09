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
  autoRoutine: true, speechOn: true, palette: 'morgenroete', preset: 'standard',
  collapsed: {}
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

/* ---------- UI: Paletten ---------- */
const PALETTES = [
  { id: 'morgenroete', name: 'Morgenröte', theme: '#14151F', c: ['#FF8A5B', '#2B2E45', '#FFD166'] },
  { id: 'nachtblau', name: 'Nachtblau', theme: '#0B0E22', c: ['#7C8CFF', '#1C2247', '#6EE7C8'] },
  { id: 'salbei', name: 'Salbei', theme: '#F6F5F1', c: ['#2F6B57', '#E3ECE6', '#E8894A'] },
  { id: 'mono', name: 'Mono', theme: '#000000', c: ['#FFFFFF', '#1C1C1E', '#FF9F0A'] }
];
function applyPalette() {
  const p = PALETTES.find(x => x.id === settings.palette) || PALETTES[0];
  document.documentElement.dataset.palette = p.id;
  document.querySelector('meta[name=theme-color]').content = p.theme;
  $('palettes').innerHTML = PALETTES.map(x => `
    <li class="row tap ${x.id === p.id ? 'on' : ''}" data-id="${x.id}">
      <span class="radio"></span>
      <span class="grow">${x.name}</span>
      <span class="swatches">${x.c.map(c => `<b style="background:${c}" title="${c}"></b>`).join('')}</span>
    </li>`).join('');
}
$('palettes').addEventListener('click', e => {
  const li = e.target.closest('li'); if (!li) return;
  settings.palette = li.dataset.id; store.set('settings', settings); applyPalette();
});

/* ---------- UI: Einstellungen ---------- */
function saveSettings() { store.set('settings', settings); renderAll(); }

// Segment-Buttons
document.querySelectorAll('.seg[data-key]').forEach(seg => {
  const key = seg.dataset.key, num = seg.hasAttribute('data-num');
  seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    settings[key] = num ? Number(b.dataset.v) : b.dataset.v;
    if (key !== 'mode') settings.preset = 'custom';
    saveSettings();
  });
});
function renderSegs() {
  document.querySelectorAll('.seg[data-key]').forEach(seg =>
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(settings[seg.dataset.key]) === b.dataset.v)));
}

// Felder & Schalter
[['leaveTime', 'leaveTime'], ['wakeTime', 'wakeTime'], ['autoRoutine', 'autoRoutine'], ['speechOn', 'speechOn']].forEach(([id, key]) => {
  const el = $(id);
  if (el.type === 'checkbox') el.checked = settings[key]; else el.value = settings[key];
  el.addEventListener('change', () => { settings[key] = el.type === 'checkbox' ? el.checked : el.value; saveSettings(); });
});

// Wecktöne
const SOUND_NAMES = { sunrise: ['Sonnenaufgang', 'Marimba, aufsteigend'], birds: ['Morgenglocken', 'Hell und ruhig'], pulse: ['Sanfter Puls', 'Rhythmisch, weich'] };
const PLAY_ICON = '<svg viewBox="0 0 10 10"><path d="M2 1l7 4-7 4z"/></svg>';
function renderSounds() {
  $('soundList').innerHTML = Object.entries(SOUND_NAMES).map(([id, [n, sub]]) => `
    <li class="row tap ${settings.sound === id ? 'on' : ''}" data-id="${id}">
      <span class="radio"></span>
      <span class="grow">${n}</span>
      <button class="play" data-play="${id}" aria-label="${n} anhören">${PLAY_ICON}</button>
    </li>`).join('');
}
$('soundList').addEventListener('click', e => {
  const play = e.target.closest('[data-play]');
  if (play) { playMelody(play.dataset.play, 1.5, 5); return; }
  const li = e.target.closest('li'); if (!li) return;
  settings.sound = li.dataset.id; settings.preset = 'custom'; saveSettings();
});

function renderSummary() {
  const leaveFix = settings.mode === 'leave';
  $('sumWake').classList.toggle('hidden', !leaveFix);
  $('wakeTime').classList.toggle('hidden', leaveFix);
  $('leaveTime').classList.toggle('hidden', !leaveFix);
  $('sumLeave').classList.toggle('hidden', leaveFix);
  $('sumWake').textContent = fromMin(wakeMin());
  $('sumLeave').textContent = fromMin(leaveMin());
  $('sumTotal').textContent = totalMin() + ' Min';
  $('timeline').innerHTML = steps.map(s => `<i style="flex:${s.min}"></i>`).join('');
  const w = wakeMin();
  $('bedtimes').innerHTML = [6, 5, 4].map((c, i) =>
    `<div class="bubble ${i === 0 ? 'rec' : ''}"><strong>${fromMin(w - c * 90 - 15)}</strong><span>${(c * 1.5).toString().replace('.', ',')} h</span></div>`).join('');
  const d = new Date();
  $('today').textContent = d.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' });
  $('routineMeta').textContent = `${totalMin()} Min`;
}

/* ---------- Aufsteh-Presets ---------- */
const PRESETS = [
  { id: 'sanft', icon: '🌙', name: 'Sanft', set: { sound: 'birds', fadeSec: 120, dawnMin: 30, snooze: 0 } },
  { id: 'standard', icon: '🌅', name: 'Standard', set: { sound: 'sunrise', fadeSec: 60, dawnMin: 10, snooze: 0 } },
  { id: 'tief', icon: '⚡', name: 'Tiefschläfer', set: { sound: 'pulse', fadeSec: 30, dawnMin: 20, snooze: 5 } },
  { id: 'winter', icon: '❄️', name: 'Winter', set: { sound: 'sunrise', fadeSec: 60, dawnMin: 30, snooze: 0 } }
];
const FADE_TXT = { 30: '30 s', 60: '1 min', 120: '2 min' };
function renderPresets() {
  $('presets').innerHTML = PRESETS.map(p => `
    <button class="preset ${settings.preset === p.id ? 'on' : ''}" data-id="${p.id}"><span class="p-ico">${p.icon}</span><span>${p.name}</span></button>`).join('') +
    `<button class="preset wide ${settings.preset === 'custom' ? 'on' : ''}" data-id="custom"><span class="p-ico">🎚️</span><span>Individuell</span></button>`;
  const custom = settings.preset === 'custom';
  $('customBox').classList.toggle('hidden', !custom);
  $('presetSum').textContent = custom ? '' :
    `${SOUND_NAMES[settings.sound][0]} · ${FADE_TXT[settings.fadeSec] || settings.fadeSec + ' s'} · Licht ${settings.dawnMin ? settings.dawnMin + ' min' : 'aus'} · ${settings.snooze ? 'Schlummern ' + settings.snooze + ' min' : 'kein Schlummern'}`;
}
$('presets').addEventListener('click', e => {
  const b = e.target.closest('.preset'); if (!b) return;
  const p = PRESETS.find(x => x.id === b.dataset.id);
  settings.preset = b.dataset.id;
  if (p) Object.assign(settings, p.set);
  saveSettings();
});

/* ---------- Einklappbare Bereiche ---------- */
function renderSections() {
  document.querySelectorAll('.sec-head').forEach(h => {
    const closed = !!settings.collapsed[h.dataset.sec];
    h.classList.toggle('closed', closed);
    h.setAttribute('aria-expanded', String(!closed));
    $('sec-' + h.dataset.sec).classList.toggle('closed', closed);
  });
  const p = PRESETS.find(x => x.id === settings.preset);
  $('peek-aufstehen').textContent = p ? p.icon + ' ' + p.name : '🎚️ Individuell';
  $('peek-bett').textContent = fromMin(wakeMin() - 6 * 90 - 15);
}
document.querySelectorAll('.sec-head').forEach(h => h.addEventListener('click', () => {
  settings.collapsed = { ...settings.collapsed, [h.dataset.sec]: !settings.collapsed[h.dataset.sec] };
  store.set('settings', settings);
  renderSections();
}));

function renderAll() { renderSections(); renderPresets(); renderSegs(); renderSounds(); renderSummary(); renderSteps(); }

// Tabs
document.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tabbar button').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
  window.scrollTo(0, 0);
}));

$('testSpeech').addEventListener('click', () => {
  const s = steps[1] || steps[0];
  say(s ? `Halbzeit: ${s.name}. Noch ${spokenDuration(s.min * 30)}.` : 'Test');
});

/* ---------- UI: Routine bearbeiten ---------- */
function saveSteps() { store.set('steps', steps); renderSummary(); renderSteps(); }

function renderSteps() {
  let t = wakeMin();
  const rows = steps.map((s, i) => {
    const row = `<li class="row" data-i="${i}">
      <span class="t">${fromMin(t)}</span>
      <span class="grow"></span><span class="pill">${s.min}′</span>
      <span class="grip" aria-label="Verschieben"><svg viewBox="0 0 24 24"><path d="M5 9h14M5 15h14"/></svg></span></li>`;
    t += s.min; return row;
  }).join('');
  $('steps').innerHTML =
    `<li class="row marker"><span class="t">${fromMin(wakeMin())}</span><span class="grow">⏰ Aufstehen</span></li>` + rows +
    `<li class="row marker"><span class="t">${fromMin(leaveMin())}</span><span class="grow">🚪 Aus dem Haus</span></li>`;
  // Namen sicher als Text einsetzen
  $('steps').querySelectorAll('li[data-i]').forEach(li => { li.querySelector('.grow').textContent = steps[+li.dataset.i].name; });
}

/* Schritte per Griff verschieben (Maus & Touch) */
let drag = null;
$('steps').addEventListener('pointerdown', e => {
  const grip = e.target.closest('.grip'); if (!grip) return;
  e.preventDefault();
  const li = grip.closest('li');
  const items = [...$('steps').querySelectorAll('li[data-i]')];
  const from = items.indexOf(li);
  drag = { li, items, from, to: from, y0: e.clientY, rects: items.map(x => x.getBoundingClientRect()) };
  grip.setPointerCapture(e.pointerId);
  li.classList.add('dragging');
  $('steps').classList.add('sorting');
  if (navigator.vibrate) navigator.vibrate(10);
});
$('steps').addEventListener('pointermove', e => {
  if (!drag) return;
  const { li, items, from, rects } = drag;
  const dy = e.clientY - drag.y0;
  li.style.transform = `translateY(${dy}px)`;
  const center = rects[from].top + rects[from].height / 2 + dy;
  let to = from;
  rects.forEach((r, i) => {
    const mid = r.top + r.height / 2;
    if (i < from && center < mid) to = Math.min(to, i);
    if (i > from && center > mid) to = Math.max(to, i);
  });
  if (to !== drag.to && navigator.vibrate) navigator.vibrate(5);
  drag.to = to;
  const h = rects[from].height;
  items.forEach((x, i) => {
    if (i === from) return;
    const shift = (from < to && i > from && i <= to) ? -h : (from > to && i >= to && i < from) ? h : 0;
    x.style.transform = shift ? `translateY(${shift}px)` : '';
  });
});
function endDrag() {
  if (!drag) return;
  const { from, to } = drag;
  drag = null;
  $('steps').classList.remove('sorting');
  if (from !== to) { const [m] = steps.splice(from, 1); steps.splice(to, 0, m); }
  saveSteps();
}
$('steps').addEventListener('pointerup', endDrag);
$('steps').addEventListener('pointercancel', endDrag);

// Bottom-Sheet
const sheet = $('sheet');
let editIdx = -1, sheetMin = 5;
function openSheet(i) {
  editIdx = i;
  const s = steps[i] || { name: '', min: 5 };
  $('sheetTitle').textContent = i < 0 ? 'Neu' : 'Bearbeiten';
  $('sheetName').value = s.name;
  sheetMin = s.min; $('sheetMin').textContent = sheetMin;
  $('sheetDel').classList.toggle('hidden', i < 0);
  sheet.showModal();
}
$('steps').addEventListener('click', e => {
  if (e.target.closest('.grip')) return;
  const li = e.target.closest('li[data-i]'); if (li) openSheet(+li.dataset.i);
});
$('addStep').addEventListener('click', () => openSheet(-1));
sheet.querySelectorAll('.stepper button').forEach(b => b.addEventListener('click', () => {
  sheetMin = Math.min(120, Math.max(1, sheetMin + Number(b.dataset.d)));
  $('sheetMin').textContent = sheetMin;
}));
$('sheetForm').addEventListener('submit', () => {
  const name = $('sheetName').value.trim(); if (!name) return;
  if (editIdx < 0) steps.push({ name, min: sheetMin }); else Object.assign(steps[editIdx], { name, min: sheetMin });
  saveSteps();
});
$('sheetDel').addEventListener('click', () => { steps.splice(editIdx, 1); sheet.close(); saveSteps(); });
sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); }); // Tippen auf Hintergrund schliesst

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
  $('snoozeBtn').textContent = `+${settings.snooze} min`;
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
  $('armedIn').textContent = left > 0 ? `${h} h ${m} min` : '';
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
  say(late > 60000 ? `Fertig. Los geht's, du bist ${Math.round(late / 60000)} Minuten spät dran.` : 'Zeit, aus dem Haus zu gehen. Schönen Tag!');
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
  $('runStepNo').textContent = `${run.idx + 1}/${run.steps.length}` + (run.paused ? ' · Pause' : '');
  $('runName').textContent = s.name;
  $('runRemaining').textContent = fmtMMSS(remMs / 1000);
  $('runBar').style.strokeDashoffset = (553 * (e / run.dur)).toFixed(1);
  $('runNext').textContent = next ? `→ ${next.name}` : '→ Los!';
  const restMs = run.steps.slice(run.idx + 1).reduce((a, x) => a + x.min * 60000, 0);
  const est = now + remMs + restMs;
  const late = est - run.plannedLeave > 30000;
  $('runLeavePlan').textContent = fmtClock(new Date(run.plannedLeave));
  const estEl = $('runLeaveEst');
  estEl.textContent = fmtClock(new Date(est));
  estEl.className = late ? 'late' : 'ok';
  $('runBar').classList.toggle('late', late);
  $('runRemaining').classList.toggle('late', late);
  $('runPause').textContent = run.paused ? '▶' : '❚❚';
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
  $('armedClock').textContent = fmtClock(d);
  $('ringClock').textContent = fmtClock(d);
  tickAlarm(now);
  tickRun(now);
}
setInterval(tick, 250);

applyPalette();
renderAll();
tick();

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
