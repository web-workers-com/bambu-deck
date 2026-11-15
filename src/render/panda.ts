/**
 * Bao, the panda, in 120-unit key coordinates. Drawn as plain paths so
 * Stream Deck's SVG renderer needs nothing fancy (no <use>, no CSS).
 */
import { C } from "./svg.js";

export type Mood = "open" | "sleep" | "happy" | "wide" | "x";

export type PandaOptions = {
	mood: Mood;
	/** Moves Bao down (and with it most of him out of the key). */
	dy?: number;
	dx?: number;
	scale?: number;
	mouth?: "smile" | "o" | "calm";
	/** Holds a bamboo stick in his paws. */
	bamboo?: boolean;
	/** Blink now (open eyes only). */
	blink?: boolean;
	dim?: number;
};

function eyes(mood: Mood, blink: boolean): string {
	const white = "#FFFFFF";
	switch (mood) {
		case "sleep":
			return `<path d="M41 66 q5 4 10 0 M69 66 q5 4 10 0" stroke="${white}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
		case "happy":
			return `<path d="M41 67 q5 -6 10 0 M69 67 q5 -6 10 0" stroke="${white}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
		case "x":
			return `<path d="M43 62 l6 6 M49 62 l-6 6 M71 62 l6 6 M77 62 l-6 6" stroke="${white}" stroke-width="2" stroke-linecap="round"/>`;
		case "wide":
			return (
				`<circle cx="46" cy="65" r="4.6" fill="${white}"/><circle cx="74" cy="65" r="4.6" fill="${white}"/>` +
				`<circle cx="46" cy="65" r="1.8" fill="${C.ink}"/><circle cx="74" cy="65" r="1.8" fill="${C.ink}"/>`
			);
		case "open":
			if (blink) {
				return `<path d="M42 65.5 h8 M70 65.5 h8" stroke="${white}" stroke-width="2" stroke-linecap="round"/>`;
			}
			return (
				`<circle cx="46" cy="65" r="3.6" fill="${white}"/><circle cx="74" cy="65" r="3.6" fill="${white}"/>` +
				`<circle cx="46.8" cy="65.6" r="2" fill="${C.ink}"/><circle cx="74.8" cy="65.6" r="2" fill="${C.ink}"/>`
			);
	}
}

function mouth(kind: PandaOptions["mouth"]): string {
	switch (kind) {
		case "smile":
			return `<path d="M53 88 q7 7 14 0" stroke="${C.ink}" stroke-width="1.8" fill="#E8735F" stroke-linecap="round"/>`;
		case "o":
			return `<ellipse cx="60" cy="91" rx="3" ry="3.6" fill="${C.ink}"/>`;
		default:
			return `<path d="M60 86 v2.5 M55 90 q2.5 2 5 0 q2.5 2 5 0" stroke="${C.ink}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
	}
}

export function panda(o: PandaOptions): string {
	const s = o.scale ?? 1;
	const tx = (o.dx ?? 0) + 60 - 60 * s;
	const ty = (o.dy ?? 0) + 60 - 60 * s;
	const mouthKind = o.mouth ?? (o.mood === "happy" ? "smile" : o.mood === "x" || o.mood === "wide" ? "o" : "calm");
	const body =
		`<circle cx="33" cy="40" r="13" fill="${C.ink}"/><circle cx="87" cy="40" r="13" fill="${C.ink}"/>` +
		`<circle cx="33" cy="40" r="6" fill="#383B41"/><circle cx="87" cy="40" r="6" fill="#383B41"/>` +
		`<path d="M60 32 C88 32 99 51 99 71 C99 93 82 106 60 106 C38 106 21 93 21 71 C21 51 32 32 60 32Z" fill="url(#bdFur)"/>` +
		`<ellipse cx="45" cy="67" rx="9.5" ry="13" transform="rotate(32 45 67)" fill="${C.ink}"/>` +
		`<ellipse cx="75" cy="67" rx="9.5" ry="13" transform="rotate(-32 75 67)" fill="${C.ink}"/>` +
		eyes(o.mood, !!o.blink) +
		`<path d="M55 81 q5 -3 10 0 q0 4 -5 5 q-5 -1 -5 -5z" fill="${C.ink}"/>` +
		mouth(mouthKind) +
		`<ellipse cx="35" cy="85" rx="5" ry="2.6" fill="#F29A8A" opacity="0.55"/><ellipse cx="85" cy="85" rx="5" ry="2.6" fill="#F29A8A" opacity="0.55"/>` +
		(o.bamboo
			? `<rect x="12" y="94" width="96" height="8" rx="4" fill="url(#bdBamboo)"/><path d="M36 94 v8 M68 94 v8 M94 94 v8" stroke="#4E8A2C" stroke-width="1.6"/>` +
				`<ellipse cx="42" cy="101" rx="11" ry="8" fill="${C.ink}"/><ellipse cx="78" cy="101" rx="11" ry="8" fill="${C.ink}"/>`
			: "");
	const dim = o.dim !== undefined && o.dim < 1 ? ` opacity="${o.dim}"` : "";
	return `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s})"${dim}>${body}</g>`;
}

/** The nozzle that slides above Bao while printing. */
export function nozzle(x: number, y = 4): string {
	return `<g transform="translate(${x.toFixed(1)} ${y})"><path d="M-6 0 h12 v6 h-12z" fill="#4A4F57"/><path d="M-3.5 6 h7 l-2 4 h-3z" fill="${C.greyLight}"/></g>`;
}

/** Little rising heat waves. `p` 0..1 moves them up. */
export function heat(x: number, y: number, p: number, color: string = C.glow): string {
	const dy = -p * 12;
	const op = p < 0.4 ? p / 0.4 : 1 - (p - 0.4) / 0.6;
	return `<path d="M${x} ${y + dy} q3 -4 0 -8 q-3 -4 0 -8" stroke="${color}" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="${op.toFixed(2)}"/>`;
}
