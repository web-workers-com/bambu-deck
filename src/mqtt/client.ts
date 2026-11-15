/**
 * A small MQTT client over TLS, enough for one Bambu printer: connects,
 * subscribes, publishes and keeps the line alive. Reconnecting is the
 * caller's job (see bambu/connection.ts).
 */
import { EventEmitter } from "node:events";
import tls from "node:tls";

import { connect, DISCONNECT, Parser, PINGREQ, publish, pubAck, subscribe, Type, type Packet } from "./packets.js";

export type ClientOptions = {
	host: string;
	port: number;
	username: string;
	password: string;
	clientId: string;
	keepAlive?: number;
	/** Bambu printers use a certificate from their own CA; LAN mode cannot verify it. */
	rejectUnauthorized?: boolean;
	timeoutMs?: number;
};

export type ClientEvents = {
	connect: [];
	message: [topic: string, payload: Buffer];
	close: [reason: string];
};

/** CONNACK return codes, in words. */
export const CONNACK_REASON: Record<number, string> = {
	1: "Protokoll abgelehnt",
	2: "Client-ID abgelehnt",
	3: "Server nicht verfügbar",
	4: "Zugangscode falsch",
	5: "nicht berechtigt",
};

export class MqttClient extends EventEmitter<ClientEvents> {
	#socket: tls.TLSSocket | undefined;
	#parser = new Parser();
	#ping: NodeJS.Timeout | undefined;
	#timeout: NodeJS.Timeout | undefined;
	#packetId = 1;
	#closed = false;
	connected = false;

	constructor(private readonly o: ClientOptions) {
		super();
	}

	start(): void {
		const keepAlive = this.o.keepAlive ?? 30;
		const socket = tls.connect({
			host: this.o.host,
			port: this.o.port,
			rejectUnauthorized: this.o.rejectUnauthorized ?? false,
			// The printer's certificate names its serial, not its IP.
			checkServerIdentity: () => undefined,
		});
		this.#socket = socket;
		this.#timeout = setTimeout(() => this.#close("Zeitüberschreitung beim Verbinden"), this.o.timeoutMs ?? 10_000);

		socket.on("secureConnect", () => {
			socket.write(connect({ clientId: this.o.clientId, username: this.o.username, password: this.o.password, keepAlive }));
		});
		socket.on("data", (chunk: Buffer) => {
			let packets: Packet[];
			try {
				packets = this.#parser.push(chunk);
			} catch (error) {
				this.#close(`Protokollfehler: ${(error as Error).message}`);
				return;
			}
			for (const p of packets) {
				this.#handle(p, keepAlive);
			}
		});
		socket.on("error", (error: Error) => this.#close(error.message));
		socket.on("close", () => this.#close("Verbindung getrennt"));
	}

	#handle(p: Packet, keepAlive: number): void {
		if (p.type === Type.ConnAck && "code" in p) {
			clearTimeout(this.#timeout);
			if (p.code !== 0) {
				this.#close(CONNACK_REASON[p.code] ?? `abgelehnt (${p.code})`);
				return;
			}
			this.connected = true;
			this.#ping = setInterval(() => this.#socket?.write(PINGREQ), (keepAlive * 1000) / 2);
			this.#ping.unref?.();
			this.emit("connect");
		} else if (p.type === Type.Publish && "topic" in p) {
			if (p.qos === 1 && p.packetId !== undefined) {
				this.#socket?.write(pubAck(p.packetId));
			}
			this.emit("message", p.topic, p.payload);
		}
	}

	subscribe(topic: string): void {
		this.#packetId = (this.#packetId % 0xfffe) + 1;
		this.#socket?.write(subscribe(this.#packetId, topic));
	}

	publish(topic: string, payload: string): boolean {
		if (!this.connected || !this.#socket) {
			return false;
		}
		this.#socket.write(publish(topic, payload));
		return true;
	}

	end(reason = "beendet"): void {
		if (this.connected) {
			this.#socket?.write(DISCONNECT);
		}
		this.#close(reason);
	}

	#close(reason: string): void {
		if (this.#closed) {
			return;
		}
		this.#closed = true;
		this.connected = false;
		clearTimeout(this.#timeout);
		clearInterval(this.#ping);
		this.#socket?.destroy();
		this.emit("close", reason);
	}
}
