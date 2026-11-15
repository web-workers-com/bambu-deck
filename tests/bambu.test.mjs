import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { buildCommand } from "../.build/bambu/commands.js";
import { configsFrom } from "../.build/bambu/fleet.js";
import { detectModel } from "../.build/bambu/models.js";
import { findTray, hmsList, mergeReport, toStatus, trayColor } from "../.build/bambu/report.js";

const pushall = JSON.parse(readFileSync(new URL("./fixtures/x1c-pushall.json", import.meta.url), "utf8"));

test("a full X1C report becomes a status", () => {
	const s = toStatus(mergeReport({}, pushall));
	assert.equal(s.stage, "printing");
	assert.equal(s.percent, 63);
	assert.equal(s.remaining, 72);
	assert.equal(s.layer, 195);
	assert.equal(s.job, "Halterung_v3");
	assert.equal(s.light, true);
	assert.equal(s.speed, 2);
	assert.equal(s.fan, 73);
	assert.equal(s.chamber, 31);
	assert.equal(s.ams.length, 1);
	assert.equal(s.ams[0].label, "A");
	assert.equal(s.ams[0].kind, "ams");
	assert.equal(s.ams[0].humidityLevel, 4);
	assert.equal(s.ams[0].humidity, undefined);
});

test("trays: labels, colours, what is left, RFID and the active one", () => {
	const s = toStatus(mergeReport({}, pushall));
	const [a1, a2, a3, a4] = s.ams[0].trays;
	assert.deepEqual([a1.label, a2.label, a3.label, a4.label], ["A1", "A2", "A3", "A4"]);
	assert.equal(a1.color, "#1A1A1A");
	assert.equal(a1.remain, 82);
	assert.equal(a2.active, true);
	assert.equal(a1.active, false);
	assert.equal(a4.rfid, false);
	assert.equal(a4.remain, undefined, "no RFID: unknown, not 0 %");
	assert.equal(a2.name, "PETG HF");
	assert.equal(findTray(s, "active")?.label, "A2");
	assert.equal(findTray(s, "a3")?.remain, 12);
	assert.equal(s.external?.loaded, false);
});

test("deltas (P1, A1) update the running state", () => {
	let raw = mergeReport({}, pushall);
	raw = mergeReport(raw, { print: { command: "push_status", mc_percent: 64, nozzle_temper: 221 } });
	raw = mergeReport(raw, { print: { command: "push_status", ams: { tray_now: "2" } } });
	const s = toStatus(raw);
	assert.equal(s.percent, 64);
	assert.equal(s.nozzle, 221);
	assert.equal(s.layer, 195, "untouched fields stay");
	assert.equal(findTray(s, "active")?.label, "A3");
	assert.equal(s.ams[0].trays.length, 4, "a partial AMS update keeps the trays");
});

test("an AMS list replaces the old one: removed spools and units disappear", () => {
	let raw = mergeReport({}, pushall);
	// The printer reports an empty slot as just its id.
	const trays = pushall.print.ams.ams[0].tray.map((t) => (t.id === "1" ? { id: "1" } : t));
	raw = mergeReport(raw, { print: { ams: { ams: [{ id: "0", humidity: "3", tray: trays }] } } });
	const s = toStatus(raw);
	assert.equal(findTray(s, "A2")?.loaded, false);
	assert.equal(findTray(s, "A1")?.remain, 82);
	assert.equal(s.ams[0].humidityLevel, 3);
	raw = mergeReport(raw, { print: { ams: { ams: [] , tray_now: "255"} } });
	assert.equal(toStatus(raw).ams.length, 1, "an empty list is not trusted (sent while busy)");
});

test("command replies are not state", () => {
	const raw = mergeReport({}, pushall);
	assert.equal(mergeReport(raw, { print: { command: "pause", result: "success", sequence_id: "3" } }), raw);
});

