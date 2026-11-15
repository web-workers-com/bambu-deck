/**
 * Generates the profiles that ship with the plugin: a starter "Bambu Deck"
 * layout and a full-deck "… Alarm" profile per device type.
 * Profile format copied from Andon Deck, which Stream Deck 7 is known to load.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { makeZip } from "./lib/zip.mjs";

const PLUGIN = "com.bambudeck.plugin";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, `${PLUGIN}.sdPlugin`);

/**
 * A key for the profile.
 */
function key(uuid, name, settings = {}) {
	return {
		Name: name,
		Settings: settings,
		State: 0,
		States: [{ FontFamily: "", FontSize: 10, FontStyle: "", FontUnderline: false, OutlineThickness: 2, ShowTitle: false, TitleAlignment: "bottom", TitleColor: "#ffffff" }],
		UUID: `${PLUGIN}.${uuid}`,
	};
}

const BAO = key("printer", "Bao (Drucker)");
const tray = (slot) => key("tray", "AMS-Spule", { slot });
const AMS = [tray("A1"), tray("A2"), tray("A3"), tray("A4")];
const TEMPS = key("temp", "Temperaturen", { what: "both" });
const NOZZLE = key("temp", "Temperaturen", { what: "nozzle" });
const BED = key("temp", "Temperaturen", { what: "bed" });
const CHAMBER = key("temp", "Temperaturen", { what: "chamber" });
const HUMIDITY = key("humidity", "AMS-Feuchte", { unit: "A" });
const PAUSE = key("pause", "Pause / Weiter");
const STOP = key("stop", "Stopp (halten)");
const LIGHT = key("light", "Kammerlicht");
const SPEED = key("speed", "Tempo");
const TEST = key("test", "Alarm testen", { level: "done" });
const ALERT = key("alert", "Alarm-Taste");
const CAMERA = key("camera", "Kamera");
const CONTROLS = key("controls", "Steuern");
const preheat = (preset) => key("preheat", "Vorheizen", { preset });
const fan = (which) => key("fan", "Lüfter", { which });
const info = (view) => key("info", "Druckinfo", { view });
const move = (what) => key("move", "Achsen", { what });
const UNLOAD = key("filament", "Filament", { mode: "unload" });

// Dials (Stream Deck +): nozzle, bed, fan, speed.
const dial = (what) => key("dial", "Drehregler", { what });
const DIALS = [dial("nozzle"), dial("bed"), dial("fan"), dial("speed")];

function grid(rows) {
	const actions = {};
	rows.forEach((row, y) => row.forEach((entry, x) => entry && (actions[`${x},${y}`] = entry)));
	return actions;
}

/**
 * One printer and its AMS, then what you reach for most. The AMS keys show
 * whatever the printer has in those slots (AMS, AMS lite, AMS 2 Pro); empty
 * slots stay calm. Everything else is one press away under "Steuern".
 */
const MK2 = [
	[BAO, info("eta"), TEMPS, HUMIDITY, CAMERA],
	[...AMS, tray("active")],
	[CONTROLS, preheat("pla"), LIGHT, SPEED, PAUSE],
];
const XL = [
	[BAO, info("eta"), NOZZLE, BED, CHAMBER, HUMIDITY, CAMERA, CONTROLS],
	[...AMS, tray("active"), tray("Ext"), preheat("pla"), preheat("petg")],
	[LIGHT, SPEED, fan("part"), fan("aux"), fan("chamber"), move("home"), UNLOAD, preheat("cool")],
	[PAUSE, info("layer"), info("remaining"), null, null, null, TEST, STOP],
];
const SMALL = [
	[BAO, info("eta"), CAMERA, CONTROLS],
	AMS,
];

/** Device type → model id, grid, and starter layout. */
const DEVICES = [
	{ suffix: "", type: 0, model: "20GBA9901", size: [5, 3], layout: MK2 },
	{ suffix: " Mini", type: 1, model: "20GAI9901", size: [3, 2], layout: [[BAO, info("eta"), CAMERA], [tray("active"), CONTROLS, PAUSE]] },
	{ suffix: " XL", type: 2, model: "20GAT9901", size: [8, 4], layout: XL },
	{ suffix: " Mobile", type: 3, model: "VSD/WiFi", size: [5, 3], layout: MK2 },
	{ suffix: " Plus", type: 7, model: "20GBD9901", size: [4, 2], layout: SMALL, dials: DIALS },
	{ suffix: " Neo", type: 9, model: "20GBJ9901", size: [4, 2], layout: SMALL },
	{ suffix: " Studio", type: 10, model: "20GBO9901", size: [16, 2], layout: [[...XL[0], ...XL[1]], [...XL[2], ...XL[3]]], dials: [dial("nozzle"), dial("bed")] },
	{ suffix: " Virtual", type: 11, model: "UI Stream Deck", size: [8, 8], layout: XL },
	{ suffix: " Galleon", type: 12, model: "GRETSCH", size: [3, 4], layout: [[BAO, info("eta"), CAMERA], AMS.slice(0, 3), [AMS[3], TEMPS, preheat("pla")], [CONTROLS, LIGHT, PAUSE]], dials: [dial("nozzle"), dial("bed")] },
	{ suffix: " Plus XL", type: 13, model: "20GBX9901", size: [9, 4], layout: XL.map((row, i) => [...row, [TEMPS, preheat("abs"), move("zup"), move("zdown")][i]]), dials: [...DIALS, dial("fan"), dial("speed")].slice(0, 6) },
];

