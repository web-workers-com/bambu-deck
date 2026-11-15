import assert from "node:assert/strict";
import { test } from "node:test";

import { AlertCenter, alertFor } from "../.build/alerts.js";
import { toStatus } from "../.build/bambu/report.js";

const S = (p) => toStatus(p);
const printing = S({ gcode_state: "RUNNING", mc_percent: 50, layer_num: 10, subtask_name: "Benchy" });

const t = (before, after) => alertFor({ printerId: "1", printer: "X1C", before, after });

test("finished after printing: Bao is happy", () => {
	const a = t(printing, S({ gcode_state: "FINISH", subtask_name: "Benchy" }));
	assert.equal(a.level, "done");
	assert.equal(a.kind, "finished");
	assert.match(a.detail, /Benchy/);
});

test("finished seen at start-up is not news", () => {
	assert.equal(t(undefined, S({ gcode_state: "FINISH" })), undefined);
	assert.equal(t(S({ gcode_state: "IDLE" }), S({ gcode_state: "FINISH" })), undefined);
});

test("cancelled by the user: no alarm", () => {
	assert.equal(t(printing, S({ gcode_state: "FAILED", print_error: 0x0300400c })), undefined);
	assert.equal(alertFor({ printerId: "1", printer: "X1C", before: printing, after: S({ gcode_state: "FAILED" }) }, true), undefined);
});

test("failed for real: error", () => {
	const a = t(printing, S({ gcode_state: "FAILED", print_error: 0x0c00_8001 }));
	assert.equal(a.level, "error");
	assert.match(a.detail, /0C008001/);
});

test("filament runout pauses: Bao waits for you", () => {
	const a = t(printing, S({ gcode_state: "PAUSE", print_error: 0x07008011 }));
	assert.equal(a.level, "wait");
	assert.equal(a.title, "Filament leer");
});

test("a pause by hand is not an alarm", () => {
	assert.equal(t(printing, S({ gcode_state: "PAUSE" })), undefined);
});

test("a new serious HMS message while printing", () => {
	const a = t(printing, S({ gcode_state: "RUNNING", mc_percent: 51, layer_num: 11, hms: [{ attr: 0x0c000300, code: 0x00020001 }] }));
	assert.equal(a.kind, "hms");
	assert.equal(t(printing, S({ gcode_state: "RUNNING", mc_percent: 51, layer_num: 11, hms: [{ attr: 1, code: 0x00040001 }] })), undefined, "info is ignored");
});

test("the center: takeover, snooze, resolve, and printing again clears", () => {
	const center = new AlertCenter(60_000);
	const events = [];
	center.on("takeover", () => events.push("takeover"));
	center.on("release", () => events.push("release"));

	center.observe("1", "X1C", printing);
	center.observe("1", "X1C", S({ gcode_state: "FINISH" }));
	assert.equal(center.current?.level, "done");
	assert.deepEqual(events, ["takeover"]);

	center.snooze();
	assert.deepEqual(events, ["takeover", "release"]);
	assert.ok(center.current?.snoozedUntil);

	center.observe("1", "X1C", printing);
	assert.equal(center.current, undefined, "a new print clears the old alert");
});

test("errors outrank finished prints", () => {
	const center = new AlertCenter();
	center.observe("1", "X1C", printing);
	center.observe("2", "A1", printing);
	center.observe("1", "X1C", S({ gcode_state: "FINISH" }));
	center.observe("2", "A1", S({ gcode_state: "PAUSE", print_error: 0x0c008001 }));
	assert.equal(center.current?.printerId, "2");
	center.resolve();
	assert.equal(center.current?.printerId, "1");
});
