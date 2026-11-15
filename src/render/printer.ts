/** Printer outlines by model family and a small toolhead mark. Generic drawings, no Bambu Lab logo. */
import type { Family } from "../bambu/models.js";

export type Shape = "box" | "open" | "wide";

/** Bed slingers are open frames, the H series is wide, the rest are closed boxes. */
export function shapeOf(family: Family | undefined): Shape {
	return family === "A1" || family === "A2" ? "open" : family === "H2" || family === "H3" ? "wide" : "box";
}

/** A printer outline centred on (cx, cy), `s` = size factor (1 ≈ 40 units wide). */
export function printerOutline(shape: Shape, cx: number, cy: number, color: string, s = 1): string {
	const st = `stroke="${color}" stroke-width="${(3 / s).toFixed(2)}" fill="none" stroke-linejoin="round" stroke-linecap="round"`;
	let m: string;
	if (shape === "open") {
		// Bed slinger: an arm on one side, the bed in front.
		m = `<path d="M-20 16 v-34 h34 M10 -18 v12 M6 -6 h8 v5 h-8z" ${st}/><path d="M-22 16 h46 M-10 8 h32" ${st}/>`;
	} else {
		const w = shape === "wide" ? 52 : 40;
		m =
			`<rect x="${-w / 2}" y="-18" width="${w}" height="36" rx="5" ${st}/>` +
			`<rect x="${-w / 2 + 6}" y="-12" width="${w - 12}" height="20" rx="2" fill="${color}" fill-opacity="0.18" stroke="none"/>` +
			`<path d="M${-w / 2 + 6} 13 h${w - 12}" ${st}/>`;
	}
	return `<g transform="translate(${cx} ${cy}) scale(${s})">${m}</g>`;
}

/**
 * A small toolhead in the key's top-left corner: light housing, dark front,
 * cutter lever on the side, brass nozzle below. A generic drawing, no logo.
 */
export const TOOLHEAD =
	`<g transform="translate(7 6) scale(1.2)">` +
	`<rect x="1" y="0" width="20" height="17" rx="4" fill="#E9E6DF"/>` +
	`<rect x="4" y="3" width="14" height="8" rx="2" fill="#2B2E33"/>` +
	`<circle cx="15" cy="7" r="1.4" fill="#7DB547"/>` +
	`<rect x="-1.5" y="5" width="3" height="8" rx="1.5" fill="#A9AEB5"/>` +
	`<path d="M7.5 17 h7 l-2 4 h-3z" fill="#C9A24A"/>` +
	`<circle cx="11" cy="22.6" r="1.2" fill="#FFB27A"/></g>`;
