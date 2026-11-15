/**
 * Every single key the deck draws, from a printer status. Pure functions:
 * same input, same image, which keeps the ticker from resending frames.
 */
import type { Alert } from "../alerts.js";
import { SPEED_NAMES } from "../bambu/commands.js";
import type { AmsUnit, Stage, Status, Tray } from "../bambu/report.js";
import { heat, nozzle, panda } from "./panda.js";
import { BG, C, hm, keyImage, q, ring, swing, text } from "./svg.js";

export type View = "percent" | "time" | "layer";

export type PrinterKeyOptions = {
	status: Status;
	name: string;
	alert?: Alert | undefined;
	/** Why the connection is down, if it is. */
	problem?: string;
	view?: View;
	look?: "bao" | "compact";
	t: number;
	now?: number;
};

const STAGE_COLOR: Record<Stage, string> = {
	offline: C.grey,
	idle: C.grey,
	heating: C.glow,
	printing: C.print,
	paused: C.honey,
	finished: C.bamboo,
	failed: C.coral,
};

function readout(s: Status, view: View): string {
	switch (view) {
		case "time":
			return hm(s.remaining);
		case "layer":
			return `${s.layer}/${s.layers}`;
		default:
			return `${Math.round(s.percent)}%`;
	}
}

/** The Bao key: the printer's state as a panda, the progress around the edge. */
export function printerKey(o: PrinterKeyOptions): string {
	const { status: s, t } = o;
	const now = o.now ?? Date.now();
	const alert = o.alert && (!o.alert.snoozedUntil || o.alert.snoozedUntil <= now) ? o.alert : undefined;
	if (o.look === "compact") {
		return compactKey(o, alert);
	}
	const blink = t % 5 < 0.15;
	let inner = BG;

	if (alert && alert.level === "error") {
		const shake = Math.sin(t * 20) * 2;
		inner += ring(C.coral, 1, undefined, 0.35 + swing(t, 1.4) * 0.65);
		inner += panda({ mood: "x", dy: 22, dx: shake });
		inner += `<path d="M60 12 l11 20 h-22z" fill="${C.coral}"/><path d="M60 19 v7 M60 29 v.5" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round"/>`;
		return keyImage(inner);
	}
	if (alert && alert.level === "wait") {
		inner += ring(C.honey, 1, undefined, 0.35 + swing(t, 2) * 0.65);
		inner += panda({ mood: "wide", dy: 28 });
		inner += text(alert.title, { x: 60, y: 30, size: 15, max: 100, fill: C.honeyLight });
		return keyImage(inner);
	}

	switch (s.stage) {
		case "offline": {
			inner += panda({ mood: "sleep", dy: 26, dim: 0.38 });
			inner += `<path d="M42 30 q18 -14 36 0 M48 36 q12 -8 24 0" stroke="${C.grey}" stroke-width="2.6" fill="none" stroke-linecap="round"/><circle cx="60" cy="41" r="2.4" fill="${C.grey}"/><path d="M44 20 l32 26" stroke="${C.grey}" stroke-width="2.6" stroke-linecap="round"/>`;
			inner += text(o.problem && o.problem !== "Drucker nicht eingerichtet" ? "offline" : o.name, { x: 60, y: 112, size: 12, max: 100, fill: C.label, face: "body" });
			break;
		}
		case "idle": {
			const breathe = swing(t, 4) * 1.5;
			inner += panda({ mood: "sleep", dy: 12 - breathe });
			const z = (phase: number, x: number, y: number, size: number) => {
				const p = ((t + phase) % 3.2) / 3.2;
				const op = p < 0.3 ? p / 0.3 : 1 - (p - 0.3) / 0.7;
				return `<text x="${q(x + p * 6)}" y="${q(y - p * 16)}" font-family="Fredoka, Arial, sans-serif" font-weight="600" font-size="${size}" fill="${C.greyLight}" opacity="${q(op, 0.25)}">z</text>`;
			};
			inner += z(0, 90, 36, 13) + z(1.6, 98, 28, 10);
			break;
		}
		case "heating": {
			const part = s.nozzleTarget > 0 ? Math.min(1, s.nozzle / s.nozzleTarget) : 0;
			inner += ring(C.glow, part, "#3A2A1E");
			inner += panda({ mood: "open", dy: 22, blink, mouth: "o" });
			inner += heat(30, 44, (t % 1.8) / 1.8) + heat(90, 44, ((t + 0.9) % 1.8) / 1.8);
			inner += text(`${Math.round(s.nozzle)}°`, { x: 60, y: 30, size: 18, max: 70, fill: C.glowLight, face: "mono", weight: 700 });
			break;
		}
		case "printing": {
			inner += ring(C.print, s.percent / 100, C.printDim);
			inner += `<g clip-path="url(#bdClip)">${nozzle(60 + (swing(t, 2) - 0.5) * 24)}${panda({ mood: "open", dy: 34, blink })}</g>`;
			inner += text(readout(s, o.view ?? "percent"), { x: 60, y: 46, size: 22, max: 96, fill: C.printLight, face: "mono", weight: 700 });
			break;
		}
		case "paused": {
			inner += ring(C.honey, s.percent / 100, "#3A321E");
			inner += panda({ mood: "open", dy: 34, blink });
			const op = q(0.35 + swing(t, 1.6) * 0.65, 0.05);
			inner += `<g opacity="${op}"><rect x="49" y="20" width="7" height="20" rx="2.5" fill="${C.honey}"/><rect x="64" y="20" width="7" height="20" rx="2.5" fill="${C.honey}"/></g>`;
			break;
		}
		case "finished": {
			const hop = Math.max(0, Math.sin(((t % 1.4) / 1.4) * Math.PI * 2)) * 6;
			inner += ring(C.bamboo, 1);
			inner += `<g clip-path="url(#bdClip)">${panda({ mood: "happy", dy: 16 - hop, bamboo: true })}</g>`;
			inner += sparkle(24, 26, (t % 1.8) / 1.8) + sparkle(96, 20, ((t + 0.6) % 1.8) / 1.8, 0.7);
			break;
		}
		case "failed": {
			inner += ring(C.coral, 1);
			inner += panda({ mood: "x", dy: 24 });
			inner += text("Abbruch", { x: 60, y: 30, size: 16, max: 96, fill: C.coralLight });
			break;
		}
	}
	return keyImage(inner);
}

