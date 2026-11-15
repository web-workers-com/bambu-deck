/** Printer outlines by model family, and our own bamboo mark. No Bambu Lab artwork. */
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

/** Our mark: a short bamboo stalk with a leaf, in the top-left corner of a key. */
export const BAMBOO =
	`<g opacity="0.95"><rect x="11" y="9" width="6" height="22" rx="3" fill="url(#bdBamboo)"/>` +
	`<path d="M11 16.5 h6 M11 24 h6" stroke="#3E6E22" stroke-width="1.4"/>` +
	`<path d="M17 14 q5 -5 10 -4 q-4 4 -10 6z" fill="#9BCB62"/></g>`;
