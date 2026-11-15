/**
 * Simulated printers for trying the deck without hardware, and for the
 * models nobody on the team owns. They speak the same report format as the
 * real thing and go through the same parser.
 */
import { EventEmitter } from "node:events";

import type { Command } from "./commands.js";
import type { Printer, PrinterConfig, PrinterEvents } from "./connection.js";
import { detectModel, type Model } from "./models.js";
import { mergeReport, toStatus, type Raw, type Status } from "./report.js";

type Scenario = "x1c" | "a1mini" | "h2d";

const tray = (id: number, type: string, color: string, remain: number, rfid = true, name = "") => ({
	id: String(id),
	tray_type: type,
	tray_sub_brands: name || (type ? `${type} Basic` : ""),
	tray_color: color,
	remain: rfid ? remain : -1,
	tag_uid: rfid ? "A1B2C3D4E5F60718" : "0000000000000000",
});

/** The starting state per scenario: printer, AMS units and spools. */
function base(s: Scenario): Raw {
	switch (s) {
		case "x1c":
			return {
				gcode_state: "IDLE",
				subtask_name: "Halterung_v3",
				lights_report: [{ node: "chamber_light", mode: "on" }],
				chamber_temper: 31,
				ams: {
					tray_now: "255",
					ams: [
						{ id: "0", humidity: "4", temp: "27.5", tray: [tray(0, "PLA", "1A1A1AFF", 82), tray(1, "PETG", "F4F2ECFF", 41, true, "PETG HF"), tray(2, "PLA", "C8483AFF", 12, true, "PLA Matte"), tray(3, "PLA", "2F6E8FFF", 0, false)] },
					],
				},
				vt_tray: { id: "254", tray_type: "", tray_color: "00000000", remain: -1, tag_uid: "0000000000000000" },
			};
		case "a1mini":
			return {
				gcode_state: "IDLE",
				subtask_name: "Schlüsselanhänger",
				ams: {
					tray_now: "255",
					ams: [
						{ id: "0", tray: [tray(0, "PLA", "E9D46AFF", 64), tray(1, "PLA", "7DB547FF", 30), tray(2, "PLA", "FFFFFFFF", 90), tray(3, "PLA", "8E5BBFFF", 7)] },
					],
				},
			};
		case "h2d":
			return {
				gcode_state: "IDLE",
				subtask_name: "Gehäuse_Deckel",
				lights_report: [{ node: "chamber_light", mode: "off" }],
				chamber_temper: 38,
				ams: {
					tray_now: "255",
					ams: [
						{ id: "0", humidity_raw: "18", humidity: "5", temp: "41", dry_time: 220, tray: [tray(0, "PETG", "E5604DFF", 75), tray(1, "PETG", "F2C14EFF", 52), tray(2, "", "00000000", 0, false), tray(3, "ASA", "5AA9E6FF", 88)] },
						{ id: "128", humidity_raw: "9", humidity: "5", temp: "65", dry_time: 0, tray: [tray(0, "PA-CF", "3B3D42FF", 60)] },
					],
				},
			};
	}
}

type Phase = { stage: "idle" | "heating" | "printing" | "paused" | "finished"; seconds: number; error?: number };

const PLAN: Record<Scenario, Phase[]> = {
	x1c: [
		{ stage: "idle", seconds: 15 },
		{ stage: "heating", seconds: 12 },
		{ stage: "printing", seconds: 90 },
		{ stage: "finished", seconds: 40 },
	],
	a1mini: [
		{ stage: "printing", seconds: 50 },
		// Filament runout on the AMS lite.
		{ stage: "paused", seconds: 40, error: 0x07008011 },
		{ stage: "printing", seconds: 40 },
		{ stage: "finished", seconds: 30 },
		{ stage: "idle", seconds: 20 },
	],
	h2d: [
		{ stage: "heating", seconds: 25 },
		{ stage: "printing", seconds: 140 },
		{ stage: "idle", seconds: 30 },
	],
};

export const DEMO_PRINTERS: PrinterConfig[] = [
	{ id: "demo-x1c", name: "Werkstatt", host: "", serial: "00M00DEMO000001", accessCode: "", model: "X1C" },
	{ id: "demo-a1mini", name: "Kids", host: "", serial: "030DEMO00000002", accessCode: "", model: "A1M" },
	{ id: "demo-h2d", name: "Keller", host: "", serial: "094DEMO00000003", accessCode: "", model: "H2D" },
];

export class DemoPrinter extends EventEmitter<PrinterEvents> implements Printer {
	readonly model: Model;
	readonly problem = "";
	#scenario: Scenario;
	#raw: Raw;
	#status: Status;
	#timer: NodeJS.Timeout | undefined;
	#started = 0;
	#held: Phase | undefined;
	#speed = 2;

	constructor(readonly config: PrinterConfig) {
		super();
		this.model = detectModel(config.serial, config.model);
		this.#scenario = config.id.replace("demo-", "") as Scenario;
		this.#raw = base(this.#scenario);
		this.#status = toStatus(this.#raw, { liteHint: this.model.ams === "lite" });
	}

	get status(): Status {
		return this.#status;
	}

	start(): void {
		this.#started = Date.now();
		this.#tick();
		this.#timer = setInterval(() => this.#tick(), 1000);
		this.#timer.unref?.();
	}