function sparkle(x: number, y: number, p: number, scale = 1): string {
	const s = (0.6 + Math.sin(p * Math.PI) * 0.4) * scale;
	const op = 0.2 + Math.sin(p * Math.PI) * 0.8;
	return `<path transform="translate(${x} ${y}) scale(${q(s, 0.05)})" d="M0 -7 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2z" fill="${C.bambooLight}" opacity="${q(op, 0.05)}"/>`;
}

const STAGE_WORD: Record<Stage, string> = {
	offline: "offline",
	idle: "Bereit",
	heating: "Heizt",
	printing: "Druckt",
	paused: "Pause",
	finished: "Fertig",
	failed: "Fehler",
};

/** One printer among several: name on top, state below. */
function compactKey(o: PrinterKeyOptions, alert: Alert | undefined): string {
	const s = o.status;
	const color = alert ? (alert.level === "error" ? C.coral : alert.level === "wait" ? C.honey : C.bamboo) : STAGE_COLOR[s.stage];
	let inner = BG + text(o.name, { x: 60, y: 28, size: 14, max: 100, fill: C.label, face: "body" });
	if (alert && alert.level !== "done") {
		inner += ring(color, 1, undefined, 0.35 + swing(o.t, 1.6) * 0.65);
		inner += `<path d="M60 44 l14 25 h-28z" fill="${color}"/><path d="M60 52 v8 M60 64 v.5" stroke="${C.graphite}" stroke-width="3" stroke-linecap="round"/>`;
		inner += text(alert.title, { x: 60, y: 102, size: 16, max: 100, fill: color });
		return keyImage(inner);
	}
	switch (s.stage) {
		case "printing":
		case "paused":
			inner += ring(color, s.percent / 100, s.stage === "printing" ? C.printDim : "#3A321E");
			inner += text(readout(s, o.view ?? "percent"), { x: 60, y: 72, size: 28, max: 96, fill: s.stage === "printing" ? C.printLight : C.honeyLight, face: "mono", weight: 700 });
			inner += text(s.stage === "paused" ? "Pause" : hm(s.remaining), { x: 60, y: 102, size: 15, max: 96, fill: C.label, face: "mono" });
			break;
		case "heating":
			inner += ring(color, s.nozzleTarget ? Math.min(1, s.nozzle / s.nozzleTarget) : 0, "#3A2A1E");
			inner += heat(48, 68, (o.t % 1.8) / 1.8) + heat(60, 68, ((o.t + 0.6) % 1.8) / 1.8) + heat(72, 68, ((o.t + 1.2) % 1.8) / 1.8);
			inner += text(`${Math.round(s.nozzle)}°`, { x: 60, y: 102, size: 19, max: 96, fill: C.glowLight, face: "mono", weight: 700 });
			break;
		case "finished":
			inner += ring(color, 1);
			inner += `<circle cx="60" cy="62" r="18" fill="${C.bamboo}"/><path d="M51 62 l6 6 l12 -12" stroke="${C.graphite}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
			inner += text("Fertig", { x: 60, y: 103, size: 17, max: 96, fill: C.bambooLight });
			break;
		case "failed":
			inner += ring(color, 1);
			inner += `<path d="M48 50 l24 24 M72 50 l-24 24" stroke="${C.coral}" stroke-width="5" stroke-linecap="round"/>`;
			inner += text("Fehler", { x: 60, y: 103, size: 17, max: 96, fill: C.coralLight });
			break;
		default:
			inner += `<path d="M42 46 h36 v26 h-36z M38 72 h44" stroke="${C.grey}" stroke-width="3" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`;
			inner += text(STAGE_WORD[s.stage], { x: 60, y: 103, size: 17, max: 96, fill: C.greyLight });
	}
	return keyImage(inner);
}

/** Shown when no printer is set up yet. */
export function setupKey(): string {
	return keyImage(
		BG +
			panda({ mood: "open", dy: 30, dim: 0.9 }) +
			`<circle cx="94" cy="26" r="13" fill="${C.bamboo}"/><path d="M94 19 v14 M87 26 h14" stroke="${C.graphite}" stroke-width="3.4" stroke-linecap="round"/>` +
			text("Einrichten", { x: 52, y: 32, size: 15, max: 72, fill: C.text }),
	);
}

/** One AMS slot: the spool in its colour, what is left around it. */
export function trayKey(tray: Tray | undefined, stage: Stage, t: number, label?: string): string {
	let inner = BG;
	if (!tray) {
		inner += `<circle cx="60" cy="56" r="27" fill="none" stroke="#4A4F57" stroke-width="3" stroke-dasharray="5 5"/>`;
		inner += text(label ?? "–", { x: 60, y: 104, size: 15, max: 96, fill: C.grey, face: "mono", weight: 700 });
		return keyImage(inner);
	}
	const low = tray.remain !== undefined && tray.remain <= 15 && tray.loaded;
	const tone = tray.active && (stage === "printing" || stage === "heating") ? C.print : low ? C.honey : undefined;
	if (tone === C.print) {
		inner += ring(C.print, 1, undefined, 0.35 + swing(t, 1.6) * 0.65);
	} else if (tone === C.honey) {
		inner += ring(C.honey, 1);
	}
	inner += text(tray.label, { x: 16, y: 26, size: 13, max: 40, fill: tone === C.print ? C.printLight : tone === C.honey ? C.honey : C.grey, face: "mono", weight: 700, anchor: "start" });

	if (!tray.loaded) {
		inner += `<circle cx="60" cy="56" r="27" fill="none" stroke="#4A4F57" stroke-width="3" stroke-dasharray="5 5"/><path d="M50 56 h20" stroke="${C.grey}" stroke-width="3" stroke-linecap="round"/>`;
		inner += text("leer", { x: 60, y: 104, size: 16, max: 96, fill: C.label });
		return keyImage(inner);
	}
	const color = tray.color || "#6A6F76";
	if (tray.remain !== undefined) {
		const circumference = 2 * Math.PI * 27;
		inner += `<circle cx="60" cy="56" r="27" fill="none" stroke="${C.track}" stroke-width="5"/>`;
		inner += `<circle cx="60" cy="56" r="27" fill="none" stroke="${tone === C.print ? C.printLight : tone === C.honey ? C.honey : C.greyLight}" stroke-width="5" stroke-dasharray="${((circumference * tray.remain) / 100).toFixed(1)} 200" stroke-linecap="round" transform="rotate(-90 60 56)"/>`;
	} else {
		inner += `<circle cx="60" cy="56" r="27" fill="none" stroke="#4A4F57" stroke-width="3" stroke-dasharray="5 5"/>`;
	}
	const spin = tone === C.print ? ((t * 120) % 360).toFixed(0) : "0";
	inner += `<g transform="rotate(${spin} 60 56)"><circle cx="60" cy="56" r="20" fill="${color}" stroke="#4A4F57" stroke-width="1.2"/><path d="M60 38 v6 M60 68 v6" stroke="#000000" stroke-opacity="0.25" stroke-width="2"/></g>`;
	inner += `<circle cx="60" cy="56" r="6" fill="#121417"/>`;
	if (!tray.rfid) {
		inner += text("?", { x: 60, y: 61, size: 14, max: 12, fill: "#FFFFFF", weight: 700 });
	}
	const amount = tray.remain !== undefined ? `${tray.remain}%` : "?";
	inner += text(`${tray.material} ${amount}`, { x: 60, y: 104, size: 15, max: 100, fill: low ? C.honeyLight : C.text, face: "mono", weight: 700 });
	return keyImage(inner);
}

/** AMS humidity (and drying, where the AMS can dry). */
export function humidityKey(unit: AmsUnit | undefined, t: number): string {
	let inner = BG;
	if (!unit) {
		inner += text("kein AMS", { x: 60, y: 66, size: 15, max: 96, fill: C.grey });
		return keyImage(inner);
	}
	const title = unit.kind === "ht" ? unit.label : `AMS ${unit.label}`;
	inner += text(title, { x: 60, y: 28, size: 13, max: 100, fill: C.label, face: "body" });
	if (unit.dryingLeft > 0) {
		const p = (t % 1.8) / 1.8;
		inner += ring(C.glow, 1, undefined, 0.6);
		inner += heat(46, 70, p) + heat(60, 70, (p + 0.33) % 1) + heat(74, 70, (p + 0.66) % 1);
		inner += text(hm(unit.dryingLeft), { x: 60, y: 103, size: 17, max: 96, fill: C.glowLight, face: "mono", weight: 700 });
		return keyImage(inner);
	}
	if (unit.kind === "lite") {
		inner += text("offen", { x: 60, y: 70, size: 17, max: 96, fill: C.grey });
		inner += text("keine Feuchte", { x: 60, y: 100, size: 11, max: 100, fill: C.grey, face: "body" });
		return keyImage(inner);
	}
	const wet = unit.humidity !== undefined && unit.humidity >= 40;
	const color = wet ? C.honey : C.bamboo;
	if (wet) {
		inner += ring(C.honey, 1);
	}
	inner += `<path d="M60 38 C 70 52, 76 60, 76 68 a16 16 0 0 1 -32 0 c0 -8 6 -16 16 -30z" fill="none" stroke="${color}" stroke-width="3.4" stroke-linejoin="round"/>`;
	const value = unit.humidity !== undefined ? `${Math.round(unit.humidity)}% rH` : unit.humidityLevel !== undefined ? `Stufe ${unit.humidityLevel}` : "–";
	inner += text(value, { x: 60, y: 104, size: 16, max: 100, fill: wet ? C.honeyLight : C.bambooLight, face: "mono", weight: 700 });
	return keyImage(inner);
}

export type TempWhat = "both" | "nozzle" | "bed" | "chamber";

export function tempKey(s: Status, what: TempWhat): string {
	let inner = BG;
	const deg = (v: number) => `${Math.round(v)}°`;
	const nozzleIcon = (x: number, y: number) => `<path d="M${x} ${y} h14 v8 h-14z M${x + 3} ${y + 8} h8 l-2 5 h-4z" fill="${C.greyLight}"/>`;
	const bedIcon = (x: number, y: number) => `<path d="M${x} ${y + 12} h16" stroke="${C.greyLight}" stroke-width="4" stroke-linecap="round"/><path d="M${x + 2} ${y + 6} q2 -3 0 -6 M${x + 8} ${y + 6} q2 -3 0 -6 M${x + 14} ${y + 6} q2 -3 0 -6" stroke="${C.grey}" stroke-width="1.6" fill="none"/>`;
	const hot = (v: number, target: number) => (target > 0 || v > 45 ? C.glowLight : C.greyLight);
	if (what === "both") {
		inner += nozzleIcon(18, 22) + text(deg(s.nozzle), { x: 42, y: 38, size: 21, max: 64, fill: hot(s.nozzle, s.nozzleTarget), face: "mono", weight: 700, anchor: "start" });
		inner += bedIcon(18, 60) + text(deg(s.bed), { x: 42, y: 77, size: 21, max: 64, fill: hot(s.bed, s.bedTarget), face: "mono", weight: 700, anchor: "start" });
		inner += text("Düse · Bett", { x: 60, y: 106, size: 12, max: 100, fill: C.grey, face: "body" });
		return keyImage(inner);
	}
	const value = what === "nozzle" ? s.nozzle : what === "bed" ? s.bed : (s.chamber ?? 0);
	const target = what === "nozzle" ? s.nozzleTarget : what === "bed" ? s.bedTarget : 0;
	const label = what === "nozzle" ? "Düse" : what === "bed" ? "Bett" : "Kammer";
	if (target > 0) {
		inner += ring(C.glow, Math.min(1, value / target), "#3A2A1E");
	}
	inner += what === "nozzle" ? nozzleIcon(53, 18) : what === "bed" ? bedIcon(52, 18) : `<rect x="48" y="16" width="24" height="20" rx="4" fill="none" stroke="${C.greyLight}" stroke-width="2.6"/>`;
	inner += text(what === "chamber" && s.chamber === undefined ? "–" : deg(value), { x: 60, y: 76, size: 28, max: 96, fill: hot(value, target), face: "mono", weight: 700 });
	inner += text(target > 0 ? `${label} → ${Math.round(target)}°` : label, { x: 60, y: 104, size: 13, max: 100, fill: C.grey, face: "body" });
	return keyImage(inner);
}

/** Pause or resume, depending on what the printer does. */
export function pauseKey(stage: Stage): string {
	let inner = BG;
	if (stage === "paused") {
		inner += `<path d="M48 30 v38 l32 -19z" fill="${C.bamboo}"/>`;
		inner += text("Weiter", { x: 60, y: 100, size: 17, max: 96, fill: C.bambooLight });
	} else {
		const active = stage === "printing" || stage === "heating";
		inner += `<rect x="44" y="30" width="11" height="36" rx="4" fill="${active ? C.honey : "#4A4F57"}"/><rect x="65" y="30" width="11" height="36" rx="4" fill="${active ? C.honey : "#4A4F57"}"/>`;
		inner += text("Pause", { x: 60, y: 100, size: 17, max: 96, fill: active ? C.honeyLight : C.grey });
	}
	return keyImage(inner);
}

