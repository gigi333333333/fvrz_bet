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

const DEFAULT_STEPS_EN = [
  { name: 'Get up, light & water', min: 3 },
  { name: 'Shower', min: 5 },
  { name: 'Get dressed', min: 5 },
  { name: 'Breakfast', min: 10 },
  { name: 'Teeth & freshen up', min: 10 },
  { name: 'Bag & shoes', min: 3 }
];
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
  autoRoutine: true, speechOn: true, lang: '', name: '', lockedIn: false, voiceURI: '', rate: 1, palette: 'morgenroete', preset: 'standard',
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
  if (m) parts.push(m === 1 ? t('eine Minute') : t('{n} Minuten', { n: m }));
  if (s) parts.push(t('{n} Sekunden', { n: s }));
  return parts.join(t(' und ')) || t('null Sekunden');
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
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  return ctx;
}

/* iOS & Co.: Ton und Sprache beim ersten Antippen freischalten.
   Ohne das bleiben spätere Durchsagen stumm, und der Lautlos-Schalter würde Web-Audio stummschalten. */
const SILENT_WAV = (() => {
  const n = 800, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, str) => [...str].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
})();
const clipEl = new Audio();       // ein gemeinsames Audio-Element für eigene Aufnahmen
clipEl.setAttribute('playsinline', '');
let unlocked = false;
function unlockAudio() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* nur neuere Safari */ }
  audio();
  if (unlocked) return;
  unlocked = true;
  clipEl.src = SILENT_WAV;
  clipEl.play().catch(() => { unlocked = false; });
  if ('speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  }
}
['touchend', 'click'].forEach(ev => document.addEventListener(ev, unlockAudio, true));
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
function germanVoices() {
  const pref = LANG === 'en' ? ['en-GB', 'en-US'] : ['de-CH', 'de-DE'];
  const order = l => { const i = pref.indexOf(l.replace('_', '-')); return i < 0 ? 9 : i; };
  return speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith(LANG))
    .sort((a, b) => order(a.lang) - order(b.lang) || a.name.localeCompare(b.name));
}
function pickVoice() {
  const vs = germanVoices();
  voice = vs.find(v => v.voiceURI === settings.voiceURI) || vs[0] || null;
  renderVoices();
}
function regionName(lang) {
  const r = lang.split(/[-_]/)[1];
  try { return r ? new Intl.DisplayNames([LANG], { type: 'region' }).of(r.toUpperCase()) : lang; } catch { return lang; }
}
function renderVoices() {
  const sel = document.getElementById('voiceSel'); if (!sel) return;
  const vs = germanVoices();
  sel.innerHTML = vs.length
    ? vs.map(v => `<option value="${v.voiceURI.replace(/"/g, '&quot;')}">${v.name.replace(/</g, '&lt;')} (${regionName(v.lang)})</option>`).join('')
    : `<option value="">${t('Keine passende Stimme gefunden')}</option>`;
  sel.value = voice ? voice.voiceURI : '';
  sel.disabled = !vs.length;
}
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = pickVoice;

function say(text) {
  if (!settings.speechOn) return;
  chime();
  speak(text);
}
function speak(text, delay = 450) {
  if (!('speechSynthesis' in window)) return;
  const go = () => {
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice ? voice.lang : (LANG === 'en' ? 'en-US' : 'de-DE');
    try { if (voice) u.voice = voice; } catch { /* Stimme nicht verfügbar: Standardstimme */ }
    u.rate = settings.rate || 1; u.volume = 1;
    speechSynthesis.speak(u);
  };
  // Direkt nach einem Antippen ohne Verzögerung sprechen (iOS verlangt das)
  if (delay) setTimeout(go, delay); else go();
}
// Für Test-Knöpfe: sofort sprechen, noch innerhalb des Antippens
function sayNow(text) {
  if (!('speechSynthesis' in window)) { alert(t('Dieser Browser unterstützt keine Sprachausgabe.')); return; }
  speak(text, 0);
}
// Eigene Aufnahme abspielen, sonst Computerstimme
function announce(kind, text) {
  if (!settings.speechOn) return;
  chime();
  if (!clips[kind]) { speak(text); return; }
  playClip(kind, 0.45).then(ok => { if (!ok) speak(text); });
}

