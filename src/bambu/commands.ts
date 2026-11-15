/**
 * Requests the deck sends to a printer, as the JSON the printer expects on
 * device/<serial>/request. Pure builders, so they are easy to check.
 */

let sequence = 1;
const seq = () => String(sequence++ % 100000);

export type Command =
	| { kind: "pushall" }
	| { kind: "pause" }
	| { kind: "resume" }
	| { kind: "stop" }
	| { kind: "light"; on: boolean }
	| { kind: "speed"; level: number }
	| { kind: "nozzle"; target: number; nozzle?: number }
	| { kind: "bed"; target: number }
	| { kind: "fan"; percent: number; which?: Fan }
	| { kind: "home" }
	| { kind: "moveZ"; mm: number }
	| { kind: "unload"; temp: number }
	| { kind: "load"; slot: number; amsId: number; trayIndex: number; temp: number }
	| { kind: "gcode"; lines: string };

/** Part cooling (P1), auxiliary (P2), chamber (P3), as M106 counts them. */
export type Fan = "part" | "aux" | "chamber";
const FAN_PORT: Record<Fan, number> = { part: 1, aux: 2, chamber: 3 };

/** Safe limits; the printer has its own too, but the deck should never ask for more. */
export const LIMITS = { nozzle: 300, bed: 110 } as const;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

function gcode(line: string) {
	return { print: { sequence_id: seq(), command: "gcode_line", param: `${line}\n` } };
}

export function buildCommand(c: Command): Record<string, unknown> {
	switch (c.kind) {
		case "pushall":
			return { pushing: { sequence_id: seq(), command: "pushall", version: 1, push_target: 1 } };
		case "pause":
		case "resume":
		case "stop":
			return { print: { sequence_id: seq(), command: c.kind, param: "" } };
		case "light":
			return {
				system: {
					sequence_id: seq(),
					command: "ledctrl",
					led_node: "chamber_light",
					led_mode: c.on ? "on" : "off",
					led_on_time: 500,
					led_off_time: 500,
					loop_times: 0,
					interval_time: 0,
				},
			};
		case "speed":
			return { print: { sequence_id: seq(), command: "print_speed", param: String(clamp(c.level, 1, 4)) } };
		case "nozzle":
			return gcode(`M104 ${c.nozzle !== undefined ? `T${c.nozzle} ` : ""}S${clamp(c.target, 0, LIMITS.nozzle)}`);
		case "bed":
			return gcode(`M140 S${clamp(c.target, 0, LIMITS.bed)}`);
		case "fan":
			return gcode(`M106 P${FAN_PORT[c.which ?? "part"]} S${clamp((c.percent / 100) * 255, 0, 255)}`);
		case "home":
			return gcode("G28");
		case "moveZ":
			// Relative, slow, and back to absolute afterwards.
			return gcode(`G91\nG0 Z${clamp(c.mm, -50, 50)} F600\nG90`);
		case "unload":
			return { print: { sequence_id: seq(), command: "ams_change_filament", target: 255, curr_temp: clamp(c.temp, 0, LIMITS.nozzle), tar_temp: clamp(c.temp, 0, LIMITS.nozzle) } };
		case "load":
			return {
				print: {
					sequence_id: seq(),
					command: "ams_change_filament",
					target: c.slot,
					ams_id: c.amsId,
					slot_id: c.trayIndex,
					curr_temp: clamp(c.temp, 0, LIMITS.nozzle),
					tar_temp: clamp(c.temp, 0, LIMITS.nozzle),
				},
			};
		case "gcode":
			return gcode(c.lines.replace(/\r\n?/g, "\n").trim());
	}
}

/** Heat-up presets: nozzle and bed in °C. "cool" switches both off. */
export const PRESETS: Record<string, { label: string; nozzle: number; bed: number }> = {
	pla: { label: "PLA", nozzle: 220, bed: 60 },
	petg: { label: "PETG", nozzle: 250, bed: 75 },
	abs: { label: "ABS/ASA", nozzle: 260, bed: 100 },
	tpu: { label: "TPU", nozzle: 230, bed: 40 },
	cool: { label: "Abkühlen", nozzle: 0, bed: 0 },
};

/** The reply name of a command, to match the printer's answer to the key that sent it. */
export function replyName(c: Command): string {
	switch (c.kind) {
		case "nozzle":
		case "bed":
		case "fan":
		case "home":
		case "moveZ":
		case "gcode":
			return "gcode_line";
		case "light":
			return "ledctrl";
		case "speed":
			return "print_speed";
		case "load":
		case "unload":
			return "ams_change_filament";
		default:
			return c.kind;
	}
}

export const SPEED_NAMES: Record<number, string> = { 1: "Leise", 2: "Standard", 3: "Sport", 4: "Ludicrous" };
