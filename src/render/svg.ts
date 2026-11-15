/**
 * Shared bits for drawing keys: brand colours, fonts, gradients and a text
 * fitter that keeps every label inside its key.
 */

export const C = {
	graphite: "#17191C",
	key: "#1E2124",
	fur: "#FBF8F2",
	ink: "#1B1C1F",
	bamboo: "#7DB547",
	bambooLight: "#B9DD8C",
	print: "#5AA9E6",
	printLight: "#9CCBF0",
	printDim: "#2B3A48",
	glow: "#F08A3C",
	glowLight: "#FFB27A",
	honey: "#F2C14E",
	honeyLight: "#F7D98A",
	coral: "#E5604D",
	coralLight: "#F4A598",
	coralDim: "#5A2A25",
	grey: "#8C9198",
	greyLight: "#C9CDD3",
	label: "#A9AEB5",
	text: "#E6E8EB",
	track: "#33373D",
} as const;

export const DISPLAY = "Fredoka, 'Segoe UI Rounded', 'Segoe UI', 'Arial Rounded MT Bold', Arial, sans-serif";
export const BODY = "Inter, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
export const MONO = "'JetBrains Mono', Consolas, Menlo, 'DejaVu Sans Mono', monospace";

type Face = "display" | "body" | "mono";

/** Average glyph width as a share of the font size, deliberately generous. */
const GLYPH: Record<Face, number> = { display: 0.6, body: 0.56, mono: 0.62 };
const FAMILY: Record<Face, string> = { display: DISPLAY, body: BODY, mono: MONO };

export function esc(value: string): string {
	return value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

export type TextOptions = {
	x: number;
	y: number;
	size: number;
	/** Widest the text may get. */
	max: number;
	fill: string;
	weight?: number;
	anchor?: "start" | "middle" | "end";
	face?: Face;
	min?: number;
	opacity?: number;
};

export function textWidth(text: string, size: number, face: Face = "display"): number {
	return [...text].length * size * GLYPH[face];
}

/** A line of text that never runs past `max`: shrinks, then shortens, then pins its width. */
export function text(value: string, o: TextOptions): string {
	const face = o.face ?? "display";
	const min = o.min ?? o.size * 0.7;
	let size = o.size;
	let line = value;
	if (textWidth(line, size, face) > o.max) {
		size = Math.max(min, Math.floor((o.max / ([...line].length * GLYPH[face])) * 10) / 10);
	}
	while (textWidth(line, size, face) > o.max + 0.01 && [...line].length > 2) {
		line = `${[...line].slice(0, -2).join("")}…`;
	}
	const width = textWidth(line, size, face);
	const pin = width > o.max * 0.85 ? ` textLength="${Math.min(width, o.max).toFixed(1)}" lengthAdjust="spacingAndGlyphs"` : "";
	const opacity = o.opacity !== undefined && o.opacity < 1 ? ` opacity="${o.opacity}"` : "";
	return (
		`<text x="${o.x.toFixed(1)}" y="${o.y.toFixed(1)}" text-anchor="${o.anchor ?? "middle"}" ` +
		`font-family="${FAMILY[face]}" font-weight="${o.weight ?? 600}" font-size="${size.toFixed(1)}" ` +
		`fill="${o.fill}"${opacity}${pin}>${esc(line)}</text>`
	);
}

export const DEFS =
	`<radialGradient id="bdKey" cx="0.5" cy="0.3" r="0.85"><stop offset="0" stop-color="#2C3035"/><stop offset="1" stop-color="#121417"/></radialGradient>` +
	`<radialGradient id="bdFur" cx="0.5" cy="0.35" r="0.7"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E4DFD3"/></radialGradient>` +
	`<linearGradient id="bdShell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4A4F57"/><stop offset="1" stop-color="#2A2D31"/></linearGradient>` +
	`<linearGradient id="bdBamboo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9BCB62"/><stop offset="1" stop-color="#5E9A36"/></linearGradient>` +
	`<radialGradient id="bdGlowGreen" cx="0.35" cy="0.45" r="0.8"><stop offset="0" stop-color="#36502A"/><stop offset="1" stop-color="#121417"/></radialGradient>` +
	`<radialGradient id="bdGlowCoral" cx="0.35" cy="0.45" r="0.8"><stop offset="0" stop-color="#5A2A25"/><stop offset="1" stop-color="#121417"/></radialGradient>` +
	`<radialGradient id="bdGlowHoney" cx="0.35" cy="0.45" r="0.8"><stop offset="0" stop-color="#57461F"/><stop offset="1" stop-color="#121417"/></radialGradient>` +
	`<clipPath id="bdClip"><rect width="120" height="120"/></clipPath>`;

/** Slow in, slow out; 0..1 and back over `period` seconds. */
export function swing(t: number, period: number, offset = 0): number {
	return (1 - Math.cos(((t + offset) / period) * Math.PI * 2)) / 2;
}

/** Rounds animation values so near-identical frames produce identical images. */
export function q(value: number, step = 0.5): string {
	return (Math.round(value / step) * step).toFixed(2).replace(/\.?0+$/, "");
}

/** Wraps markup into a complete key image (data URI). */
export function keyImage(inner: string, viewBox = "0 0 120 120"): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="${viewBox}"><defs>${DEFS}</defs>${inner}</svg>`;
	return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

export const BG = `<rect width="120" height="120" fill="url(#bdKey)"/>`;

/** Perimeter of the key's border track (rounded rect, inset 4, radius 22). */
const TRACK_PERIMETER = 4 * 112 - 8 * 22 + 2 * Math.PI * 22;

/** The border track: full ring in `dim`, `part` (0..1) of it in `color`. */
export function ring(color: string, part = 1, dim?: string, opacity = 1): string {
	const track = dim ? `<rect x="4" y="4" width="112" height="112" rx="22" fill="none" stroke="${dim}" stroke-width="4"/>` : "";
	if (part <= 0) {
		return track;
	}
	const op = opacity < 1 ? ` opacity="${q(opacity, 0.05)}"` : "";
	if (part >= 1) {
		return `${track}<rect x="4" y="4" width="112" height="112" rx="22" fill="none" stroke="${color}" stroke-width="4"${op}/>`;
	}
	// Start at the top centre and run clockwise.
	const len = (TRACK_PERIMETER * part).toFixed(1);
	return (
		track +
		`<path d="M60 4 H94 A22 22 0 0 1 116 26 V94 A22 22 0 0 1 94 116 H26 A22 22 0 0 1 4 94 V26 A22 22 0 0 1 26 4 Z" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${len} 1000"${op}/>`
	);
}

/** "1:12" from minutes. */
export function hm(minutes: number): string {
	const m = Math.max(0, Math.round(minutes));
	return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}