/* ---------- Eigene Aufnahmen ---------- */
const CLIP_DEFS = [
  { id: 'half', name: 'Halbzeit' },
  { id: 'one', name: 'Noch 1 Minute' },
  { id: 'leave', name: 'Zeit, aus dem Haus zu gehen' }
];
const clips = {};          // id -> { blob, buf }
let rec = null;            // laufende Aufnahme
let micFailed = !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

const clipStore = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('morgenplan', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('clips');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const run = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction('clips', mode);
      const req = fn(t.objectStore('clips'));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
    });
  };
  return {
    get: k => run('readonly', st => st.get(k)).catch(() => null),
    set: (k, v) => run('readwrite', st => st.put(v, k)).catch(() => {}),
    del: k => run('readwrite', st => st.delete(k)).catch(() => {})
  };
})();

async function loadClips() {
  for (const d of CLIP_DEFS) { const b = await clipStore.get(d.id); if (b) clips[d.id] = { blob: b }; }
  renderClips();
}
async function saveClip(id, blob) {
  if (clips[id] && clips[id].url) URL.revokeObjectURL(clips[id].url);
  delete clipErr[id];
  clips[id] = { blob };
  await clipStore.set(id, blob);
  renderClips();
}
async function deleteClip(id) {
  delete clips[id];
  await clipStore.del(id);
  renderClips();
}
const clipErr = {};
async function playClip(id, delay = 0) {
  const c = clips[id]; if (!c) return false;
  if (!c.url) c.url = URL.createObjectURL(c.blob);
  if (delay) await new Promise(r => setTimeout(r, delay * 1000));
  // 1. Versuch: Audio-Element (spielt auch bei Lautlos-Schalter, versteht m4a/mp4/webm)
  try {
    clipEl.src = c.url;
    clipEl.currentTime = 0;
    await clipEl.play();
    delete clipErr[id];
    return true;
  } catch { /* weiter mit Web-Audio */ }
  // 2. Versuch: Web-Audio
  try {
    audio();
    if (!c.buf) c.buf = await ctx.decodeAudioData(await c.blob.arrayBuffer());
    const src = ctx.createBufferSource();
    src.buffer = c.buf;
    src.connect(ctx.destination);
    src.start();
    delete clipErr[id];
    return true;
  } catch {
    clipErr[id] = true;
    renderClips();
    return false;
  }
}
async function startRec(id) {
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { micFailed = true; renderClips(); return; }
  const mr = new MediaRecorder(stream), chunks = [];
  mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  mr.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    clearInterval(rec.tick); clearTimeout(rec.limit);
    rec = null;
    if (chunks.length) saveClip(id, new Blob(chunks, { type: mr.mimeType || 'audio/webm' })); else renderClips();
  };
  mr.start();
  rec = { id, mr, t0: Date.now() };
  rec.limit = setTimeout(() => mr.state !== 'inactive' && mr.stop(), 8000); // max. 8 Sekunden
  rec.tick = setInterval(renderClips, 250);
  renderClips();
}
function stopRec() { if (rec && rec.mr.state !== 'inactive') rec.mr.stop(); }

