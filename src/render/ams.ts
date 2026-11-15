/**
 * The whole AMS on one key, drawn as on the design canvas: the classic AMS
 * and the AMS 2 Pro as a shell with a window, the AMS lite with its spools on
 * arms, the AMS HT with one spool. Real spool colours; the spool in use turns,
 * drying shows heat rising.
 */
import type { AmsUnit, Stage, Tray } from "../bambu/report.js";
import { heat } from "./panda.js";
import { BG, C, hm, keyImage, ring, text } from "./svg.js";

const KIND_NAME: Record<AmsUnit["kind"], string> = { ams: "AMS", lite: "AMS lite", ams2: "AMS 2 Pro", ht: "AMS HT" };

function spool(tray: Tray | undefined, cx: number, cy: number, r: number, printing: boolean, t: number): string {
	if (!tray?.loaded) {
		return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#4A4F57" stroke-width="1.6" stroke-dasharray="3 3"/>`;
	}
	const color = tray.color || "#6A6F76";
	const turning = tray.active && printing;
	const angle = turning ? ((t * 120) % 360).toFixed(0) : "0";
	let m = "";
	if (tray.active) {
		m += `<circle cx="${cx}" cy="${cy}" r="${r + 3}" fill="none" stroke="${C.print}" stroke-width="2"/>`;
	}
	m += `<g transform="rotate(${angle} ${cx} ${cy})"><circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="#00000033" stroke-width="1"/><path d="M${cx} ${cy - r + 2} v${r * 0.35}" stroke="#000000" stroke-opacity="0.28" stroke-width="1.6"/></g>`;
	m += `<circle cx="${cx}" cy="${cy}" r="${(r * 0.36).toFixed(1)}" fill="#121417"/>`;
	if (tray.remain !== undefined && tray.remain <= 15) {
		m += `<circle cx="${cx + r * 0.7}" cy="${cy - r * 0.7}" r="3" fill="${C.honey}"/>`;
	}
	return m;
}

/** One AMS unit on a key. `wanted` names it when it is not there. */
export function amsUnitKey(unit: AmsUnit | undefined, stage: Stage, t: number, wanted = "A"): string {
	let inner = BG;
	if (!unit) {
		inner += text(`AMS ${wanted}`, { x: 60, y: 24, size: 12, max: 100, fill: C.label, face: "body" });
		inner += `<rect x="10" y="40" width="100" height="38" rx="8" fill="none" stroke="#4A4F57" stroke-width="2" stroke-dasharray="5 5"/>`;
		inner += text("nicht da", { x: 60, y: 104, size: 15, max: 96, fill: C.grey });
		return keyImage(inner);
	}
	const printing = stage === "printing" || stage === "heating";
	const trays = [0, 1, 2, 3].map((i) => unit.trays.find((x) => x.trayIndex === i) ?? unit.trays[i]);
	const drying = unit.dryingLeft > 0;
	if (drying) {
		inner += ring(C.glow, 1, undefined, 0.55);
	}
	const title = unit.kind === "ht" ? unit.label : `${KIND_NAME[unit.kind]} ${unit.label}`;
	inner += text(title, { x: 60, y: 22, size: 12, max: 100, fill: C.label, face: "body" });

	if (unit.kind === "lite") {
		// Spools on arms over a stand, as the AMS lite sits next to the A1.
		inner += `<path d="M60 70 v14" stroke="#4A4F57" stroke-width="5" stroke-linecap="round"/><rect x="40" y="82" width="40" height="6" rx="3" fill="#4A4F57"/>`;
		const pos = [[-39, 6], [-13, -2], [13, -2], [39, 6]];
		trays.forEach((tr, i) => (inner += spool(tr, 60 + pos[i]![0]!, 56 + pos[i]![1]!, 11, printing, t)));
	} else if (unit.kind === "ht") {
		inner += `<rect x="34" y="34" width="52" height="50" rx="9" fill="url(#bdShell)"/><rect x="39" y="39" width="42" height="38" rx="6" fill="#121417" opacity="0.65"/>`;
		inner += spool(unit.trays[0], 60, 58, 14, printing, t);
	} else {
		inner += `<rect x="8" y="36" width="104" height="44" rx="9" fill="url(#bdShell)"/><rect x="13" y="41" width="94" height="28" rx="6" fill="#121417" opacity="0.65"/>`;
		inner += `<circle cx="102" cy="75" r="1.8" fill="${C.bamboo}"/>`;
		[25, 48, 72, 95].forEach((x, i) => (inner += spool(trays[i], x, 55, 9.5, printing, t)));
	}
	if (drying) {
		const p = (t % 1.8) / 1.8;
		// Inside the window, over the spools: the title above stays readable.
		const y = unit.kind === "lite" ? 62 : 68;
		inner += heat(36, y, p, C.glowLight) + heat(60, y, (p + 0.33) % 1, C.glowLight) + heat(84, y, (p + 0.66) % 1, C.glowLight);
	}

	let line: string;
	let color: string = C.greyLight;
	if (drying) {
		line = `${unit.temperature ? `${Math.round(unit.temperature)}° · ` : ""}${hm(unit.dryingLeft)}`;
		color = C.glowLight;
	} else if (unit.kind === "lite") {
		line = `${unit.trays.filter((x) => x.loaded).length}/4 Spulen`;
	} else if (unit.kind === "ht") {
		line = unit.trays[0]?.loaded ? unit.trays[0].material : "leer";
	} else if (unit.humidity !== undefined) {
		line = `${Math.round(unit.humidity)}% rH`;
		color = unit.humidity >= 40 ? C.honeyLight : C.bambooLight;
	} else if (unit.humidityLevel !== undefined) {
		line = `Feuchte ${unit.humidityLevel}`;
	} else {
		line = `${unit.trays.filter((x) => x.loaded).length}/4 Spulen`;
	}
	inner += text(line, { x: 60, y: 106, size: 14, max: 100, fill: color, face: "mono", weight: 700 });
	return keyImage(inner);
}