test("stages from gcode_state", () => {
	const stage = (p) => toStatus(p).stage;
	assert.equal(stage({ gcode_state: "IDLE" }), "idle");
	assert.equal(stage({ gcode_state: "PREPARE" }), "heating");
	assert.equal(stage({ gcode_state: "RUNNING", mc_percent: 0, layer_num: 0 }), "heating");
	assert.equal(stage({ gcode_state: "RUNNING", mc_percent: 1, layer_num: 1 }), "printing");
	assert.equal(stage({ gcode_state: "PAUSE" }), "paused");
	assert.equal(stage({ gcode_state: "FINISH" }), "finished");
	assert.equal(stage({ gcode_state: "FAILED" }), "failed");
	assert.equal(stage({}), "idle");
});

test("AMS 2 Pro, AMS HT and external spool", () => {
	const s = toStatus({
		ams: {
			tray_now: "128",
			ams: [
				{ id: "0", humidity_raw: "18", dry_time: 0, tray: [{ id: "0", tray_type: "PETG", tray_color: "E5604DFF", remain: 75, tag_uid: "11" }] },
				{ id: "128", humidity_raw: "9", dry_time: 220, tray: [{ id: "0", tray_type: "PA-CF", tray_color: "3B3D42FF", remain: 60, tag_uid: "22" }] },
			],
		},
		vt_tray: { id: "254", tray_type: "TPU", tray_color: "FFFFFFFF", remain: -1, tag_uid: "0000000000000000" },
	});
	assert.equal(s.ams[0].kind, "ams2");
	assert.equal(s.ams[0].humidity, 18);
	assert.equal(s.ams[1].kind, "ht");
	assert.equal(s.ams[1].label, "HT1");
	assert.equal(s.ams[1].dryingLeft, 220);
	assert.equal(findTray(s, "HT1")?.active, true);
	assert.equal(findTray(s, "Ext")?.material, "TPU");
	assert.equal(findTray(s, "Ext")?.remain, undefined);
});

test("AMS lite has no humidity", () => {
	const s = toStatus({ ams: { ams: [{ id: "0", humidity: "5", tray: [] }] } }, { liteHint: true });
	assert.equal(s.ams[0].kind, "lite");
	assert.equal(s.ams[0].humidityLevel, undefined);
});

test("colours: transparent and junk become unknown", () => {
	assert.equal(trayColor("FF8800FF"), "#FF8800");
	assert.equal(trayColor("00000000"), "");
	assert.equal(trayColor("nope"), "");
	assert.equal(trayColor(undefined), "");
});

test("HMS codes and severity", () => {
	const [h] = hmsList([{ attr: 0x07008000, code: 0x00020001 }]);
	assert.equal(h.code, "0700_8000_0002_0001");
	assert.equal(h.severity, "serious");
});

test("models from serial prefixes, or chosen by hand", () => {
	assert.equal(detectModel("00M09A123456789").id, "X1C");
	assert.equal(detectModel("01P00A123456789").id, "P1S");
	assert.equal(detectModel("030xyz").id, "A1M");
	assert.equal(detectModel("030xyz").ams, "lite");
	assert.equal(detectModel("ZZZ").id, "?");
	assert.equal(detectModel("ZZZ", "H2D").dualNozzle, true);
});

test("commands as the printer expects them", () => {
	assert.equal(buildCommand({ kind: "pushall" }).pushing.command, "pushall");
	assert.equal(buildCommand({ kind: "pause" }).print.command, "pause");
	assert.equal(buildCommand({ kind: "light", on: false }).system.led_mode, "off");
	assert.equal(buildCommand({ kind: "speed", level: 9 }).print.param, "4");
	assert.equal(buildCommand({ kind: "nozzle", target: 999 }).print.param, "M104 S300\n");
	assert.equal(buildCommand({ kind: "bed", target: 60 }).print.param, "M140 S60\n");
	assert.equal(buildCommand({ kind: "fan", percent: 50 }).print.param, "M106 P1 S128\n");
});

test("printer settings: empty slots are skipped, demo adds three", () => {
	const list = configsFrom({ p1_name: "Werkstatt", p1_host: "192.168.1.42", p1_serial: "00m09a", p1_code: "12345678", p3_host: "10.0.0.3" });
	assert.deepEqual(
		list.map((c) => [c.id, c.name, c.serial]),
		[
			["1", "Werkstatt", "00M09A"],
			["3", "Drucker 3", ""],
		],
	);
	assert.equal(configsFrom({ demo: true }).length, 3);
});