/** Stop, which needs holding: `hold` runs 0..1 while the key is held. */
export function stopKey(hold: number, enabled: boolean): string {
	let inner = BG;
	inner += ring(enabled ? C.coral : "#4A4F57", hold, enabled ? C.coralDim : undefined);
	inner += `<rect x="44" y="30" width="32" height="32" rx="7" fill="${enabled ? C.coral : "#4A4F57"}"/>`;
	inner += text(hold > 0 ? "weiter halten" : "Stopp", { x: 60, y: 98, size: hold > 0 ? 13 : 17, max: 100, fill: enabled ? C.coralLight : C.grey });
	return keyImage(inner);
}

export function lightKey(on: boolean | undefined, supported: boolean): string {
	let inner = BG;
	if (!supported) {
		inner += `<path d="M60 30 a15 15 0 0 1 9 27 v6 h-18 v-6 a15 15 0 0 1 9 -27z" fill="none" stroke="#4A4F57" stroke-width="2.6"/>`;
		inner += text("kein Licht", { x: 60, y: 102, size: 14, max: 100, fill: C.grey });
		return keyImage(inner);
	}
	if (on) {
		inner += `<circle cx="60" cy="48" r="24" fill="${C.honey}" opacity="0.18"/>`;
	}
	inner += `<path d="M60 30 a15 15 0 0 1 9 27 v6 h-18 v-6 a15 15 0 0 1 9 -27z" fill="${on ? C.honeyLight : "none"}" stroke="${on ? C.honeyLight : C.grey}" stroke-width="2.6"/><path d="M52 68 h16 M54 73 h12" stroke="${C.greyLight}" stroke-width="3" stroke-linecap="round"/>`;
	inner += text(on === undefined ? "Licht" : on ? "Licht an" : "Licht aus", { x: 60, y: 102, size: 16, max: 100, fill: on ? C.honeyLight : C.greyLight });
	return keyImage(inner);
}

