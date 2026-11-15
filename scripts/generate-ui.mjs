/**
 * Writes the property inspector pages (ui/*.html). Kept in one place so every
 * key offers the same printer list and the same wording.
 */
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ui = join(dirname(fileURLToPath(import.meta.url)), "..", "com.bambudeck.plugin.sdPlugin", "ui");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const page = (body) => `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>Bambu Deck</title>
<script src="./libs/sdpi-components.js"></script>
<style>
.hint{color:#9d9a94;font-size:11px;line-height:1.5;padding:4px 0 8px}
.hint b{color:#B9DD8C;font-weight:600}
details{margin:6px 0;border-top:1px solid #333;padding-top:6px}
summary{cursor:pointer;color:#ddd;font-size:12px;padding:4px 0}
</style>
</head>
<body>
${body}
</body>
</html>
`;

const select = (label, setting, options, hint = "") =>
	`<sdpi-item label="${esc(label)}"><sdpi-select setting="${setting}" default="${esc(options[0][0])}">${options.map(([v, n]) => `<option value="${esc(v)}">${esc(n)}</option>`).join("")}</sdpi-select></sdpi-item>` +
	(hint ? `\n<div class="hint">${hint}</div>` : "");

const PRINTERS = [
	["", "Erster Drucker"],
	["1", "Drucker 1"],
	["2", "Drucker 2"],
	["3", "Drucker 3"],
	["4", "Drucker 4"],
	["demo-x1c", "Demo: X1C + AMS"],
	["demo-a1mini", "Demo: A1 mini + AMS lite"],
	["demo-h2d", "Demo: H2D + AMS 2 Pro + HT"],
];
const printerSelect = select("Drucker", "printer", PRINTERS);
const setupHint = `<div class="hint">Drucker richtest du in der Taste <b>Bao (Drucker)</b> ein.</div>`;

const MODELS = [
	["auto", "automatisch (Seriennummer)"],
	["X1C", "X1 Carbon"],
	["X1", "X1"],
	["X1E", "X1E"],
	["P1S", "P1S"],
	["P1P", "P1P"],
	["P2S", "P2S"],
	["A1", "A1"],
	["A1M", "A1 mini"],
	["H2D", "H2D"],
	["H2S", "H2S"],
	["H2C", "H2C"],
	["H2DP", "H2D Pro"],
	["X2D", "X2D"],
	["A2L", "A2L"],
	["H3C", "H3C"],
];

const printerSetup = (n) => `<details${n === 1 ? " open" : ""}>
<summary>Drucker ${n}</summary>
<sdpi-item label="Name"><sdpi-textfield setting="p${n}_name" global placeholder="${n === 1 ? "Werkstatt" : `Drucker ${n}`}"></sdpi-textfield></sdpi-item>
<sdpi-item label="IP-Adresse"><sdpi-textfield setting="p${n}_host" global placeholder="192.168.1.42"></sdpi-textfield></sdpi-item>
<sdpi-item label="Seriennummer"><sdpi-textfield setting="p${n}_serial" global placeholder="00M00A…"></sdpi-textfield></sdpi-item>
<sdpi-item label="Zugangscode"><sdpi-password setting="p${n}_code" global placeholder="8 Zeichen"></sdpi-password></sdpi-item>
<sdpi-item label="Modell"><sdpi-select setting="p${n}_model" global default="auto">${MODELS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</sdpi-select></sdpi-item>
</details>`;

const whereHint = `<div class="hint">IP-Adresse und Zugangscode stehen am Drucker unter <b>Einstellungen › Netzwerk</b> (X1, P2S, H2) bzw. <b>Einstellungen › WLAN</b> (P1, A1). Die Seriennummer steht auf dem Aufkleber am Drucker. Bei <b>X2D, A2L, H2C, H2D Pro und H3C</b> das Modell bitte von Hand wählen. Die Verbindung läuft direkt im Heimnetz, ohne Cloud. Zum Steuern (Pause, Licht, Tempo) braucht neuere Firmware den LAN-Modus mit Entwicklermodus; Anzeigen geht immer.</div>`;
const setupSection = `<details open><summary>Drucker einrichten</summary>
${whereHint}
${[1, 2, 3, 4].map(printerSetup).join("\n")}
</details>`;
const demoSection = `<details><summary>Demo</summary>
<sdpi-item label="Demo-Drucker"><sdpi-checkbox setting="demo" global label="drei simulierte Drucker zeigen"></sdpi-checkbox></sdpi-item>
<div class="hint">X1C mit AMS, A1 mini mit AMS lite (Filament läuft aus) und H2D mit AMS 2 Pro und AMS HT (trocknet). Zum Ausprobieren ohne Drucker.</div>
</details>`;

