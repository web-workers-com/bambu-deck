/** Key images for the extra controls: preheat, fans, job info, axes, filament, G-code. */
import type { Fan } from "../bambu/commands.js";
import type { Stage, Status, Tray } from "../bambu/report.js";
import { BG, C, hm, keyImage, ring, text } from "./svg.js";

const OFF = "#4A4F57";

/** Preheat preset: material, targets, and how far the nozzle got. */
export function preheatKey(label: string, nozzle: number, bed: number, s: Status | undefined, enabled: boolean): string {
	let inner = BG;
	const cool = nozzle === 0 && bed === 0;
	const active = !!s && !cool && s.nozzleTarget === nozzle && s.bedTarget === bed;
	const color = !enabled ? OFF : cool ? C.print : C.glow;
	if (active && s) {
		const part = nozzle > 0 ? Math.min(1, s.nozzle / nozzle) : 1;
		inner += ring(C.glow, part, "#3A2A1E");
	}
	if (cool) {
		// Snowflake.
		inner += `<g stroke="${color}" stroke-width="3" stroke-linecap="round">${[0, 60, 120].map((a) => `<path d="M60 26 v40" transform="rotate(${a} 60 46)"/>`).join("")}</g>`;
	} else {
		inner += `<path d="M48 64 c-6 -10 6 -14 0 -26 M60 64 c-6 -10 6 -14 0 -26 M72 64 c-6 -10 6 -14 0 -26" stroke="${color}" stroke-width="3.4" fill="none" stroke-linecap="round"/>`;
	}
	inner += text(label, { x: 60, y: 22, size: 13, max: 100, fill: enabled ? C.text : C.grey, weight: 700 });
	const line = cool ? (s ? `${Math.round(s.nozzle)}° / ${Math.round(s.bed)}°` : "aus") : active && s ? `${Math.round(s.nozzle)}° → ${nozzle}°` : `${nozzle}° / ${bed}°`;
	inner += text(line, { x: 60, y: 96, size: 15, max: 100, fill: enabled ? (active ? C.glowLight : C.greyLight) : C.grey, face: "mono", weight: 700 });
	inner += text(active ? "drücken: aus" : cool ? "Abkühlen" : "Vorheizen", { x: 60, y: 112, size: 11, max: 100, fill: C.label, face: "body" });
	return keyImage(inner);
}

const FAN_LABEL: Record<Fan, string> = { part: "Bauteil", aux: "Hilfslüfter", chamber: "Kammer" };

/** A fan, turning as fast as it runs. */
export function fanKey(which: Fan, percent: number, t: number): string {
	const on = percent > 0;
	const color = on ? C.print : C.grey;
	const angle = on ? ((t * (90 + percent * 6)) % 360).toFixed(0) : "0";
	let inner = BG;
	if (on) {
		inner += ring(C.print, percent / 100, C.printDim);
	}
	inner += `<g transform="rotate(${angle} 60 50)">${[0, 120, 240].map((a) => `<path d="M60 50 C 54 38, 58 28, 66 28 C 72 32, 68 44, 60 50z" fill="${color}" transform="rotate(${a} 60 50)"/>`).join("")}</g>`;
	inner += `<circle cx="60" cy="50" r="4" fill="${C.graphite}" stroke="${color}" stroke-width="2"/>`;
	inner += text(on ? `${percent}%` : "aus", { x: 60, y: 92, size: 17, max: 96, fill: on ? C.printLight : C.greyLight, face: "mono", weight: 700 });
	inner += text(FAN_LABEL[which], { x: 60, y: 110, size: 12, max: 100, fill: C.label, face: "body" });
	return keyImage(inner);
}

export type InfoView = "eta" | "remaining" | "layer" | "job";
export const INFO_VIEWS: InfoView[] = ["eta", "remaining", "layer", "job"];

