import assert from "node:assert/strict";
import { test } from "node:test";

import { detectModel } from "../.build/bambu/models.js";
import { toStatus } from "../.build/bambu/report.js";
import { panelAt, panelCommands, panelItems, panelPages } from "../.build/panel.js";
import { controlsKey, panelKey } from "../.build/render/panel.js";
import { KEY_GRID } from "../.build/roles.js";

const decode = (uri) => Buffer.from(uri.split(",")[1], "base64").toString("utf8");
const ams = { tray_now: "0", ams: [{ id: "0", tray: [{ id: "0", tray_type: "PLA", tray_color: "C8483AFF" }, { id: "1", tray_type: "PETG" }, { id: "2" }, { id: "3" }] }] };
const idle = toStatus({ gcode_state: "IDLE", ams });
const printing = toStatus({ gcode_state: "RUNNING", mc_percent: 30, layer_num: 3, ams });
const x1c = detectModel("00M00A000000000");
const a1 = detectModel("030000000000000");

test("the panel offers what the printer has", () => {
	const kinds = (m) => panelItems(m, idle).map((i) => (i.kind === "fan" ? `fan:${i.which}` : i.kind === "load" ? `load:${i.label}` : i.kind));
	assert.ok(kinds(x1c).includes("light"));
	assert.ok(kinds(x1c).includes("fan:chamber"));
	assert.ok(!kinds(a1).includes("light"));
	assert.ok(!kinds(a1).includes("fan:aux"));
	// Only loaded spools can be loaded.
	assert.deepEqual(kinds(x1c).filter((k) => k.startsWith("load:")), ["load:A1", "load:A2"]);
});

test("every deck shows every control, pages full, Fertig last", () => {
	const items = panelItems(x1c, idle);
	for (const [type, [columns, rows]] of Object.entries(KEY_GRID)) {
		const pages = panelPages(columns, rows, items);
		const shown = pages.flat().filter((i) => !["prev", "next", "blank", "back"].includes(i.kind));
		assert.deepEqual(shown, items, `type ${type}`);
		for (const page of pages) {
			assert.equal(page.length, columns * rows);
		}
		assert.equal(pages.at(-1).at(-1).kind, "back");
	}
	assert.equal(panelPages(8, 4, items).length, 1);
	assert.equal(panelAt(5, 3, 4, 2, items, 0).kind, "next");
});

test("heating, moving and filament stay off while printing", () => {
	for (const item of [{ kind: "preheat", preset: "pla" }, { kind: "home" }, { kind: "zup" }, { kind: "unload" }, { kind: "load", label: "A1" }]) {
		assert.deepEqual(panelCommands(item, x1c, printing), [], item.kind);
		assert.ok(panelCommands(item, x1c, idle).length > 0, item.kind);
	}
	assert.deepEqual(panelCommands({ kind: "pause" }, x1c, printing), [{ kind: "pause" }]);
	assert.deepEqual(panelCommands({ kind: "pause" }, x1c, idle), []);
	assert.deepEqual(panelCommands({ kind: "load", label: "A3" }, x1c, idle), []);
	assert.deepEqual(panelCommands({ kind: "preheat", preset: "pla" }, x1c, toStatus({ gcode_state: "IDLE", nozzle_target_temper: 220, bed_target_temper: 60 })), [{ kind: "nozzle", target: 0 }, { kind: "bed", target: 0 }]);
});

test("every panel key draws", () => {
	for (const s of [idle, printing]) {
		for (const item of [...panelItems(x1c, s), { kind: "back" }, { kind: "prev" }, { kind: "next" }, { kind: "blank" }]) {
			assert.match(decode(panelKey(item, x1c, s, 0.5, 0.3)), /^<svg[\s\S]*<\/svg>$/);
		}
	}
	assert.match(decode(controlsKey("X1C")), /Steuern/);
});
