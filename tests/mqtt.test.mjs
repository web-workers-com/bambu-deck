import assert from "node:assert/strict";
import { test } from "node:test";

import { connect, encodeLength, Parser, publish, subscribe } from "../.build/mqtt/packets.js";

test("remaining length uses MQTT's varint", () => {
	assert.deepEqual([...encodeLength(0)], [0]);
	assert.deepEqual([...encodeLength(127)], [127]);
	assert.deepEqual([...encodeLength(128)], [0x80, 0x01]);
	assert.deepEqual([...encodeLength(16383)], [0xff, 0x7f]);
	assert.deepEqual([...encodeLength(2097151)], [0xff, 0xff, 0x7f]);
});

test("CONNECT carries user, password and keep-alive", () => {
	const p = connect({ clientId: "deck", username: "bblp", password: "12345678", keepAlive: 30 });
	assert.equal(p[0], 0x10);
	assert.equal(p.subarray(2, 8).toString("latin1"), "\u0000\u0004MQTT");
	assert.equal(p[8], 4, "protocol level 3.1.1");
	assert.equal(p[9], 0xc2, "username + password + clean session");
	assert.equal(p.readUInt16BE(10), 30);
	assert.ok(p.includes(Buffer.from("bblp")));
	assert.ok(p.includes(Buffer.from("12345678")));
});

test("SUBSCRIBE asks for QoS 0", () => {
	const p = subscribe(7, "device/X/report");
	assert.equal(p[0], 0x82);
	assert.equal(p.readUInt16BE(2), 7);
	assert.equal(p[p.length - 1], 0);
});

test("the parser reassembles packets split across chunks", () => {
	const big = JSON.stringify({ print: { pad: "x".repeat(20000) } });
	const stream = Buffer.concat([Buffer.from([0x20, 0x02, 0x00, 0x00]), publish("device/X/report", big), Buffer.from([0xd0, 0x00])]);
	const parser = new Parser();
	const got = [];
	for (let i = 0; i < stream.length; i += 997) {
		got.push(...parser.push(stream.subarray(i, i + 997)));
	}
	assert.equal(got.length, 3);
	assert.equal(got[0].type, 2);
	assert.equal(got[0].code, 0);
	assert.equal(got[1].topic, "device/X/report");
	assert.equal(got[1].payload.toString(), big);
	assert.equal(got[2].type, 13);
});

test("QoS 1 publish keeps its packet id", () => {
	const body = Buffer.concat([Buffer.from([0, 1]), Buffer.from("t"), Buffer.from([0x12, 0x34]), Buffer.from("hi")]);
	const [p] = new Parser().push(Buffer.concat([Buffer.from([0x32, body.length]), body]));
	assert.equal(p.qos, 1);
	assert.equal(p.packetId, 0x1234);
	assert.equal(p.payload.toString(), "hi");
});
