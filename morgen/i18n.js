'use strict';
/* Übersetzungen. Schlüssel ist immer der deutsche Text, Werte sind Englisch.
   t('Text {x}', {x: 1}) liefert den Text in der aktiven Sprache. */

let LANG = 'de';

const EN = {
  // Navigation & Überschriften
  'Wecker': 'Alarm',
  'Routine': 'Routine',
  'Einstellungen': 'Settings',
  'Wecken': 'Wake-up',
  'Ins Bett': 'Bedtime',
  'Durchsagen': 'Announcements',
  'Eigene Stimme': 'Your own voice',
  'Farben': 'Colours',
  'Wissen': 'Background',
  'Profil': 'Profile',
  'Sprache': 'Language',
  'Konto': 'Account',

  // Wecker
  'Aus dem Haus fix': 'Leave time fixed',
  'Aufstehen fix': 'Wake time fixed',
  'Aufstehen': 'Wake up',
  'Aus dem Haus': 'Out the door',
  'Aus dem Haus ändern': 'Change leave time',
  'Aktivieren': 'Activate',
  '{n} Min': '{n} min',
  '{n} Min Routine': '{n} min routine',
  'Lauter werden': 'Fade in',
  'Der Weckton startet ganz leise und wird über diese Zeit langsam lauter. So schreckst du nicht auf.':
    'The alarm starts very quietly and gets louder over this time, so you don’t wake with a start.',
  'Licht vorher': 'Light before',
  'So viele Minuten vor dem Wecken wird der Bildschirm langsam warm und hell, wie ein Sonnenaufgang.':
    'This many minutes before the alarm, the screen slowly turns warm and bright, like a sunrise.',
  'Schlummern': 'Snooze',
  'Beim Wecken erscheint ein Knopf, der den Ton für diese Zeit pausiert. Die Minuten fehlen dann in der Routine.':
    'A button appears with the alarm that pauses the sound for this long. Those minutes are then missing from your routine.',
  'Aus': 'Off',
  'Routine danach starten': 'Start routine afterwards',
  'Individuell': 'Custom',
  'Sanft': 'Gentle',
  'Standard': 'Standard',
  'Tiefschläfer': 'Deep sleeper',
  'Winter': 'Winter',
  'Sonnenaufgang': 'Sunrise',
  'Morgenglocken': 'Morning bells',
  'Sanfter Puls': 'Soft pulse',
  '{sound} · Ton Beginn {fade} · Licht {light} · {snooze}': '{sound} · Fade in {fade} · Light {light} · {snooze}',
  'aus': 'off',
  'kein Schlummern': 'no snooze',
  'Schlummern {n} min': 'Snooze {n} min',
  'Hallo {name}': 'Hi {name}',

  // Routine
  '+ Schritt': '+ Step',
  'Stimme': 'Voice',
  'Tempo': 'Speed',
  'Ruhig': 'Calm',
  'Normal': 'Normal',
  'Zügig': 'Brisk',
  'Testen': 'Test',
  'Jetzt starten': 'Start now',
  'Neu': 'New',
  'Schritt': 'Step',
  'Bearbeiten': 'Edit',
  'z. B. Duschen': 'e.g. Shower',
  'Min': 'min',
  'Löschen': 'Delete',
  'Speichern': 'Save',
  'weniger': 'less',
  'mehr': 'more',
  'Verschieben': 'Move',
  'Keine passende Stimme gefunden': 'No matching voice found',
  'Dieser Browser unterstützt keine Sprachausgabe.': 'This browser does not support speech.',
  'Bitte zuerst mindestens einen Schritt in der Routine anlegen.': 'Please add at least one step to your routine first.',
  'Routine wirklich abbrechen?': 'Really stop the routine?',

  // Eigene Aufnahmen
  'Halbzeit': 'Halfway',
  'Noch 1 Minute': '1 minute left',
  'Zeit, aus dem Haus zu gehen': 'Time to head out',
  'Aufnahme läuft · {n} s': 'Recording · {n} s',
  'Kann nicht abgespielt werden': 'Can’t be played',
  'Eigene Aufnahme': 'Own recording',
  'Computerstimme': 'Computer voice',
  'Stopp': 'Stop',
  'Aufnehmen': 'Record',
  'Anhören': 'Listen',
  'Audiodatei wählen': 'Choose audio file',
  'Aufnahme löschen?': 'Delete recording?',
  'Das Mikrofon ist hier nicht verfügbar. Nimm die Sätze mit der Sprachmemo-App auf und wähle die Datei hier aus.':
    'The microphone isn’t available here. Record the phrases with your voice memo app and choose the file here.',
  'Tippe aufs Mikrofon, sprich den Satz und tippe auf Stopp. Ohne Aufnahme spricht die Computerstimme.':
    'Tap the microphone, say the phrase and tap stop. Without a recording, the computer voice speaks.',

  // Durchsagen (gesprochen)
  'eine Minute': 'one minute',
  '{n} Minuten': '{n} minutes',
  '{n} Sekunden': '{n} seconds',
  ' und ': ' and ',
  'null Sekunden': 'zero seconds',
  'Halbzeit: {name}. Noch {dur}.': 'Halfway: {name}. Still {dur} to go.',
  '{name}: noch eine Minute.': '{name}: one minute left.',
  '{name} ist vorbei. ': '{name} is done. ',
  'Jetzt: {name}, {dur}.': 'Now: {name}, {dur}.',
  'Guten Morgen, {name}! ': 'Good morning, {name}! ',
  "Fertig. Los geht's, du bist {n} Minuten spät dran.": "Done. Let's go, you're {n} minutes late.",
  'Zeit, aus dem Haus zu gehen. Schönen Tag, {name}!': 'Time to head out. Have a great day, {name}!',
  'Halbzeit: Duschen. Noch zwei Minuten und dreissig Sekunden.': 'Halfway: Shower. Two minutes and thirty seconds left.',

  // Wecken & Timer
  'Guten Morgen': 'Good morning',
  'Guten Morgen, {name}': 'Good morning, {name}',
  'Ich bin wach': 'I’m awake',
  'Pause': 'Pause',
  ' · Pause': ' · paused',
  ' in {n}': ' in {n}',
  'Weiter ›': 'Next ›',
  'Abbrechen': 'Cancel',
  'Aus dem Haus · Plan': 'Out the door · plan',
  'Aus dem Haus · jetzt': 'Out the door · now',
  'Bildschirm bleibt nicht von selbst an. Stell die automatische Sperre aus, sonst pausieren Timer und Durchsagen.':
    'The screen won’t stay on by itself. Turn off auto-lock, otherwise the timer and announcements pause.',

  // Einstellungen
  'Name': 'Name',
  'Dein Name': 'Your name',
  'E-Mail': 'Email',
  'Konto erstellen': 'Create account',
  'Bald': 'Soon',
  'Mit einem Konto kannst du später Routine und Einstellungen auf mehreren Geräten nutzen.':
    'With an account you’ll later be able to use your routine and settings on several devices.',
  'Morgenröte': 'Dawn',
  'Nachtblau': 'Midnight',
  'Salbei': 'Sage',
  'Mono': 'Mono',
  'Nachts: App offen, Handy am Kabel, Ton laut.': 'At night: app open, phone charging, sound up.',

  // Wissen
  'Melodie statt Piepen': 'Melody instead of beeping',
  'Studien der RMIT University (McFarlane et al., 2020) zeigen: Melodische Wecktöne gehen mit weniger Schlaftrunkenheit einher als harte Pieptöne. Gut sind erkennbare, aufsteigende Melodien mit 100–120 Schlägen pro Minute.':
    'Studies from RMIT University (McFarlane et al., 2020) show that melodic alarms go along with less grogginess than harsh beeps. Recognisable, rising melodies at 100–120 beats per minute work well.',
  'Langsam lauter': 'Gradually louder',
  'Ein plötzlicher lauter Ton schreckt auf und treibt Puls und Stresshormone hoch. Der Ton startet darum leise und wird allmählich lauter.':
    'A sudden loud sound startles you and pushes up your pulse and stress hormones. That’s why the sound starts quietly and gradually gets louder.',
  'Licht vor dem Ton': 'Light before sound',
  'Licht bremst das Schlafhormon Melatonin. Ein langsam heller werdender Bildschirm kann das Aufwachen erleichtern. Danach hilft echtes Tageslicht am meisten.':
    'Light suppresses the sleep hormone melatonin. A screen that slowly gets brighter can make waking up easier. After that, real daylight helps most.',
  'Schlummertaste': 'Snooze button',
  'Die Forschung ist nicht einig (Sundelin et al., 2023, fanden bei 30 Minuten keinen klaren Schaden). Der Schlaf danach ist aber zerstückelt und die Zeit fehlt in der Routine. Standard ist „aus“.':
    'Research is divided (Sundelin et al., 2023, found no clear harm from 30 minutes). But the sleep afterwards is fragmented and the time is missing from your routine. The default is “off”.',
  'Gleiche Zeit, jeden Tag': 'Same time, every day',
  'Am meisten hilft eine regelmässige Aufstehzeit, auch am Wochenende (±1 Stunde). Jugendliche brauchen 8–10 Stunden Schlaf, Erwachsene 7–9.':
    'A regular wake-up time helps most, weekends included (±1 hour). Teenagers need 8–10 hours of sleep, adults 7–9.',

  // Willkommen
  'Willkommen bei Routinely': 'Welcome to Routinely',
  'Wie heisst du?': 'What’s your name?',
  "Los geht's": "Let's go",
  'Dein Name erscheint in der Begrüssung und in den Durchsagen.': 'Your name appears in greetings and announcements.'
};

function t(de, vars) {
  let s = LANG === 'en' && Object.prototype.hasOwnProperty.call(EN, de) ? EN[de] : de;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return s;
}

/* Feste Texte im HTML übersetzen. Der deutsche Originaltext wird je Knoten gemerkt,
   damit man jederzeit zurückwechseln kann. Bereiche mit data-noi18n (Namen der
   Schritte usw.) bleiben unberührt. */
function translateStatic(root = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => n.parentElement.closest('script, style, [data-noi18n]') || !n.nodeValue.trim()
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.__de === undefined) n.__de = n.nodeValue;
    const key = n.__de.trim();
    if (key in EN) n.nodeValue = n.__de.replace(key, t(key));
  }
  root.querySelectorAll('[aria-label], [placeholder]').forEach(el => {
    if (el.closest('[data-noi18n]')) return;
    el.__deAttr = el.__deAttr || {};
    ['aria-label', 'placeholder'].forEach(a => {
      if (!el.hasAttribute(a)) return;
      if (!(a in el.__deAttr)) el.__deAttr[a] = el.getAttribute(a);
      el.setAttribute(a, t(el.__deAttr[a]));
    });
  });
  document.documentElement.lang = LANG;
}
