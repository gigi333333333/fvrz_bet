# Morgenplan

Web-App (PWA), die den Morgen strukturiert: wissenschaftlich begründeter Wecker + Routine in Zeitblöcken mit Sprachdurchsagen.

**Starten:** Ordner `morgen/` über einen Webserver ausliefern (z. B. GitHub Pages oder `npx serve morgen`), auf dem Handy öffnen und „Zum Home-Bildschirm hinzufügen“.

- **Wecker:** Aus-dem-Haus-Zeit eingeben → Weckzeit wird aus der Routinedauer zurückgerechnet. Melodischer, aufsteigender Weckton (100–120 BPM), der langsam lauter wird, Licht-Sonnenaufgang auf dem Bildschirm, Schlummertaste standardmäßig aus, Schlafenszeit-Vorschläge in 90-Minuten-Zyklen.
- **Routine:** Schritte mit Minuten (Duschen 5, Essen 10 …). Durchsagen beim Start jedes Schritts, zur Halbzeit und eine Minute vor Schluss. Anzeige „geplant / voraussichtlich aus dem Haus“.
- **Grenze einer Web-App:** Die App muss geöffnet bleiben (Bildschirm bleibt per Wake Lock an, Handy ans Ladekabel). Ein Wecker, der ein gesperrtes Handy weckt, braucht eine native App.
