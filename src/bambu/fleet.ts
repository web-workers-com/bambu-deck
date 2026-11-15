/**
 * All printers the deck knows: up to four from the settings, plus the demo
 * printers when they are switched on. Keys ask the fleet for "their" printer.
 */
import { EventEmitter } from "node:events";

import { LanPrinter, type CommandResult, type Printer, type PrinterConfig } from "./connection.js";
import { DEMO_PRINTERS, DemoPrinter } from "./demo.js";

export const SLOTS = ["1", "2", "3", "4"] as const;

/** Global settings as the property inspector stores them (flat, one set per slot). */
export type GlobalSettings = {
	demo?: boolean;
	[key: `p${number}_${"name" | "host" | "serial" | "code" | "model"}`]: string | undefined;
};

export function configsFrom(settings: GlobalSettings): PrinterConfig[] {
	const out: PrinterConfig[] = [];
	for (const slot of SLOTS) {
		const get = (k: string) => String((settings as Record<string, unknown>)[`p${slot}_${k}`] ?? "").trim();
		const host = get("host");
		const serial = get("serial").toUpperCase();
		const accessCode = get("code");
		if (!host && !serial) {
			continue;
		}
		out.push({ id: slot, name: get("name") || `Drucker ${slot}`, host, serial, accessCode, model: get("model") || "auto" });
	}
	if (settings.demo) {
		out.push(...DEMO_PRINTERS);
	}
	return out;
}

const same = (a: PrinterConfig, b: PrinterConfig) => JSON.stringify(a) === JSON.stringify(b);

export type FleetEvents = {
	change: [];
	status: [printer: Printer];
	result: [printer: Printer, result: CommandResult];
	log: [message: string];
};

export class Fleet extends EventEmitter<FleetEvents> {
	#printers = new Map<string, Printer>();

	constructor(private readonly make: (c: PrinterConfig) => Printer = (c) => (c.id.startsWith("demo-") ? new DemoPrinter(c) : new LanPrinter(c))) {
		super();
	}

	/** Applies new settings: starts new printers, restarts changed ones, stops removed ones. */
	configure(settings: GlobalSettings): void {
		const wanted = configsFrom(settings);
		let changed = false;
		for (const [id, printer] of this.#printers) {
			const next = wanted.find((c) => c.id === id);
			if (!next || !same(next, printer.config)) {
				printer.stop();
				printer.removeAllListeners();
				this.#printers.delete(id);
				changed = true;
			}
		}
		for (const config of wanted) {
			if (this.#printers.has(config.id)) {
				continue;
			}
			const printer = this.make(config);
			printer.on("status", () => this.emit("status", printer));
			printer.on("result", (r) => this.emit("result", printer, r));
			printer.on("log", (m) => this.emit("log", m));
			this.#printers.set(config.id, printer);
			printer.start();
			changed = true;
		}
		if (changed) {
			this.emit("change");
		}
	}

	list(): Printer[] {
		return [...this.#printers.values()];
	}

	/** The printer a key names; no name means the first one there is. */
	get(id: string | undefined): Printer | undefined {
		return id ? this.#printers.get(id) : this.list()[0];
	}

	stopAll(): void {
		for (const p of this.#printers.values()) {
			p.stop();
		}
	}
}