const ICON = {
  mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2" class="fill"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10-6.5z" class="fill"/></svg>',
  del: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7zM14 3v4h4"/></svg>'
};
function renderClips() {
  const list = document.getElementById('clips'); if (!list) return;
  list.innerHTML = CLIP_DEFS.map(d => {
    const has = !!clips[d.id], recording = rec && rec.id === d.id;
    const status = recording ? t('Aufnahme läuft · {n} s', { n: Math.floor((Date.now() - rec.t0) / 1000) }) : clipErr[d.id] ? t('Kann nicht abgespielt werden') : has ? t('Eigene Aufnahme') : t('Computerstimme');
    const main = micFailed
      ? `<label class="ibtn" aria-label="${t('Audiodatei wählen')}">${ICON.file}<input type="file" accept="audio/*" data-file="${d.id}" hidden></label>`
      : `<button class="ibtn ${recording ? 'rec' : ''}" data-rec="${d.id}" aria-label="${recording ? t('Stopp') : t('Aufnehmen')}">${recording ? ICON.stop : ICON.mic}</button>`;
    return `<li class="row clip ${has ? 'has' : ''} ${clipErr[d.id] ? 'err' : ''}">
      <span class="grow">${t(d.name)}<span class="sub">${status}</span></span>
      ${has && !recording ? `<button class="ibtn ghost" data-del="${d.id}" aria-label="${t('Löschen')}">${ICON.del}</button><button class="ibtn ghost" data-play="${d.id}" aria-label="${t('Anhören')}">${ICON.play}</button>` : ''}
      ${main}</li>`;
  }).join('');
  const hint = document.getElementById('clipHint');
  if (hint) hint.textContent = micFailed
    ? t('Das Mikrofon ist hier nicht verfügbar. Nimm die Sätze mit der Sprachmemo-App auf und wähle die Datei hier aus.')
    : t('Tippe aufs Mikrofon, sprich den Satz und tippe auf Stopp. Ohne Aufnahme spricht die Computerstimme.');
}
document.addEventListener('click', e => {
  const b = e.target.closest('#clips [data-rec], #clips [data-play], #clips [data-del]'); if (!b) return;
  if (b.dataset.rec) { if (rec) stopRec(); else startRec(b.dataset.rec); }
  else if (b.dataset.play) playClip(b.dataset.play);
  else if (b.dataset.del && confirm(t('Aufnahme löschen?'))) deleteClip(b.dataset.del);
});
document.addEventListener('change', e => {
  const inp = e.target.closest('#clips [data-file]'); if (!inp || !inp.files[0]) return;
  saveClip(inp.dataset.file, inp.files[0]);
});

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
      <span class="grow">${t(x.name)}</span>
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
    if (['fadeSec', 'dawnMin', 'snooze'].includes(key)) settings.preset = 'custom';
    if (key === 'rate') sampleVoice();
    if (key === 'lang') { setLang(b.dataset.v); return; }
    saveSettings();
  });
});
function renderSegs() {
  document.querySelectorAll('.seg[data-key]').forEach(seg =>
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(seg.dataset.key === 'lang' ? LANG : settings[seg.dataset.key]) === b.dataset.v)));
}

