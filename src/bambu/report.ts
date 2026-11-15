/**
 * Turns the printer's MQTT reports into one plain status object.
 *
 * X1 printers send the whole state now and then; P1, A1 and others send only
 * what changed. `mergeReport` folds every message into one running copy of the
 * `print` object, `toStatus` reads the bits the deck shows.
 */

export type Raw = Record<string, any>;

export type Stage = "offline" | "idle" | "heating" | "printing" | "paused" | "finished" | "failed";

export type Tray = {
	/** Global slot number: AMS id × 4 + tray, as the printer counts it (254 = external). */
	slot: number;
	/** A1, B3, HT1, Ext … */
	label: string;
	/** Is a spool loaded? */
	loaded: boolean;
	material: string;
	/** Name like "PLA Basic", if the spool has an RFID tag. */
	name: string;
	/** CSS colour, "" when unknown. */
	color: string;
	/** Remaining filament in percent, undefined when unknown (no RFID). */
	remain: number | undefined;
	/** Bambu spool with RFID? */
	rfid: boolean;
	active: boolean;
};

export type AmsUnit = {
	id: number;
	/** A, B, C, D, or HT1 … */
	label: string;
	kind: "ams" | "lite" | "ams2" | "ht";
	/** Humidity in percent, if the AMS reports it (AMS 2 Pro, HT, newer firmware). */
	humidity: number | undefined;
	/** Humidity level 1..5 exactly as the printer sends it. Which end is dry is still to be checked on a real AMS (see README, "Zu prüfen"). */
	humidityLevel: number | undefined;
	temperature: number | undefined;
	/** Drying: minutes left, 0 = not drying. */
	dryingLeft: number;
	trays: Tray[];
};

export type Hms = { code: string; severity: "fatal" | "serious" | "common" | "info" };

export type Status = {
	stage: Stage;
	/** Raw gcode_state, for the log. */
	state: string;
	percent: number;
	/** Minutes left. */
	remaining: number;
	layer: number;
	layers: number;
	job: string;
	nozzle: number;
	nozzleTarget: number;
	bed: number;
	bedTarget: number;
	chamber: number | undefined;
	/** Part cooling fan in percent. */
	fan: number;
	/** 1 silent, 2 standard, 3 sport, 4 ludicrous. */
	speed: number;
	light: boolean | undefined;
	ams: AmsUnit[];
	external: Tray | undefined;
	activeSlot: number | undefined;
	/** print_error as 8-digit hex, "" when none. */
	error: string;
	hms: Hms[];
	updatedAt: number;
};

const isObject = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);

/** Arrays of objects with an `id` merge item by item; everything else is replaced. */
function mergeArray(base: unknown[], patch: unknown[]): unknown[] {
	const keyed = patch.every((p) => isObject(p) && "id" in p) && base.every((b) => isObject(b) && "id" in b);
	if (!keyed) {
		return patch;
	}
	const out = [...base] as Raw[];
	for (const p of patch as Raw[]) {
		const i = out.findIndex((b) => String(b.id) === String(p.id));
		if (i >= 0) {
			out[i] = deepMerge(out[i]!, p);
		} else {
			out.push(p);
		}
	}
	return out;
}

export function deepMerge(base: Raw, patch: Raw): Raw {
	const out: Raw = { ...base };
	for (const [k, v] of Object.entries(patch)) {
		const b = out[k];
		if (isObject(b) && isObject(v)) {
			out[k] = deepMerge(b, v);
		} else if (Array.isArray(b) && Array.isArray(v)) {
			out[k] = mergeArray(b, v);
		} else {
			out[k] = v;
		}
	}
	return out;
}

/** Folds one MQTT message into the running `print` object. */
export function mergeReport(current: Raw, message: Raw): Raw {
	const print = message?.print;
	if (!isObject(print)) {
		return current;
	}
	// Command replies ride along on the same topic; they are not state.
	if (typeof print.command === "string" && print.command !== "push_status") {
		return current;
	}
	const merged = deepMerge(current, print);
	// The AMS list is replaced as a whole when the printer sends it complete:
	// an unplugged AMS must disappear.
	if (isObject(print.ams) && Array.isArray(print.ams.ams) && print.ams.ams.length > 0 && print.ams.ams.every((u: Raw) => Array.isArray(u.tray))) {
		merged.ams = { ...merged.ams, ams: print.ams.ams };
	}
	return merged;
}

const num = (v: unknown, fallback = 0): number => {
	const n = typeof v === "string" ? Number.parseFloat(v) : typeof v === "number" ? v : Number.NaN;
	return Number.isFinite(n) ? n : fallback;
};

/** Bambu colours come as RRGGBBAA. */
export function trayColor(hex: unknown): string {
	if (typeof hex !== "string" || !/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) {
		return "";
	}
	if (hex.length === 8 && hex.slice(6).toUpperCase() === "00") {
		return "";
	}
	return `#${hex.slice(0, 6).toUpperCase()}`;
}

/** AMS HT units count from 128 on; regular AMS units 0..3. */
export function unitLabel(id: number): string {
	return id >= 128 ? `HT${id - 127}` : String.fromCharCode(65 + id);
}

function unitKind(unit: Raw, id: number, liteHint: boolean): AmsUnit["kind"] {
	if (id >= 128) {
		return "ht";
	}
	// AMS 2 Pro reports a percentage and a dryer; the classic AMS only a level.
	if (unit.humidity_raw !== undefined || unit.dry_time !== undefined) {
		return "ams2";
	}
	return liteHint ? "lite" : "ams";
}

