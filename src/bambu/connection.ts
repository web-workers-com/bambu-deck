/**
 * One printer on the LAN: keeps an MQTT connection open, folds its reports
 * into a status, and sends commands. Reconnects by itself with a growing pause.
 */
import { EventEmitter } from "node:events";

import { MqttClient } from "../mqtt/client.js";
import { buildCommand, type Command } from "./commands.js";
import { detectModel, type Model } from "./models.js";
import { mergeReport, OFFLINE, toStatus, type Raw, type Status } from "./report.js";

export type PrinterConfig = {
	/** Slot in the settings, "1".."4", or "demo-…" for simulated printers. */
	id: string;
	name: string;
	host: string;
	serial: string;
	accessCode: string;
	/** "auto" or a model id from models.ts. */
	model?: string;
};

export type CommandResult = { command: string; ok: boolean; reason: string };

export type PrinterEvents = {
	status: [status: Status];
	result: [result: CommandResult];
	log: [message: string];
};

/** What every printer, real or simulated, offers the deck. */
export interface Printer extends EventEmitter<PrinterEvents> {
	readonly config: PrinterConfig;
	readonly model: Model;
	readonly status: Status;
	/** Last reason the connection failed, "" when connected. */
	readonly problem: string;
	send(command: Command): boolean;
	start(): void;
	stop(): void;
}

const SILENCE_MS = 90_000;

export class LanPrinter extends EventEmitter<PrinterEvents> implements Printer {
	#client: MqttClient | undefined;
	#raw: Raw = {};
	#status: Status = OFFLINE;
	#retry: NodeJS.Timeout | undefined;
	#watchdog: NodeJS.Timeout | undefined;
	#delay = 3000;
	#running = false;
	problem = "";
	readonly model: Model;

	constructor(readonly config: PrinterConfig) {
		super();
		this.model = detectModel(config.serial, config.model);
	}

	get status(): Status {
		return this.#status;
	}

	start(): void {
		if (this.#running) {
			return;
		}
		this.#running = true;
		this.#connect();
	}

	stop(): void {
		this.#running = false;
		clearTimeout(this.#retry);
		clearTimeout(this.#watchdog);
		this.#client?.removeAllListeners();
		this.#client?.end();
		this.#client = undefined;
	}

	send(command: Command): boolean {
		const ok = this.#client?.publish(`device/${this.config.serial}/request`, JSON.stringify(buildCommand(command))) ?? false;
		this.emit("log", `${this.config.name}: ${command.kind} ${ok ? "gesendet" : "nicht verbunden"}`);
		return ok;
	}

	#connect(): void {
		const { host, serial, accessCode } = this.config;
		if (!host || !serial || !accessCode) {
			this.problem = "Drucker nicht eingerichtet";
			this.#setStatus(OFFLINE);
			return;
		}
		const client = new MqttClient({
			host,
			port: 8883,
			username: "bblp",
			password: accessCode,
			clientId: `bambu-deck-${Math.random().toString(16).slice(2, 10)}`,
		});
		this.#client = client;

		client.on("connect", () => {
			this.#delay = 3000;
			this.problem = "";
			this.emit("log", `${this.config.name}: verbunden mit ${host}`);
			client.subscribe(`device/${serial}/report`);
			this.send({ kind: "pushall" });
			this.#feedWatchdog();
		});
		client.on("message", (_topic, payload) => this.#onMessage(payload));
		client.on("close", (reason) => {
			this.problem = reason;
			this.emit("log", `${this.config.name}: ${reason}`);
			this.#client = undefined;
			clearTimeout(this.#watchdog);
			this.#setStatus(OFFLINE);
			if (this.#running) {
				this.#retry = setTimeout(() => this.#connect(), this.#delay);
				this.#retry.unref?.();
				this.#delay = Math.min(this.#delay * 2, 60_000);
			}
		});
		client.start();
	}

	#feedWatchdog(): void {
		clearTimeout(this.#watchdog);
		// A printer that went to sleep may keep the socket but stop talking.
		this.#watchdog = setTimeout(() => this.#client?.end(), SILENCE_MS);
		this.#watchdog.unref?.();
	}

	#onMessage(payload: Buffer): void {
		this.#feedWatchdog();
		let message: Raw;
		try {
			message = JSON.parse(payload.toString("utf8"));
		} catch {
			return;
		}
		const result = commandResult(message);
		if (result) {
			this.emit("result", result);
		}
		const next = mergeReport(this.#raw, message);
		if (next !== this.#raw) {
			this.#raw = next;
			this.#setStatus(toStatus(next, { liteHint: this.model.ams === "lite" }));
		}
	}

	#setStatus(status: Status): void {
		this.#status = status;
		this.emit("status", status);
	}
}

/** Replies to our commands ("result": "success" | "failed"). */
export function commandResult(message: Raw): CommandResult | undefined {
	for (const section of ["print", "system"]) {
		const s = message?.[section];
		if (s && typeof s.command === "string" && typeof s.result === "string" && s.command !== "push_status") {
			const ok = s.result.toLowerCase() === "success";
			return { command: s.command, ok, reason: String(s.reason ?? "") };
		}
	}
	return undefined;
}