// Felder & Schalter
[['leaveTime', 'leaveTime'], ['wakeTime', 'wakeTime'], ['autoRoutine', 'autoRoutine'], ['speechOn', 'speechOn'], ['lockedIn', 'lockedIn']].forEach(([id, key]) => {
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
      <span class="grow">${t(n)}</span>
      <button class="play" data-play="${id}" aria-label="${t(n)}">${PLAY_ICON}</button>
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
  $('leaveBar').classList.toggle('locked', !leaveFix);
  $('sumWake').textContent = fromMin(wakeMin());
  $('sumLeave').textContent = fromMin(leaveMin());
  $('sumTotal').textContent = t('{n} Min Routine', { n: totalMin() });
  $('timeline').innerHTML = steps.map(s => `<i style="flex:${s.min}"></i>`).join('');
  const w = wakeMin();
  $('bedtimes').innerHTML = [6, 5, 4].map((c, i) =>
    `<div class="bubble ${i === 0 ? 'rec' : ''}"><strong>${fromMin(w - c * 90 - 15)}</strong><span>${(c * 1.5).toString().replace('.', ',')} h</span></div>`).join('');
  const d = new Date();
  const date = d.toLocaleDateString(LANG === 'en' ? 'en-GB' : 'de-CH', { weekday: 'long', day: 'numeric', month: 'long' });
  $('today').textContent = settings.name ? t('Hallo {name}', { name: settings.name }) + ' · ' + date : date;
  $('routineMeta').textContent = t('{n} Min', { n: totalMin() });
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
    <button class="preset ${settings.preset === p.id ? 'on' : ''}" data-id="${p.id}"><span class="p-ico">${p.icon}</span><span>${t(p.name)}</span></button>`).join('') +
    `<button class="preset wide ${settings.preset === 'custom' ? 'on' : ''}" data-id="custom"><span class="p-ico">🎚️</span><span>${t('Individuell')}</span></button>`;
  const custom = settings.preset === 'custom';
  $('customBox').classList.toggle('hidden', !custom);
  $('presetSum').textContent = custom ? '' :
    t('{sound} · Ton Beginn {fade} · Licht {light} · {snooze}', {
      sound: t(SOUND_NAMES[settings.sound][0]),
      fade: FADE_TXT[settings.fadeSec] || settings.fadeSec + ' s',
      light: settings.dawnMin ? settings.dawnMin + ' min' : t('aus'),
      snooze: settings.snooze ? t('Schlummern {n} min', { n: settings.snooze }) : t('kein Schlummern')
    });
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
  $('peek-aufstehen').textContent = (settings.lockedIn ? '🔒 ' : '') + (p ? p.icon + ' ' + t(p.name) : '🎚️ ' + t('Individuell'));
  $('peek-bett').textContent = fromMin(wakeMin() - 6 * 90 - 15);
}
document.querySelectorAll('.sec-head').forEach(h => h.addEventListener('click', () => {
  settings.collapsed = { ...settings.collapsed, [h.dataset.sec]: !settings.collapsed[h.dataset.sec] };
  store.set('settings', settings);
  renderSections();
}));

/* ---------- Stimme ---------- */
function sampleVoice() { sayNow(t('Halbzeit: Duschen. Noch zwei Minuten und dreissig Sekunden.')); }
$('voiceSel').addEventListener('change', e => {
  settings.voiceURI = e.target.value;
  store.set('settings', settings);
  pickVoice();
  sampleVoice();
});

// Am Computer öffnet ein Klick auf das Zeitfeld sonst nicht die Auswahl
$('leaveTime').addEventListener('click', e => { try { e.currentTarget.showPicker(); } catch { /* Handy öffnet selbst */ } });
$('leaveTime').addEventListener('input', e => { if (e.target.value) $('sumLeave').textContent = e.target.value; });

function renderAll() { document.body.classList.toggle('speech-off', !settings.speechOn); renderSections(); renderPresets(); renderSegs(); renderSounds(); renderSummary(); renderSteps(); }

// Tabs
document.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tabbar button').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.id === 'tab-' + b.dataset.tab));
  window.scrollTo(0, 0);
}));

$('testSpeech').addEventListener('click', () => {
  const s = steps[1] || steps[0];
  sayNow(s ? t('Halbzeit: {name}. Noch {dur}.', { name: s.name, dur: spokenDuration(s.min * 30) }) : 'Test');
});

/* ---------- UI: Routine bearbeiten ---------- */
function saveSteps() { store.set('steps', steps); renderSummary(); renderSteps(); }

function renderSteps() {
  let tm = wakeMin();
  const rows = steps.map((s, i) => {
    const row = `<li class="row" data-i="${i}">
      <span class="t">${fromMin(tm)}</span>
      <span class="grow"></span><span class="pill">${s.min}′</span>
      <span class="grip" aria-label="${t('Verschieben')}"><svg viewBox="0 0 24 24"><path d="M5 9h14M5 15h14"/></svg></span></li>`;
    tm += s.min; return row;
  }).join('');
  $('steps').innerHTML =
    `<li class="row marker"><span class="t">${fromMin(wakeMin())}</span><span class="grow">⏰ ${t('Aufstehen')}</span></li>` + rows +
    `<li class="row marker"><span class="t">${fromMin(leaveMin())}</span><span class="grow">🚪 ${t('Aus dem Haus')}</span></li>`;
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
  $('sheetTitle').textContent = i < 0 ? t('Neu') : t('Bearbeiten');
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
  if (!steps.length && settings.mode === 'leave') { alert(t('Bitte zuerst mindestens einen Schritt in der Routine anlegen.')); return; }
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
  stopLockedIn();
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
  $('hello').textContent = settings.name ? t('Guten Morgen, {name}', { name: settings.name }) : t('Guten Morgen');
  $('snoozeBtn').classList.toggle('hidden', !settings.snooze || settings.lockedIn);
  $('stopAlarm').classList.toggle('hidden', settings.lockedIn);
  $('pushBox').classList.toggle('hidden', !settings.lockedIn);
  if (settings.lockedIn) startLockedIn();
  $('snoozeBtn').textContent = `+${settings.snooze} min`;
  playMelody(settings.sound, settings.fadeSec);
  if (navigator.vibrate) navigator.vibrate([400, 200, 400]);
}
$('arm').addEventListener('click', armAlarm);
$('disarm').addEventListener('click', disarm);
function wakeDone(delay = 0) {
  const leave = alarm.plannedLeave;
  disarm();
  if (settings.autoRoutine && steps.length) setTimeout(() => startRoutine(leave), delay);
}
$('stopAlarm').addEventListener('click', () => wakeDone());

/* ---------- Locked in: Liegestütze statt Aus-Knopf ---------- */
const PUSHUPS = 15;
// Eigene Sprüche im harten Drill-Stil (keine Original-Zitate)
const LOCK_LINES = {
  de: [
    'Steh auf, verdammt! Niemand kommt, um dich zu retten.',
    'Dein Bett ist kein Versteck. Raus da!',
    'Du hast gesagt, du willst es. Dann beweis es, verdammt nochmal!',
    'Bequemlichkeit macht dich weich. Runter auf den Boden!',
    'Scheiss auf Ausreden. Fünfzehn Liegestütze. Jetzt!',
    'Während du pennst, wird jemand anderes besser. Beweg deinen Arsch!',
    'Dein Kopf will aufgeben. Dein Kopf hat hier nichts zu melden.',
    'Hör auf zu jammern und fang an zu leiden. Los!',
    'Das ist kein Vorschlag. Das ist ein verdammter Befehl!'
  ],
  en: [
    'Get up, damn it! Nobody is coming to save you.',
    'Your bed is not a hiding place. Get out!',
    'You said you wanted this. Now prove it, damn it!',
    'Comfort makes you soft. Hit the floor!',
    'Screw your excuses. Fifteen push-ups. Now!',
    'While you sleep, someone else gets better. Move your ass!',
    'Your mind wants to quit. Your mind does not get a vote.',
    'Stop whining and start suffering. Go!',
    'This is not a suggestion. This is a damn order!'
  ]
};
const LOCK_REP = {
  de: { 5: 'Das ist erst der Anfang!', 10: 'Nicht aufhören, verdammt! Noch fünf!', 14: 'Einer noch! Gib alles!' },
  en: { 5: 'That is just the warm-up!', 10: "Don't you dare stop! Five more!", 14: 'One more! Everything you got!' }
};
const LOCK_DONE = {
  de: n => `Das war's. ${n ? n + ', d' : 'D'}en Tag hast du dir verdient. Jetzt zieh durch.`,
  en: n => `That's it. ${n ? n + ', y' : 'Y'}ou earned this day. Now go get it.`
};
let lock = null;
function duck(level = 0.25, ms = 3500) {
  if (!ctx || !master) return;
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setTargetAtTime(level, now, 0.08);
  clearTimeout(lock && lock.unduck);
  if (lock) lock.unduck = setTimeout(() => { if (alarm.ringing) master.gain.setTargetAtTime(lock && lock.count ? 0.45 : 1, ctx.currentTime, 0.3); }, ms);
}
function lockSay(text, ms) { duck(0.2, ms || 3500); speak(text, 0); }
function startLockedIn() {
  lock = { count: 0, last: 0, lastRep: 0, i: Math.floor(Math.random() * 9) };
  $('pushCount').textContent = '0';
  $('pushOf').textContent = '/ ' + PUSHUPS;
  setTimeout(() => lockSay(LOCK_LINES[LANG][lock.i++ % 9]), 6000);
  lock.talk = setInterval(() => {
    // Nur anschreien, wenn gerade keine Liegestütze kommen
    if (Date.now() - lock.lastRep > 7000) lockSay(LOCK_LINES[LANG][lock.i++ % 9]);
  }, 11000);
}
function stopLockedIn() {
  if (!lock) return;
  clearInterval(lock.talk); clearTimeout(lock.unduck);
  lock = null;
}
$('pushPad').addEventListener('pointerdown', e => {
  e.preventDefault();
  if (!lock) return;
  const now = Date.now();
  if (now - lock.lastRep < 700) return;          // zu schnell: zählt nicht
  lock.lastRep = now;
  lock.count++;
  $('pushCount').textContent = lock.count;
  $('pushPad').classList.remove('hit'); void $('pushPad').offsetWidth; $('pushPad').classList.add('hit');
  if (navigator.vibrate) navigator.vibrate(40);
  if (lock.count >= PUSHUPS) {
    const name = settings.name;
    stopLockedIn();
    stopMelody();
    speak(LOCK_DONE[LANG](name), 0);
    wakeDone(5000);   // Routine erst nach dem Abschluss-Spruch starten
    return;
  }
  const extra = LOCK_REP[LANG][lock.count];
  lockSay(extra ? `${lock.count}! ${extra}` : String(lock.count), extra ? 3000 : 1200);
});
// Notfall-Aus: 5 Sekunden gedrückt halten
let emergencyTimer = null;
$('pushEmergency').addEventListener('pointerdown', () => {
  $('pushEmergency').textContent = t('Halten …');
  emergencyTimer = setTimeout(() => { stopLockedIn(); wakeDone(); }, 5000);
});
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => $('pushEmergency').addEventListener(ev, () => {
  clearTimeout(emergencyTimer);
  $('pushEmergency').textContent = t('Notfall: 5 Sekunden gedrückt halten');
}));
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
  lockScreen().then(() => $('runWarn').classList.toggle('hidden', !!wakeLock));
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
    const intro = prev ? t('{name} ist vorbei. ', { name: prev.name })
      : settings.name ? t('Guten Morgen, {name}! ', { name: settings.name }) : '';
    say(intro + t('Jetzt: {name}, {dur}.', { name: s.name, dur: spokenDuration(s.min * 60) }));
  }
  renderRun(now);
}