/** "14:32" from now plus minutes, in local time. */
export function clockAfter(minutes: number, now = new Date()): string {
	const d = new Date(now.getTime() + Math.max(0, minutes) * 60_000);
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Splits a long name into two short lines. */
function twoLines(name: string, max = 12): [string, string] {
	if (name.length <= max) {
		return [name, ""];
	}
	const cut = name.lastIndexOf(" ", max) > 3 ? name.lastIndexOf(" ", max) : max;
	return [name.slice(0, cut).trim(), name.slice(cut).trim()];
}

/** Job info: when it will be done, time left, layer, or the file name. */
export function jobKey(s: Status, view: InfoView, now = new Date()): string {
	let inner = BG;
	const busy = s.stage === "printing" || s.stage === "paused" || s.stage === "heating";
	if (busy) {
		inner += ring(s.stage === "paused" ? C.honey : C.print, s.percent / 100, s.stage === "paused" ? "#3A321E" : C.printDim);
	}
	const label = { eta: "fertig um", remaining: "Restzeit", layer: "Schicht", job: "Druck" }[view];
	inner += text(label, { x: 60, y: 30, size: 12, max: 96, fill: C.label, face: "body" });
	if (!busy) {
		const word = s.stage === "finished" ? "fertig" : s.stage === "failed" ? "Fehler" : s.stage === "offline" ? "offline" : "bereit";
		inner += text(word, { x: 60, y: 70, size: 20, max: 96, fill: C.greyLight });
		if (s.job && (s.stage === "finished" || s.stage === "failed")) {
			inner += text(s.job, { x: 60, y: 96, size: 11, max: 96, fill: C.grey, face: "body" });
		}
		return keyImage(inner);
	}
	const big = { fill: s.stage === "paused" ? C.honeyLight : C.printLight, face: "mono" as const, weight: 700 };
	switch (view) {
		case "eta":
			inner += text(clockAfter(s.remaining, now), { x: 60, y: 72, size: 28, max: 96, ...big });
			inner += text(`noch ${hm(s.remaining)}`, { x: 60, y: 96, size: 12, max: 96, fill: C.grey, face: "body" });
			break;
		case "remaining":
			inner += text(hm(s.remaining), { x: 60, y: 72, size: 28, max: 96, ...big });
			inner += text(`${s.percent}%`, { x: 60, y: 96, size: 12, max: 96, fill: C.grey, face: "body" });
			break;
		case "layer":
			inner += text(String(s.layer), { x: 60, y: 70, size: 26, max: 96, ...big });
			inner += text(`von ${s.layers || "?"}`, { x: 60, y: 94, size: 13, max: 96, fill: C.grey, face: "body" });
			break;
		case "job": {
			const [a, b] = twoLines(s.job || "Druck");
			inner += text(a, { x: 60, y: b ? 62 : 70, size: 15, max: 96, fill: C.text, weight: 700 });
			if (b) {
				inner += text(b, { x: 60, y: 82, size: 15, max: 96, fill: C.text, weight: 700 });
			}
			break;
		}
	}
	return keyImage(inner);
}

export type MoveWhat = "home" | "zup" | "zdown";

/** Axes: home, or Z up/down by 10 mm. Grey while printing. */
export function moveKey(what: MoveWhat, enabled: boolean): string {
	const color = enabled ? C.greyLight : OFF;
	let inner = BG;
	if (what === "home") {
		inner += `<path d="M40 54 L60 34 L80 54 M46 50 v18 h28 v-18" stroke="${color}" stroke-width="3.4" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`;
		inner += text("Referenz", { x: 60, y: 96, size: 15, max: 100, fill: enabled ? C.text : C.grey });
		inner += text("fahrt (G28)", { x: 60, y: 112, size: 11, max: 100, fill: C.label, face: "body" });
	} else {
		const up = what === "zup";
		inner += `<path d="${up ? "M60 66 V32 M48 44 L60 32 L72 44" : "M60 32 V66 M48 54 L60 66 L72 54"}" stroke="${color}" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
		inner += text(up ? "Z +10" : "Z −10", { x: 60, y: 96, size: 17, max: 100, fill: enabled ? C.text : C.grey, face: "mono", weight: 700 });
		inner += text("mm", { x: 60, y: 112, size: 11, max: 100, fill: C.label, face: "body" });
	}
	return keyImage(inner);
}

/** Load a spool (its colour) or unload whatever is in. */
export function filamentKey(mode: "load" | "unload", tray: Tray | undefined, label: string, stage: Stage, enabled: boolean): string {
	let inner = BG;
	const color = mode === "load" && tray?.color ? tray.color : "#6A6F76";
	inner += `<circle cx="60" cy="46" r="19" fill="${enabled ? color : OFF}" stroke="#4A4F57" stroke-width="1.2"/><circle cx="60" cy="46" r="5" fill="#121417"/>`;
	const arrow = mode === "load" ? "M86 38 v18 M80 50 l6 6 l6 -6" : "M86 56 v-18 M80 44 l6 -6 l6 6";
	inner += `<path d="${arrow}" stroke="${enabled ? C.bambooLight : OFF}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
	const title = mode === "load" ? `Laden ${label}` : "Entladen";
	inner += text(title, { x: 60, y: 92, size: 15, max: 100, fill: enabled ? C.text : C.grey, weight: 700 });
	const sub = mode === "load" ? (tray?.loaded ? `${tray.material}${tray.temp ? ` · ${tray.temp}°` : ""}` : "leer") : stage === "printing" ? "nicht beim Druck" : "Filament raus";
	inner += text(sub, { x: 60, y: 110, size: 11, max: 100, fill: C.label, face: "body" });
	return keyImage(inner);
}

/** A user's G-code macro with its own name. */
export function gcodeKey(name: string, enabled: boolean): string {
	let inner = BG;
	const color = enabled ? C.bambooLight : OFF;
	inner += `<rect x="34" y="26" width="52" height="40" rx="7" fill="none" stroke="${color}" stroke-width="3"/>`;
	inner += `<path d="M44 40 l8 6 l-8 6 M58 54 h14" stroke="${color}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
	inner += text(name || "G-Code", { x: 60, y: 96, size: 15, max: 100, fill: enabled ? C.text : C.grey, weight: 700 });
	return keyImage(inner);
}
