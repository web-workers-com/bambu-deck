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
	| { kind: "fan"; percent: number };

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
			return gcode(`M106 P1 S${clamp((c.percent / 100) * 255, 0, 255)}`);
	}
}

export const SPEED_NAMES: Record<number, string> = { 1: "Leise", 2: "Standard", 3: "Sport", 4: "Ludicrous" };
