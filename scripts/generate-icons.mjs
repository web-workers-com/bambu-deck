/**
 * Renders the plugin's static images (plugin icon, category icon, action list
 * icons and default key images) from the same drawing code the keys use.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import { toStatus } from "../.build/bambu/report.js";
import { humidityKey, lightKey, pauseKey, printerKey, speedKey, stopKey, tempKey, testKey, trayKey } from "../.build/render/keys.js";
import { panda } from "../.build/render/panda.js";
import { cameraKey } from "../.build/render/camera.js";
import { controlsKey } from "../.build/render/panel.js";
import { fanKey, filamentKey, gcodeKey, jobKey, moveKey, preheatKey } from "../.build/render/control.js";
import { DEFS } from "../.build/render/svg.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "com.bambudeck.plugin.sdPlugin", "imgs");
const svgOf = (uri) => Buffer.from(uri.split(",")[1], "base64");

async function png(svg, size, file) {
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, await sharp(svg, { density: 300 }).resize(size, size).png().toBuffer());
}

async function pair(svg, size, base) {
	await png(svg, size, `${base}.png`);
	await png(svg, size * 2, `${base}@2x.png`);
}

// A printer mid-print, with an AMS, as the sample everything is drawn from.
const sample = toStatus({
	gcode_state: "RUNNING",
	mc_percent: 63,
	layer_num: 195,
	total_layer_num: 310,
	mc_remaining_time: 72,
	nozzle_temper: 220,
	nozzle_target_temper: 220,
	bed_temper: 55,
	bed_target_temper: 55,
	spd_lvl: 2,
	lights_report: [{ node: "chamber_light", mode: "on" }],
	ams: {
		tray_now: "1",
		ams: [{ id: "0", humidity: "4", tray: [{ id: "0", tray_type: "PLA", tray_color: "C8483AFF", remain: 82, tag_uid: "A1B2" }, { id: "1", tray_type: "PETG", tray_color: "F4F2ECFF", remain: 41, tag_uid: "A1B3" }] }],
	},
});

// Plugin icon: Bao with his bamboo, as in the logo.
const logo = Buffer.from(
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs>${DEFS}<clipPath id="k"><rect width="120" height="120" rx="26"/></clipPath></defs>` +
		`<g clip-path="url(#k)"><rect width="120" height="120" fill="url(#bdKey)"/>` +
		`<rect x="22" y="20" width="76" height="3.4" rx="1.7" fill="#9BCB62"/><rect x="22" y="24" width="76" height="3.4" rx="1.7" fill="#86BC50"/><rect x="22" y="28" width="76" height="3.4" rx="1.7" fill="#9BCB62"/>` +
		`<path d="M52 2 h16 v8 h-16z" fill="#4A4F57"/><path d="M55 10 h10 l-3 6 h-4z" fill="#C9CDD3"/>` +
		`${panda({ mood: "open", dy: 10, bamboo: true })}</g></svg>`,
);
await pair(logo, 256, join(root, "plugin", "marketplace"));

// Category icon: just the face, small and white on transparent.
const face = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 24 84 84"><defs>${DEFS}</defs>${panda({ mood: "open" })}</svg>`);
await pair(face, 28, join(root, "plugin", "category-icon"));

const keys = {
	printer: printerKey({ status: sample, name: "X1C", t: 1 }),
	tray: trayKey(sample.ams[0].trays[0], "idle", 0),
	humidity: humidityKey({ id: 0, label: "A", kind: "ams2", humidity: 18, humidityLevel: undefined, temperature: 25, dryingLeft: 0, trays: [] }, 0),
	temp: tempKey(sample, "both"),
	pause: pauseKey("printing"),
	stop: stopKey(0, true),
	light: lightKey(true, true),
	speed: speedKey(3),
	dial: tempKey(sample, "nozzle"),
	test: testKey("done"),
	camera: cameraKey("X1C"),
	controls: controlsKey("X1C"),
	preheat: preheatKey("PLA", 220, 60, undefined, true),
	fan: fanKey("part", 60, 0.2),
	info: jobKey(sample, "eta", new Date(2026, 10, 15, 13, 20)),
	move: moveKey("home", true),
	filament: filamentKey("load", sample.ams[0].trays[0], "A1", "idle", true),
	gcode: gcodeKey("Makro", true),
};

for (const [name, uri] of Object.entries(keys)) {
	await pair(svgOf(uri), 72, join(root, "actions", name, "key"));
	await pair(svgOf(uri), 20, join(root, "actions", name, "icon"));
}
console.log("icons written");