function finishRoutine() {
  const late = Date.now() - run.plannedLeave;
  if (late > 60000) say(t("Fertig. Los geht's, du bist {n} Minuten spät dran.", { n: Math.round(late / 60000) }));
  else announce('leave', t('Zeit, aus dem Haus zu gehen. Schönen Tag, {name}!', { name: settings.name }).replace(', !', '!'));
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
    say(t('{name} ist vorbei. ', { name: prev.name }) + t('Jetzt: {name}, {dur}.', { name: s.name, dur: spokenDuration((run.dur - elapsed(now)) / 1000) }));
  }
  const s = run.steps[run.idx];
  const e = elapsed(now), rem = (run.dur - e) / 1000;
  if (!run.saidHalf && e >= run.dur / 2) {
    run.saidHalf = true;
    if (e - run.dur / 2 < 20000) announce('half', t('Halbzeit: {name}. Noch {dur}.', { name: s.name, dur: spokenDuration(Math.round(rem / 5) * 5) }));
  }
  if (!run.saidOne && rem <= 60) {
    run.saidOne = true;
    if (rem > 40) announce('one', t('{name}: noch eine Minute.', { name: s.name }));
  }
  renderRun(now);
}

function renderRun(now) {
  if (!run) return;
  const s = run.steps[run.idx], next = run.steps[run.idx + 1];
  const e = elapsed(now), remMs = run.dur - e;
  $('runStepNo').textContent = `${run.idx + 1}/${run.steps.length}` + (run.paused ? t(' · Pause') : '');
  $('runName').textContent = s.name;
  $('runRemaining').textContent = fmtMMSS(remMs / 1000);
  $('runBar').style.strokeDashoffset = (553 * (e / run.dur)).toFixed(1);
  const soon = !run.paused && remMs <= 5000 ? t(' in {n}', { n: Math.max(1, Math.ceil(remMs / 1000)) }) : '';
  $('runNext').textContent = next ? `→ ${next.name}${soon}` : `→ ${t('Aus dem Haus')}${soon}`;
  $('runNext').classList.toggle('soon', !!soon);
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
  if (!confirm(t('Routine wirklich abbrechen?'))) return;
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

/* ---------- Sprache & Name ---------- */
const sameSteps = (a, b) => a.length === b.length && a.every((x, i) => x.name === b[i].name && x.min === b[i].min);
function setLang(lang) {
  settings.lang = lang;
  LANG = lang;
  // Unveränderte Standard-Schritte in der neuen Sprache anzeigen
  if (sameSteps(steps, lang === 'en' ? DEFAULT_STEPS : DEFAULT_STEPS_EN)) {
    steps = (lang === 'en' ? DEFAULT_STEPS_EN : DEFAULT_STEPS).map(x => ({ ...x }));
    store.set('steps', steps);
  }
  store.set('settings', settings);
  applyPalette();
  renderAll();
  renderClips();
  if ('speechSynthesis' in window) pickVoice();
  translateStatic();
}
function setName(name) {
  settings.name = name.trim().slice(0, 30);
  store.set('settings', settings);
  $('nameInput').value = settings.name;
  renderSummary();
}
$('nameInput').addEventListener('change', e => { if (e.target.value.trim()) setName(e.target.value); else e.target.value = settings.name; });
$('onboardForm').addEventListener('submit', e => {
  e.preventDefault();
  const n = $('onboardName').value.trim(); if (!n) return;
  setName(n);
  if (!settings.lang) setLang(LANG);
  $('onboard').classList.add('hidden');
});

LANG = settings.lang || ((navigator.language || 'de').toLowerCase().startsWith('de') ? 'de' : 'en');
if (!settings.lang && sameSteps(steps, DEFAULT_STEPS) && LANG === 'en') steps = DEFAULT_STEPS_EN.map(x => ({ ...x }));
$('nameInput').value = settings.name;
if (!settings.name) $('onboard').classList.remove('hidden');

applyPalette();
renderAll();
translateStatic();
loadClips();
if ('speechSynthesis' in window) pickVoice();
tick();

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
