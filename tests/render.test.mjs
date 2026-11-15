import assert from "node:assert/strict";
import { test } from "node:test";

import { toStatus } from "../.build/bambu/report.js";
import { humidityKey, printerKey, speedKey, stopKey, tempKey, trayKey } from "../.build/render/keys.js";
import { alertKey } from "../.build/render/scene.js";
import { answersFor, KEY_GRID, roleAt } from "../.build/roles.js";
import { text, textWidth } from "../.build/render/svg.js";

const decode = (uri) => Buffer.from(uri.split(",")[1], "base64").toString("utf8");
const isSvg = (uri) => assert.match(decode(uri), /^<svg[\s\S]*<\/svg>$/);

test("text never gets wider than its box", () => {
	for (const value of ["Fertig!", "Filament leer", "Ein sehr langer Druckername für eine Taste", "x"]) {
		for (const max of [40, 96, 100]) {
			const svg = text(value, { x: 0, y: 0, size: 16, max, fill: "#000" });
			const size = Number(/font-size="([\d.]+)"/.exec(svg)[1]);
			const shown = />([^<]*)<\/text>/.exec(svg)[1].replace(/&#\d+;/g, "x");
			const pinned = /textLength="([\d.]+)"/.exec(svg);
			const width = pinned ? Number(pinned[1]) : textWidth(shown, size);
			assert.ok(width <= max + 0.01, `${value} at ${max}: ${width}`);
		}
	}
});

test("names with markup are escaped", () => {
	assert.doesNotMatch(decode(printerKey({ status: toStatus({}), name: "<b>&", look: "compact", t: 0 })), /<b>/);
});

test("every stage draws, in both looks", () => {
	for (const state of ["IDLE", "PREPARE", "RUNNING", "PAUSE", "FINISH", "FAILED"]) {
		const status = toStatus({ gcode_state: state, mc_percent: 40, layer_num: 3 });
		for (const look of ["bao", "compact"]) {
			isSvg(printerKey({ status, name: "X1C", look, t: 1.3 }));
		}
	}
	isSvg(printerKey({ status: { ...toStatus({}), stage: "offline" }, name: "X1C", t: 0 }));
});

test("other keys draw with missing data", () => {
	const s = toStatus({});
	isSvg(trayKey(undefined, "idle", 0, "B3"));
	isSvg(humidityKey(undefined, 0));
	isSvg(tempKey(s, "chamber"));
	isSvg(speedKey(0));
	isSvg(stopKey(0.5, true));
});

test("same input, same image (the ticker relies on it)", () => {
	const status = toStatus({ gcode_state: "RUNNING", mc_percent: 40, layer_num: 3 });
	assert.equal(printerKey({ status, name: "X", t: 2 }), printerKey({ status, name: "X", t: 2 }));
});

test("every device grid has all answers and draws every key", () => {
	for (const kind of ["finished", "paused", "hms", "failed"]) {
		for (const [columns, rows] of Object.values(KEY_GRID)) {
			const roles = [];
			for (let r = 0; r < rows; r++) {
				for (let c = 0; c < columns; c++) {
					roles.push(roleAt(columns, rows, c, r, kind));
					isSvg(alertKey({ columns, rows, alert: { printer: "X1C", level: "done", kind, title: "Fertig!" }, t: 0 }, c, r));
				}
			}
			const want = columns * rows >= answersFor(kind).length + 1 ? answersFor(kind) : answersFor(kind).slice(0, 1);
			for (const a of want) {
				if (columns >= 2 || a === want[0]) {
					assert.ok(roles.includes(a), `${columns}x${rows} ${kind}: ${a} missing`);
				}
			}
		}
	}
});
