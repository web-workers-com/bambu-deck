/**
 * The handful of MQTT 3.1.1 packets a Bambu printer needs: connect, subscribe,
 * publish (QoS 0), ping and disconnect. Pure functions, so they can be tested
 * without a socket.
 */

export const enum Type {
	Connect = 1,
	ConnAck = 2,
	Publish = 3,
	PubAck = 4,
	Subscribe = 8,
	SubAck = 9,
	PingReq = 12,
	PingResp = 13,
	Disconnect = 14,
}

function str(value: string): Buffer {
	const body = Buffer.from(value, "utf8");
	const head = Buffer.alloc(2);
	head.writeUInt16BE(body.length);
	return Buffer.concat([head, body]);
}

/** MQTT's variable-length "remaining length". */
export function encodeLength(length: number): Buffer {
	const bytes: number[] = [];
	do {
		let byte = length % 128;
		length = Math.floor(length / 128);
		if (length > 0) {
			byte |= 0x80;
		}
		bytes.push(byte);
	} while (length > 0);
	return Buffer.from(bytes);
}

function packet(first: number, body: Buffer): Buffer {
	return Buffer.concat([Buffer.from([first]), encodeLength(body.length), body]);
}

export function connect(o: { clientId: string; username: string; password: string; keepAlive: number }): Buffer {
	const header = Buffer.concat([str("MQTT"), Buffer.from([4, 0xc2]), Buffer.from([o.keepAlive >> 8, o.keepAlive & 0xff])]);
	return packet(Type.Connect << 4, Buffer.concat([header, str(o.clientId), str(o.username), str(o.password)]));
}

export function subscribe(packetId: number, topic: string): Buffer {
	return packet((Type.Subscribe << 4) | 0x02, Buffer.concat([Buffer.from([packetId >> 8, packetId & 0xff]), str(topic), Buffer.from([0])]));
}

export function publish(topic: string, payload: string | Buffer): Buffer {
	return packet(Type.Publish << 4, Buffer.concat([str(topic), Buffer.isBuffer(payload) ? payload : Buffer.from(payload, "utf8")]));
}

export function pubAck(packetId: number): Buffer {
	return packet(Type.PubAck << 4, Buffer.from([packetId >> 8, packetId & 0xff]));
}

export const PINGREQ = Buffer.from([Type.PingReq << 4, 0]);
export const DISCONNECT = Buffer.from([Type.Disconnect << 4, 0]);

export type Packet =
	| { type: Type.ConnAck; code: number }
	| { type: Type.Publish; topic: string; payload: Buffer; qos: number; packetId?: number }
	| { type: Type.SubAck; packetId: number; granted: number[] }
	| { type: Type.PingResp }
	| { type: number };

/**
 * Splits a byte stream into packets. Feed it whatever arrives; it keeps the
 * unfinished tail for the next call.
 */
export class Parser {
	#buffer: Buffer = Buffer.alloc(0);

	push(chunk: Buffer): Packet[] {
		this.#buffer = this.#buffer.length ? Buffer.concat([this.#buffer, chunk]) : chunk;
		const out: Packet[] = [];
		for (;;) {
			const parsed = this.#next();
			if (!parsed) {
				return out;
			}
			out.push(parsed);
		}
	}

	#next(): Packet | undefined {
		const b = this.#buffer;
		if (b.length < 2) {
			return undefined;
		}
		let length = 0;
		let multiplier = 1;
		let i = 1;
		for (;;) {
			if (i >= b.length) {
				return undefined;
			}
			const byte = b[i++]!;
			length += (byte & 0x7f) * multiplier;
			if ((byte & 0x80) === 0) {
				break;
			}
			multiplier *= 128;
			if (i > 4) {
				throw new Error("malformed remaining length");
			}
		}
		if (b.length < i + length) {
			return undefined;
		}
		const first = b[0]!;
		const body = b.subarray(i, i + length);
		this.#buffer = b.subarray(i + length);
		return decode(first, body);
	}
}

function decode(first: number, body: Buffer): Packet {
	const type = first >> 4;
	switch (type) {
		case Type.ConnAck:
			return { type, code: body[1] ?? 255 };
		case Type.Publish: {
			const qos = (first >> 1) & 0x03;
			const topicLength = body.readUInt16BE(0);
			const topic = body.subarray(2, 2 + topicLength).toString("utf8");
			let offset = 2 + topicLength;
			let packetId: number | undefined;
			if (qos > 0) {
				packetId = body.readUInt16BE(offset);
				offset += 2;
			}
			return { type, topic, qos, packetId, payload: Buffer.from(body.subarray(offset)) };
		}
		case Type.SubAck:
			return { type, packetId: body.readUInt16BE(0), granted: [...body.subarray(2)] };
		default:
			return { type };
	}
}
