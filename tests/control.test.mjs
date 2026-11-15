import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCommand, PRESETS, replyName } from "../.build/bambu/commands.js";
import { toStatus } from "../.build/bambu/report.js";
import { clockAfter, fanKey, filamentKey, gcodeKey, INFO_VIEWS, jobKey, moveKey, preheatKey } from "../.build/render/control.js";

const decode = (uri) => Buffer.from(uri.split(",")[1], "base64").toString("utf8");

test("fans go to the right M106 port", () => {
	assert.match(buildCommand({ kind: "fan", percent: 100 }).print.param, /^M106 P1 S255/);
	assert.match(buildCommand({ kind: "fan", percent: 50, which: "aux" }).print.param, /^M106 P2 S128/);
	assert.match(buildCommand({ kind: "fan", percent: 0, which: "chamber" }).print.param, /^M106 P3 S0/);
});

test("moves are relative, limited and end absolute", () => {
	assert.equal(buildCommand({ kind: "moveZ", mm: 10 }).print.param, "G91\nG0 Z10 F600\nG90\n");
	assert.match(buildCommand({ kind: "moveZ", mm: -500 }).print.param, /Z-50 /);
	assert.equal(buildCommand({ kind: "home" }).print.param, "G28\n");
});

test("filament load names the slot, unload targets 255", () => {
	const load = buildCommand({ kind: "load", slot: 2, amsId: 0, trayIndex: 2, temp: 220 }).print;
	assert.deepEqual([load.command, load.target, load.ams_id, load.slot_id, load.tar_temp], ["ams_change_filament", 2, 0, 2, 220]);
	const unload = buildCommand({ kind: "unload", temp: 999 }).print;
	assert.deepEqual([unload.target, unload.tar_temp], [255, 300]);
});

test("macros keep their lines, replies are matched by name", () => {
	assert.equal(buildCommand({ kind: "gcode", lines: "G28\r\nM400 \n" }).print.param, "G28\nM400\n");
	assert.equal(replyName({ kind: "home" }), "gcode_line");
	assert.equal(replyName({ kind: "load", slot: 0, amsId: 0, trayIndex: 0, temp: 0 }), "ams_change_filament");
	assert.equal(replyName({ kind: "pause" }), "pause");
});

test("spools know their nozzle temperature", () => {
	const s = toStatus({ ams: { tray_now: "0", ams: [{ id: "0", tray: [{ id: "0", tray_type: "PETG", nozzle_temp_min: "240", nozzle_temp_max: "260" }, { id: "1", tray_type: "PLA" }] }] } });
	assert.equal(s.ams[0].trays[0].temp, 250);
	assert.equal(s.ams[0].trays[1].temp, 220);
	assert.equal(s.ams[0].trays[1].trayIndex, 1);
});

test("fan speeds of all three fans are read", () => {
	const s = toStatus({ cooling_fan_speed: "15", big_fan1_speed: "6", big_fan2_speed: "0" });
	assert.deepEqual([s.fan, s.fanAux, s.fanChamber], [100, 40, 0]);
});

test("fertig um: now plus the time left", () => {
	assert.equal(clockAfter(72, new Date(2026, 10, 15, 13, 20)), "14:32");
	assert.equal(clockAfter(90, new Date(2026, 10, 15, 23, 0)), "00:30");
});

test("every new key draws in every state", () => {
	const printing = toStatus({ gcode_state: "RUNNING", mc_percent: 40, layer_num: 12, total_layer_num: 200, mc_remaining_time: 72, subtask_name: "Ein sehr langer Dateiname.3mf", nozzle_target_temper: 220, bed_target_temper: 60, nozzle_temper: 150 });
	const idle = toStatus({ gcode_state: "IDLE" });
	const keys = [
		...Object.values(PRESETS).flatMap((p) => [preheatKey(p.label, p.nozzle, p.bed, printing, true), preheatKey(p.label, p.nozzle, p.bed, undefined, false)]),
		fanKey("part", 0, 0), fanKey("chamber", 100, 1.3),
		...INFO_VIEWS.flatMap((v) => [jobKey(printing, v), jobKey(idle, v)]),
		moveKey("home", true), moveKey("zup", false), moveKey("zdown", true),
		filamentKey("load", undefined, "B2", "idle", true), filamentKey("unload", undefined, "A1", "printing", false),
		gcodeKey("<x>", true), gcodeKey("", false),
	];
	for (const k of keys) {
		assert.match(decode(k), /^<svg[\s\S]*<\/svg>$/);
	}
	assert.doesNotMatch(decode(gcodeKey("<x>", true)), /<x>/);
	assert.match(decode(jobKey(printing, "eta")), /noch 1:12/);
});