function tray(raw: Raw, unitId: number, activeSlot: number | undefined): Tray {
	const index = num(raw.id);
	const slot = unitId >= 128 ? unitId : unitId * 4 + index;
	const material = String(raw.tray_type ?? "").trim();
	const remain = num(raw.remain, -1);
	const rfid = typeof raw.tag_uid === "string" && /[1-9a-f]/i.test(raw.tag_uid);
	return {
		slot,
		label: unitId >= 128 ? unitLabel(unitId) : `${unitLabel(unitId)}${index + 1}`,
		loaded: material !== "",
		material,
		name: String(raw.tray_sub_brands ?? "").trim(),
		color: trayColor(raw.tray_color),
		remain: remain >= 0 && remain <= 100 && (rfid || remain > 0) ? remain : undefined,
		rfid,
		active: activeSlot === slot,
	};
}

const SEVERITY: Record<number, Hms["severity"]> = { 1: "fatal", 2: "serious", 3: "common", 4: "info" };

export function hmsList(raw: unknown): Hms[] {
	if (!Array.isArray(raw)) {
		return [];
	}
	return raw
		.filter((h): h is Raw => isObject(h))
		.map((h) => {
			const attr = num(h.attr) >>> 0;
			const code = num(h.code) >>> 0;
			const hex = (n: number) => n.toString(16).toUpperCase().padStart(8, "0");
			const a = hex(attr);
			const c = hex(code);
			return {
				code: `${a.slice(0, 4)}_${a.slice(4)}_${c.slice(0, 4)}_${c.slice(4)}`,
				severity: SEVERITY[code >>> 16] ?? "common",
			};
		});
}

function stageOf(p: Raw): Stage {
	const state = String(p.gcode_state ?? "").toUpperCase();
	const percent = num(p.mc_percent);
	const layer = num(p.layer_num);
	switch (state) {
		case "FINISH":
			return "finished";
		case "FAILED":
			return "failed";
		case "PAUSE":
			return "paused";
		case "PREPARE":
		case "SLICING":
			return "heating";
		case "RUNNING":
			return percent === 0 && layer === 0 ? "heating" : "printing";
		case "IDLE":
		case "":
			return "idle";
		default:
			return "idle";
	}
}

export type StatusOptions = { liteHint?: boolean; now?: number };

export function toStatus(p: Raw, o: StatusOptions = {}): Status {
	const amsRoot = isObject(p.ams) ? p.ams : {};
	const trayNow = num(amsRoot.tray_now, 255);
	// 255 = nothing loaded, 254 = external spool.
	const activeSlot = trayNow === 255 ? undefined : trayNow;
	const units: AmsUnit[] = (Array.isArray(amsRoot.ams) ? amsRoot.ams : [])
		.filter((u: unknown): u is Raw => isObject(u))
		.map((u: Raw) => {
			const id = num(u.id);
			const kind = unitKind(u, id, !!o.liteHint);
			const raw = u.humidity_raw !== undefined ? num(u.humidity_raw, -1) : -1;
			const level = u.humidity !== undefined ? num(u.humidity, 0) : 0;
			return {
				id,
				label: unitLabel(id),
				kind,
				humidity: raw >= 0 ? raw : undefined,
				humidityLevel: level >= 1 && level <= 5 && kind !== "lite" ? level : undefined,
				temperature: u.temp !== undefined ? num(u.temp) : undefined,
				dryingLeft: num(u.dry_time),
				trays: (Array.isArray(u.tray) ? u.tray : []).filter(isObject).map((t: Raw) => tray(t, id, activeSlot)),
			};
		})
		.sort((a: AmsUnit, b: AmsUnit) => a.id - b.id);

	const vt = isObject(p.vt_tray) ? p.vt_tray : undefined;
	let external: Tray | undefined;
	if (vt) {
		const t = tray({ ...vt, id: 0 }, 0, undefined);
		external = { ...t, slot: 254, label: "Ext", active: activeSlot === 254 };
	}

	const light = Array.isArray(p.lights_report) ? p.lights_report.find((l: Raw) => l?.node === "chamber_light") : undefined;
	const errorCode = num(p.print_error) >>> 0;

	return {
		stage: stageOf(p),
		state: String(p.gcode_state ?? ""),
		percent: Math.max(0, Math.min(100, num(p.mc_percent))),
		remaining: Math.max(0, num(p.mc_remaining_time)),
		layer: num(p.layer_num),
		layers: num(p.total_layer_num),
		job: String(p.subtask_name ?? p.gcode_file ?? "").replace(/\.(gcode|3mf)$/i, ""),
		nozzle: num(p.nozzle_temper),
		nozzleTarget: num(p.nozzle_target_temper),
		bed: num(p.bed_temper),
		bedTarget: num(p.bed_target_temper),
		chamber: p.chamber_temper !== undefined ? num(p.chamber_temper) : undefined,
		fan: Math.round((num(p.cooling_fan_speed) / 15) * 100),
		speed: num(p.spd_lvl, 2) || 2,
		light: light ? light.mode !== "off" : undefined,
		ams: units,
		external,
		activeSlot,
		error: errorCode ? errorCode.toString(16).toUpperCase().padStart(8, "0") : "",
		hms: hmsList(p.hms),
		updatedAt: o.now ?? Date.now(),
	};
}

/** Every slot the printer has, in deck order: A1..D4, HT1.., then the external spool. */
export function allTrays(s: Status): Tray[] {
	return [...s.ams.flatMap((u) => u.trays), ...(s.external ? [s.external] : [])];
}

/** Finds a slot by its label ("A1", "B3", "HT1", "Ext") or "active". */
export function findTray(s: Status, label: string): Tray | undefined {
	const trays = allTrays(s);
	if (label === "active") {
		return trays.find((t) => t.active);
	}
	return trays.find((t) => t.label.toUpperCase() === label.toUpperCase());
}

export const OFFLINE: Status = {
	...toStatus({}),
	stage: "offline",
	updatedAt: 0,
};
