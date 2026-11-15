import assert from "node:assert/strict";
import { test } from "node:test";

import { cameraKind, JpegFrames, jpegLogin, MjpegSplitter } from "../.build/bambu/camera.js";
import { detectModel } from "../.build/bambu/models.js";
import { canvasSize, cameraDeckKey, cameraKey } from "../.build/render/camera.js";

const jpeg = (n) => Buffer.from([0xff, 0xd8, ...Array(n).fill(7), 0xff, 0xd9]);

test("P1 and A1 send JPEGs, the others video", () => {
	assert.equal(cameraKind(detectModel("01P00A000000000")), "jpeg");
	assert.equal(cameraKind(detectModel("030000000000000")), "jpeg");
	assert.equal(cameraKind(detectModel("00M00A000000000")), "rtsps");
	assert.equal(cameraKind(detectModel("", "H2D")), "rtsps");
});

test("port-6000 login: sizes, user and code at fixed places", () => {
	const b = jpegLogin("12345678");
	assert.equal(b.length, 80);
	assert.equal(b.readUInt32LE(0), 0x40);
	assert.equal(b.readUInt32LE(4), 0x3000);
	assert.equal(b.toString("ascii", 16, 20), "bblp");
	assert.equal(b.toString("ascii", 48, 56), "12345678");
	assert.equal(b[56], 0);
});

test("port-6000 frames are cut out even when split across packets", () => {
	const frame = (j) => Buffer.concat([Buffer.from([j.length & 0xff, j.length >> 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), j]);
	const all = Buffer.concat([frame(jpeg(10)), frame(jpeg(300))]);
	const f = new JpegFrames();
	const out = [...f.push(all.subarray(0, 7)), ...f.push(all.subarray(7, 40)), ...f.push(all.subarray(40))];
	assert.deepEqual(out.map((b) => b.length), [14, 304]);
});

test("ffmpeg output splits into single JPEGs", () => {
	const s = new MjpegSplitter();
	const stream = Buffer.concat([jpeg(5), jpeg(9), jpeg(3)]);
	const out = [...s.push(stream.subarray(0, 12)), ...s.push(stream.subarray(12))];
	assert.deepEqual(out.map((b) => b.length), [9, 13, 7]);
});

test("each key shows its own part of the frame, gaps counted in", () => {
	const { width, height } = canvasSize(5, 3);
	assert.deepEqual([width, height], [720, 420]);
	const uri = cameraDeckKey({ columns: 5, rows: 3, jpeg: jpeg(4), printer: "X1C", problem: "", t: 0 }, 2, 1);
	assert.match(uri, /^data:image\/svg\+xml;charset=utf8,<svg/);
	assert.match(uri, /<image x="-300" y="-150" width="720" height="420"/);
	// Without a frame one key says why.
	const waiting = cameraDeckKey({ columns: 5, rows: 3, jpeg: undefined, printer: "X1C", problem: "ffmpeg fehlt", t: 0 }, 2, 1);
	assert.match(Buffer.from(waiting.split(",")[1], "base64").toString("utf8"), /ffmpeg fehlt/);
	assert.match(cameraKey("X1C"), /^data:image\/svg\+xml;base64,/);
});