export function speedKey(level: number): string {
	const part = Math.max(1, Math.min(4, level)) / 4;
	const angle = Math.PI * (1 - part);
	const x = 60 + Math.cos(angle) * 26;
	const y = 70 - Math.sin(angle) * 26;
	const color = level >= 4 ? C.coral : level === 3 ? C.print : level === 1 ? C.bamboo : C.greyLight;
	let inner = BG;
	inner += `<path d="M32 70 a28 28 0 0 1 56 0" stroke="${C.track}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
	inner += `<path d="M32 70 A28 28 0 0 1 ${(60 + Math.cos(angle) * 28).toFixed(1)} ${(70 - Math.sin(angle) * 28).toFixed(1)}" stroke="${color}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
	inner += `<path d="M60 70 L${x.toFixed(1)} ${y.toFixed(1)}" stroke="${C.text}" stroke-width="3.4" stroke-linecap="round"/><circle cx="60" cy="70" r="4.5" fill="${C.text}"/>`;
	inner += text(SPEED_NAMES[level] ?? "Tempo", { x: 60, y: 102, size: 16, max: 100, fill: color === C.greyLight ? C.text : color });
	return keyImage(inner);
}

/** A key that raises a sample alert. */
export function testKey(level: "done" | "error"): string {
	const color = level === "error" ? C.coral : C.bamboo;
	return keyImage(
		BG +
			`<path d="M22 16 h76 a10 10 0 0 1 10 10 v44 a10 10 0 0 1 -10 10 h-58 l-16 12 l4 -12 h-6 a10 10 0 0 1 -10 -10 v-44 a10 10 0 0 1 10 -10 z" fill="${color}"/>` +
			text(level === "error" ? "Hilfe!" : "Fertig!", { x: 60, y: 58, size: 26, max: 80, fill: C.graphite, weight: 700 }) +
			text(level === "error" ? "Test: Fehler" : "Test: Fertig", { x: 60, y: 108, size: 13, max: 100, fill: C.greyLight, face: "body" }),
	);
}
