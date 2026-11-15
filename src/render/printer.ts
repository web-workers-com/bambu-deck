/** Printer outlines by model family and a small toolhead mark. Generic drawings, no Bambu Lab logo. */
import type { Family } from "../bambu/models.js";

/** Which drawing: X1/X2 (square, status light), P1/P2, open bed slinger (A1/A2), wide (H2/H3, two nozzles). */
export type Shape = "x1" | "p" | "open" | "wide" | "nine";

export function shapeOf(family: Family | undefined): Shape {
	switch (family) {
		case "X1":
		case "X2":
			return "x1";
		case "A1":
		case "A2":
			return "open";
		case "H2":
			return "wide";
		case "H3":
			return "nine";
		default:
			return "p";
	}
}

const BODY = "#4A4F57";
const EDGE = "#60666F";
const WINDOW = "#5B7489";
const BASE = "#17191C";

/**
 * The printer drawings from the design canvas, recoloured for dark keys.
 * Drawn in a 160 × 96 box, centred on (cx, cy) at scale `s`. `accent` lights
 * the status light and tints the window (green = done, blue = printing).
 */
export function printerOutline(shape: Shape, cx: number, cy: number, accent: string, s = 0.5): string {
	let m: string;
	const body = (x: number, y: number, w: number, h: number, r: number) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${BODY}" stroke="${EDGE}" stroke-width="1.5"/>`;
	const pane = (x: number, y: number, w: number, h: number, r: number) =>
		`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${WINDOW}" opacity="0.6"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${accent}" opacity="0.14"/>`;
	switch (shape) {
		case "x1":
			m = body(38, 8, 84, 84, 8) + pane(46, 16, 68, 60, 4) + `<rect x="46" y="80" width="68" height="6" rx="2" fill="${BASE}"/><circle cx="108" cy="83" r="2.4" fill="${accent}"/>`;
			break;
		case "open":
			m =
				`<path d="M42 88 h76" stroke="${BODY}" stroke-width="7" stroke-linecap="round"/>` +
				`<path d="M112 88 v-76 M112 18 h-60" stroke="${EDGE}" stroke-width="7" stroke-linecap="round" fill="none"/>` +
				`<rect x="58" y="18" width="16" height="16" rx="3" fill="#8C9198"/><path d="M63 34 h6 l-2 5 h-2z" fill="#C9A24A"/>` +
				`<rect x="48" y="74" width="56" height="6" rx="2" fill="${accent}" opacity="0.85"/>`;
			break;
		case "wide":
			m =
				body(28, 8, 104, 84, 9) +
				pane(36, 16, 88, 62, 4) +
				`<rect x="70" y="20" width="9" height="10" rx="2" fill="#C9CDD3"/><rect x="81" y="20" width="9" height="10" rx="2" fill="#C9CDD3"/>` +
				`<rect x="36" y="82" width="88" height="5" rx="2" fill="${BASE}"/><circle cx="118" cy="84.5" r="2.2" fill="${accent}"/>`;
			break;
		case "nine":
			// H3C: a tool changer with nine heads parked along the top.
			m =
				body(24, 6, 112, 86, 9) +
				pane(32, 14, 96, 64, 4) +
				`<path d="M34 30 h92" stroke="#2A2D31" stroke-width="3"/>` +
				Array.from({ length: 9 }, (_, i) => `<rect x="${36 + i * 10}" y="18" width="7" height="9" rx="1.5" fill="#C9CDD3"/><path d="M${38.5 + i * 10} 27 h2 l-0.6 2 h-0.8z" fill="#C9A24A"/>`).join("") +
				`<rect x="74" y="44" width="12" height="10" rx="2" fill="#E9E6DF"/><path d="M78 54 h4 l-1 3 h-2z" fill="#C9A24A"/>` +
				`<rect x="32" y="82" width="96" height="5" rx="2" fill="${BASE}"/><circle cx="122" cy="84.5" r="2.2" fill="${accent}"/>`;
			break;
		default:
			m = body(40, 12, 80, 80, 8) + pane(48, 20, 64, 58, 4) + `<rect x="48" y="82" width="64" height="5" rx="2" fill="${BASE}"/>`;
	}
	return `<g transform="translate(${(cx - 80 * s).toFixed(1)} ${(cy - 48 * s).toFixed(1)}) scale(${s})">${m}</g>`;
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