	stop(): void {
		clearInterval(this.#timer);
	}

	send(command: Command): boolean {
		this.emit("log", `${this.config.name} (Demo): ${command.kind}`);
		switch (command.kind) {
			case "pause":
				this.#held = { stage: "paused", seconds: 0 };
				break;
			case "resume":
				this.#held = undefined;
				break;
			case "stop":
				this.#held = { stage: "idle", seconds: 0 };
				this.#apply({ gcode_state: "FAILED", print_error: 0x0300400c });
				setTimeout(() => this.#apply({ gcode_state: "IDLE", print_error: 0 }), 3000).unref?.();
				break;
			case "light":
				this.#apply({ lights_report: [{ node: "chamber_light", mode: command.on ? "on" : "off" }] });
				break;
			case "speed":
				this.#speed = command.level;
				this.#apply({ spd_lvl: command.level });
				break;
			case "nozzle":
				this.#apply({ nozzle_target_temper: command.target });
				break;
			case "bed":
				this.#apply({ bed_target_temper: command.target });
				break;
			case "fan": {
				const field = command.which === "aux" ? "big_fan1_speed" : command.which === "chamber" ? "big_fan2_speed" : "cooling_fan_speed";
				this.#apply({ [field]: String(Math.round((command.percent / 100) * 15)) });
				break;
			}
			case "load":
				this.#apply({ ams: { tray_now: String(command.slot) } });
				break;
			case "unload":
				this.#apply({ ams: { tray_now: "255" } });
				break;
		}
		setTimeout(() => this.emit("result", { command: command.kind, ok: true, reason: "" }), 150).unref?.();
		return true;
	}

	#phase(elapsed: number): { phase: Phase; into: number } {
		const plan = PLAN[this.#scenario];
		const total = plan.reduce((sum, p) => sum + p.seconds, 0);
		let t = elapsed % total;
		for (const phase of plan) {
			if (t < phase.seconds) {
				return { phase, into: t };
			}
			t -= phase.seconds;
		}
		return { phase: plan[0]!, into: 0 };
	}

	#tick(): void {
		const elapsed = (Date.now() - this.#started) / 1000;
		const { phase, into } = this.#held ? { phase: this.#held, into: 0 } : this.#phase(elapsed);
		if (this.#held?.stage === "idle" && this.#raw.gcode_state === "FAILED") {
			return;
		}
		const plan = PLAN[this.#scenario];
		const printing = plan.filter((p) => p.stage === "printing").reduce((s, p) => s + p.seconds, 0);
		const printedBefore = (() => {
			let sum = 0;
			let t = elapsed % plan.reduce((s, p) => s + p.seconds, 0);
			for (const p of plan) {
				if (t < p.seconds) {
					return sum + (p.stage === "printing" ? t : 0);
				}
				if (p.stage === "printing") sum += p.seconds;
				t -= p.seconds;
			}
			return sum;
		})();
		const percent = Math.min(100, Math.round((printedBefore / printing) * 100));
		const layers = 310;
		const hot = { nozzle_target_temper: 220, bed_target_temper: this.#scenario === "h2d" ? 90 : 55 };
		const cold = { nozzle_target_temper: 0, bed_target_temper: 0 };
		const ams = this.#raw.ams;
		const activeSlot = this.#scenario === "h2d" ? "0" : "1";

		let patch: Raw;
		switch (phase.stage) {
			case "idle":
				patch = { gcode_state: "IDLE", mc_percent: 0, mc_remaining_time: 0, layer_num: 0, ...cold, nozzle_temper: 28, bed_temper: 26, cooling_fan_speed: "0", print_error: 0, ams: { ...ams, tray_now: "255" } };
				break;
			case "heating": {
				const p = Math.min(1, into / 12);
				patch = { gcode_state: "PREPARE", mc_percent: 0, layer_num: 0, total_layer_num: layers, mc_remaining_time: 195, ...hot, nozzle_temper: Math.round(28 + p * 192), bed_temper: Math.round(26 + p * (hot.bed_target_temper - 26)), print_error: 0 };
				break;
			}
			case "printing":
				patch = {
					gcode_state: "RUNNING",
					mc_percent: Math.max(1, percent),
					layer_num: Math.max(1, Math.round((percent / 100) * layers)),
					total_layer_num: layers,
					mc_remaining_time: Math.round(195 * (1 - percent / 100)),
					...hot,
					nozzle_temper: 220 + (Math.round(elapsed) % 3) - 1,
					bed_temper: hot.bed_target_temper,
					cooling_fan_speed: "11",
					spd_lvl: this.#speed,
					print_error: 0,
					ams: { ...ams, tray_now: activeSlot },
				};
				break;
			case "paused":
				patch = { gcode_state: "PAUSE", print_error: phase.error ?? 0 };
				break;
			case "finished":
				patch = { gcode_state: "FINISH", mc_percent: 100, mc_remaining_time: 0, layer_num: layers, ...cold, nozzle_temper: Math.max(30, 200 - into * 4), bed_temper: Math.max(28, 55 - into), cooling_fan_speed: "0", ams: { ...ams, tray_now: "255" } };
				break;
		}
		this.#apply(patch);
	}

	#apply(patch: Raw): void {
		this.#raw = mergeReport(this.#raw, { print: patch });
		this.#status = toStatus(this.#raw, { liteHint: this.model.ams === "lite" });
		this.emit("status", this.#status);
	}
}