const profiles = DEVICES.flatMap((d) => {
	const [columns, rows] = d.size;
	const dials = (list) => Object.fromEntries((list ?? []).map((entry, i) => [`${i},0`, entry]));
	const controllers = (actions, encoders = {}) => [{ Type: "Keypad", Actions: actions }, ...(d.dials ? [{ Type: "Encoder", Actions: encoders }] : [])];
	return [
		{ name: `Bambu Deck${d.suffix}`, type: d.type, model: d.model, controllers: controllers(grid(d.layout), dials(d.dials)) },
		{
			name: `Bambu Deck${d.suffix} Alarm`,
			type: d.type,
			model: d.model,
			controllers: controllers(grid(Array.from({ length: rows }, () => Array.from({ length: columns }, () => ALERT)))),
		},
	];
});

const hash = (seed, n) => createHash("sha256").update(seed).digest("hex").toUpperCase().slice(0, n);
const uuid = (h) => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;

const manifestPath = join(outDir, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const plugin = { Name: manifest.Name, UUID: PLUGIN, Version: manifest.Version };

for (const p of profiles) {
	const id = (what) => uuid(hash(`${PLUGIN}:${p.name}:${what}`, 32));
	const profileId = id("profile");
	const pageId = id("page");
	const defaultPageId = id("default-page");
	const base = `Profiles/${profileId}.sdProfile`;
	const outer = {
		Device: { Model: p.model, UUID: id("device").toLowerCase() },
		Name: p.name,
		Pages: { Current: "00000000-0000-0000-0000-000000000000", Default: defaultPageId.toLowerCase(), Pages: [pageId.toLowerCase()] },
		Version: "3.0",
	};
	const withIds = (controller) => {
		const actions = {};
		for (const [at, entry] of Object.entries(controller.Actions)) {
			actions[at] = { ActionID: id(`action:${controller.Type}:${at}`).toLowerCase(), LinkedTitle: true, Name: entry.Name, Plugin: plugin, Resources: null, Settings: entry.Settings, State: 0, States: entry.States, UUID: entry.UUID };
		}
		return { Actions: Object.keys(actions).length ? actions : null, Type: controller.Type };
	};
	const page = { Controllers: p.controllers.map(withIds), Icon: "", Name: "" };
	const blank = { Controllers: p.controllers.map((c) => ({ Actions: null, Type: c.Type })), Icon: "", Name: "" };
	const packageInfo = { AppVersion: "7.0.0.0", DeviceModel: p.model, DeviceSettings: null, FormatVersion: 1, OSType: "Windows", OSVersion: "10.0.0", RequiredPlugins: [PLUGIN] };
	const zip = makeZip([
		{ path: "Profiles/" },
		{ path: `${base}/` },
		{ path: `${base}/Images/` },
		{ path: `${base}/Profiles/` },
		{ path: `${base}/Profiles/${defaultPageId}/` },
		{ path: `${base}/Profiles/${defaultPageId}/Images/` },
		{ path: `${base}/Profiles/${pageId}/` },
		{ path: `${base}/Profiles/${pageId}/Images/` },
		{ path: "package.json", data: JSON.stringify(packageInfo) },
		{ path: `${base}/manifest.json`, data: JSON.stringify(outer) },
		{ path: `${base}/Profiles/${defaultPageId}/manifest.json`, data: JSON.stringify(blank) },
		{ path: `${base}/Profiles/${pageId}/manifest.json`, data: JSON.stringify(page) },
	]);
	await writeFile(join(outDir, `${p.name}.streamDeckProfile`), zip);
}

manifest.Profiles = profiles.map((p) => ({ Name: p.name, DeviceType: p.type, Readonly: false, DontAutoSwitchWhenInstalled: true, AutoInstall: true }));
await writeFile(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`, "utf8");
console.log(`${profiles.length} profiles written`);