const pages = {
	"setup.html": [
		`<div class="hint">Trag hier deinen Drucker ein. Sobald er antwortet, verschwindet die Anleitung und das Deck zeigt wieder dein Profil.</div>`,
		setupSection,
		demoSection,
	].join("\n"),
	"printer.html": [
		printerSelect,
		select("Aussehen", "look", [
			["bao", "Bao groß"],
			["compact", "Kompakt (Name und Zustand)"],
		], "Kompakt passt, wenn mehrere Drucker nebeneinander liegen."),
		setupSection,
		demoSection,
	].join("\n"),
	"tray.html": [
		printerSelect,
		select("Spule", "slot", [
			["A1", "A1"], ["A2", "A2"], ["A3", "A3"], ["A4", "A4"],
			["B1", "B1"], ["B2", "B2"], ["B3", "B3"], ["B4", "B4"],
			["C1", "C1"], ["C2", "C2"], ["C3", "C3"], ["C4", "C4"],
			["D1", "D1"], ["D2", "D2"], ["D3", "D3"], ["D4", "D4"],
			["HT1", "AMS HT 1"], ["HT2", "AMS HT 2"],
			["Ext", "Externe Spule"],
			["active", "Die gerade druckt"],
		], "A bis D sind die AMS in der Reihenfolge am Hub, Spule 1 bis 4 von links. Ohne RFID (Fremdspule) zeigt die Taste ein Fragezeichen statt Prozent."),
		setupHint,
	].join("\n"),
	"humidity.html": [
		printerSelect,
		select("AMS", "unit", [["A", "AMS A"], ["B", "AMS B"], ["C", "AMS C"], ["D", "AMS D"], ["HT1", "AMS HT 1"], ["HT2", "AMS HT 2"]], "AMS 2 Pro und AMS HT zeigen Prozent und beim Trocknen die Restzeit, das klassische AMS eine Stufe. Das AMS lite hat keinen Sensor."),
		setupHint,
	].join("\n"),
	"temp.html": [
		printerSelect,
		select("Zeigt", "what", [["both", "Düse und Bett"], ["nozzle", "Düse"], ["bed", "Bett"], ["chamber", "Kammer"]]),
		setupHint,
	].join("\n"),
	"control.html": [printerSelect, setupHint].join("\n"),
	"controls.html": [
		printerSelect,
		`<div class="hint">Drücken legt alle Steuerungen über das ganze Deck: Pause, Stopp (halten), Licht, Tempo, Vorheizen, Lüfter, Achsen, Filament laden und entladen. Was dein Drucker nicht hat, fehlt. Auf kleinen Decks blätterst du mit „Weiter“, „Fertig“ führt zurück.</div>`,
		setupHint,
	].join("\n"),
	"preheat.html": [
		printerSelect,
		select("Vorgabe", "preset", [["pla", "PLA · 220° / 60°"], ["petg", "PETG · 250° / 75°"], ["abs", "ABS/ASA · 260° / 100°"], ["tpu", "TPU · 230° / 40°"], ["cool", "Abkühlen (alles aus)"]], "Heizt nur, wenn gerade nicht gedruckt wird. Noch ein Druck, während die Vorgabe heizt, schaltet wieder aus."),
		setupHint,
	].join("\n"),
	"fan.html": [
		printerSelect,
		select("Lüfter", "which", [["part", "Bauteillüfter"], ["aux", "Hilfslüfter (Seite)"], ["chamber", "Kammerlüfter"]], "Drücken wechselt aus → 50 % → 100 %. Der A1 hat nur den Bauteillüfter. Beim Drucken stellt der Slicer die Lüfter bald wieder selbst."),
		setupHint,
	].join("\n"),
	"info.html": [
		printerSelect,
		select("Zeigt zuerst", "view", [["eta", "Fertig um (Uhrzeit)"], ["remaining", "Restzeit"], ["layer", "Schicht"], ["job", "Dateiname"]], "Drücken wechselt die Anzeige."),
		setupHint,
	].join("\n"),
	"move.html": [
		printerSelect,
		select("Bewegung", "what", [["home", "Referenzfahrt (G28)"], ["zup", "Z +10 mm"], ["zdown", "Z −10 mm"]], "Nur wenn nicht gedruckt wird. Vor Z-Bewegungen einmal Referenzfahrt."),
		setupHint,
	].join("\n"),
	"filament.html": [
		printerSelect,
		select("Aktion", "mode", [["unload", "Entladen"], ["load", "Laden"]]),
		select("Spule (zum Laden)", "slot", [["A1", "A1"], ["A2", "A2"], ["A3", "A3"], ["A4", "A4"], ["B1", "B1"], ["B2", "B2"], ["B3", "B3"], ["B4", "B4"], ["C1", "C1"], ["C2", "C2"], ["C3", "C3"], ["C4", "C4"], ["D1", "D1"], ["D2", "D2"], ["D3", "D3"], ["D4", "D4"], ["HT1", "AMS HT 1"], ["HT2", "AMS HT 2"], ["Ext", "Externe Spule"]], "Nur wenn nicht gedruckt wird. Die Düse heizt auf die Temperatur der Spule."),
		setupHint,
	].join("\n"),
	"gcode.html": [
		printerSelect,
		`<sdpi-item label="Name"><sdpi-textfield setting="name" placeholder="Düse putzen"></sdpi-textfield></sdpi-item>`,
		`<sdpi-item label="G-Code"><sdpi-textarea setting="gcode" rows="6" placeholder="G28&#10;G1 Z50 F600"></sdpi-textarea></sdpi-item>`,
		`<sdpi-item label="Beim Drucken"><sdpi-checkbox setting="whilePrinting" label="auch während eines Drucks senden"></sdpi-checkbox></sdpi-item>`,
		`<div class="hint">Eine Zeile pro Befehl. Wird ohne Rückfrage gesendet, also vorsichtig mit Bewegungen und Temperaturen.</div>`,
		setupHint,
	].join("\n"),
	"camera.html": [
		printerSelect,
		`<div class="hint">Drücken legt das Live-Bild über das ganze Deck, noch ein Druck führt zurück (nach 5 Minuten von selbst). <b>X1, H2, P2S</b>: am Drucker <b>LAN-Liveview</b> einschalten, und auf dem Computer muss <b>ffmpeg</b> installiert sein (Windows: <code>winget install ffmpeg</code>). <b>P1, A1</b> brauchen nichts davon.</div>`,
		setupHint,
	].join("\n"),
	"speed.html": [
		printerSelect,
		`<sdpi-item label="Ludicrous"><sdpi-checkbox setting="ludicrous" label="auch Ludicrous anbieten"></sdpi-checkbox></sdpi-item>`,
		setupHint,
	].join("\n"),
	"dial.html": [
		printerSelect,
		select("Regelt", "what", [["nozzle", "Düse"], ["bed", "Bett"], ["fan", "Bauteillüfter"], ["speed", "Tempo"]], "Drehen stellt ein neues Ziel ein; es wird gesendet, sobald du kurz nicht mehr drehst."),
		setupHint,
	].join("\n"),
	"test.html": select("Art", "level", [["done", "Druck fertig (Bambus)"], ["error", "Fehler (Koralle)"]], "Löst sofort einen Beispiel-Alarm aus und schaltet aufs Alarm-Profil."),
};

for (const [name, body] of Object.entries(pages)) {
	await writeFile(join(ui, name), page(body));
}
console.log(`${Object.keys(pages).length} settings pages written`);
