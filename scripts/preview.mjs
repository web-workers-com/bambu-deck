/**
 * Renders a contact sheet of keys and alert decks to .build/preview.png, to
 * look at the drawing without Stream Deck. Usage: npm run preview
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import { toStatus } from "../.build/bambu/report.js";
import { humidityKey, lightKey, pauseKey, printerKey, speedKey, stopKey, tempKey, trayKey } from "../.build/render/keys.js";
import { alertKey, pictureMarkup } from "../.build/render/scene.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svgOf = (uri) => Buffer.from(uri.split(",")[1], "base64");

const ams = {
	tray_now: "1",
	ams: [
		{ id: "0", humidity: "4", tray: [{ id: "0", tray_type: "PLA", tray_color: "1A1A1AFF", remain: 82, tag_uid: "A1" }, { id: "1", tray_type: "PETG", tray_color: "F4F2ECFF", remain: 41, tag_uid: "A2" }, { id: "2", tray_type: "PLA", tray_color: "C8483AFF", remain: 12, tag_uid: "A3" }, { id: "3", tray_type: "PLA", tray_color: "2F6E8FFF", remain: -1, tag_uid: "0000000000000000" }] },
		{ id: "128", humidity_raw: "9", dry_time: 220, tray: [{ id: "0", tray_type: "PA-CF", tray_color: "3B3D42FF", remain: 60, tag_uid: "B1" }] },
	],
};
const st = (p) => toStatus({ ams, ...p });
const S = {
	idle: st({ gcode_state: "IDLE" }),
	heating: st({ gcode_state: "PREPARE", nozzle_temper: 182, nozzle_target_temper: 220 }),
	printing: st({ gcode_state: "RUNNING", mc_percent: 63, layer_num: 195, total_layer_num: 310, mc_remaining_time: 72, nozzle_temper: 220, nozzle_target_temper: 220, bed_temper: 55, bed_target_temper: 55, spd_lvl: 3 }),
	paused: st({ gcode_state: "PAUSE", mc_percent: 40 }),
	finished: st({ gcode_state: "FINISH", mc_percent: 100 }),
	failed: st({ gcode_state: "FAILED" }),
};
const offline = { ...S.idle, stage: "offline" };

const row1 = [
	printerKey({ status: S.idle, name: "X1C", t: 1 }),
	printerKey({ status: S.heating, name: "X1C", t: 1 }),
	printerKey({ status: S.printing, name: "X1C", t: 1 }),
	printerKey({ status: S.paused, name: "X1C", t: 1 }),
	printerKey({ status: S.finished, name: "X1C", t: 1 }),
	printerKey({ status: S.failed, name: "X1C", t: 1 }),
	printerKey({ status: offline, name: "X1C", t: 1, problem: "Zeitüberschreitung" }),
	printerKey({ status: S.printing, name: "X1C", t: 1, alert: { level: "wait", title: "Filament leer" } }),
];
const row2 = [
	printerKey({ status: S.printing, name: "P1S · Büro", t: 1, look: "compact" }),
	printerKey({ status: S.finished, name: "P1S · Büro", t: 1, look: "compact" }),
	printerKey({ status: S.heating, name: "H2D · Keller", t: 1, look: "compact" }),
	printerKey({ status: S.idle, name: "A1 mini", t: 1, look: "compact" }),
	...S.printing.ams[0].trays.map((tr) => trayKey(tr, "printing", 0.3)),
];
const row3 = [
	trayKey(S.printing.ams[1].trays[0], "printing", 0),
	trayKey({ ...S.printing.ams[0].trays[0], loaded: false }, "idle", 0),
	humidityKey(S.printing.ams[0], 0),
	humidityKey(S.printing.ams[1], 0.5),
	tempKey(S.printing, "both"),
	tempKey(S.heating, "nozzle"),
	pauseKey("printing"),
	pauseKey("paused"),
];
const row4 = [stopKey(0, true), stopKey(0.55, true), lightKey(true, true), lightKey(false, true), lightKey(undefined, false), speedKey(1), speedKey(3), speedKey(4)];

const K = 96;
const GAP = 12;
const tiles = [];
[row1, row2, row3, row4].forEach((row, y) => row.forEach((uri, x) => tiles.push({ uri, left: GAP + x * (K + GAP), top: GAP + y * (K + GAP) })));

// Alert decks (5×3): finished and runout.
const decks = [
	{ alert: { printer: "Werkstatt", level: "done", kind: "finished", title: "Fertig!" } },
	{ alert: { printer: "Kids", level: "wait", kind: "paused", title: "Filament leer" } },
	{ alert: { printer: "Keller", level: "error", kind: "hms", title: "Drucker meldet" } },
];
const deckTop = GAP + 4 * (K + GAP) + 20;
const DK = 64;
decks.forEach((d, i) => {
	const o = { columns: 5, rows: 3, alert: d.alert, t: 0.3 };
	const markup = pictureMarkup(o);
	for (let r = 0; r < 3; r++) {
		for (let c = 0; c < 5; c++) {
			tiles.push({ uri: alertKey(o, c, r, markup), left: GAP + i * (5 * (DK + 6) + 24) + c * (DK + 6), top: deckTop + r * (DK + 6), size: DK });
		}
	}
});

const width = GAP + 8 * (K + GAP);
const height = deckTop + 3 * (DK + 6) + GAP;
const composites = await Promise.all(
	tiles.map(async (t) => ({ input: await sharp(svgOf(t.uri), { density: 200 }).resize(t.size ?? K, t.size ?? K).png().toBuffer(), left: t.left, top: t.top })),
);
const out = join(root, ".build", "preview.png");
await mkdir(dirname(out), { recursive: true });
await writeFile(out, await sharp({ create: { width, height, channels: 4, background: "#F3F0E8" } }).composite(composites).png().toBuffer());
console.log(out);
