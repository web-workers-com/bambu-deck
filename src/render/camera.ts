/**
 * The camera across the whole deck, and the key that starts it. Every key gets
 * the same frame and shows its own part of it; the gaps between keys are
 * counted in, so the picture is not squeezed.
 */
import { BG, C, DEFS, keyImage, swing, text } from "./svg.js";

/** Gap between keys in key units (120 = one key), roughly as on a Stream Deck. */
export const GAP = 30;

/** Size of the whole picture in key units. */
export function canvasSize(columns: number, rows: number): { width: number; height: number } {
	return { width: columns * 120 + (columns - 1) * GAP, height: rows * 120 + (rows - 1) * GAP };
}

/** Frame width to ask ffmpeg for: sharp enough for 144-pixel keys. */
export function frameWidth(columns: number, rows: number): number {
	return Math.min(1280, Math.round((canvasSize(columns, rows).width * 1.2) / 2) * 2);
}

/** Frames per second the deck can take: more keys, fewer frames. */
export function frameRate(columns: number, rows: number): number {
	const keys = columns * rows;
	return keys <= 15 ? 3 : keys <= 32 ? 2 : 1;
}

export type CameraView = {
	columns: number;
	rows: number;
	jpeg: Buffer | undefined;
	printer: string;
	problem: string;
	t: number;
};

/** One key of the full-deck camera. */
export function cameraDeckKey(v: CameraView, column: number, row: number): string {
	const last = { column: v.columns - 1, row: v.rows - 1 };
	const center = { column: Math.floor((v.columns - 1) / 2), row: Math.floor((v.rows - 1) / 2) };
	if (!v.jpeg) {
		// No picture yet: one key says why, the others stay dark.
		if (column === center.column && row === center.row) {
			let m = BG + [44, 60, 76].map((x, n) => `<circle cx="${x}" cy="44" r="5" fill="${C.printLight}" opacity="${(0.3 + swing(v.t, 1.2, n * 0.3) * 0.7).toFixed(2)}"/>`).join("");
			m += text("Kamera", { x: 60, y: 78, size: 17, max: 96, fill: C.text, weight: 700 });
			m += text(v.problem || "startet …", { x: 60, y: 100, size: 12, max: 100, fill: v.problem ? C.coralLight : C.label, face: "body" });
			return keyImage(m);
		}
		if (column === last.column && row === last.row) {
			return keyImage(BG + backChip());
		}
		return keyImage(BG);
	}
	const { width, height } = canvasSize(v.columns, v.rows);
	const x = column * (120 + GAP);
	const y = row * (120 + GAP);
	const src = `data:image/jpeg;base64,${v.jpeg.toString("base64")}`;
	let overlay = "";
	if (column === 0 && row === 0) {
		overlay =
			`<rect x="8" y="8" width="54" height="22" rx="11" fill="#000000" fill-opacity="0.55"/>` +
			`<circle cx="21" cy="19" r="5" fill="${C.coral}"/>` +
			text("LIVE", { x: 30, y: 24, size: 12, max: 28, fill: "#FFFFFF", weight: 700, anchor: "start", face: "body" });
	}
	if (column === last.column && row === last.row) {
		overlay += backChip();
	}
	// Coordinates of the overlay are in key units; the picture is placed in deck units.
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="144" height="144" viewBox="0 0 120 120">` +
		`<defs>${DEFS}</defs><rect width="120" height="120" fill="#000000"/>` +
		`<image x="${-x}" y="${-y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" xlink:href="${src}" href="${src}"/>` +
		overlay +
		`</svg>`;
	// Plain (not base64) SVG: the frame inside is base64 already.
	return `data:image/svg+xml;charset=utf8,${svg}`;
}

function backChip(): string {
	return `<rect x="58" y="90" width="54" height="22" rx="11" fill="#000000" fill-opacity="0.55"/>` + text("Zurück", { x: 85, y: 105, size: 12, max: 44, fill: "#FFFFFF", face: "body" });
}

/** The key that opens the camera. */
export function cameraKey(name: string, available = true): string {
	const color = available ? C.printLight : C.grey;
	let m = BG;
	m += `<rect x="34" y="34" width="44" height="32" rx="7" fill="none" stroke="${color}" stroke-width="3.4"/>`;
	m += `<path d="M78 44 l12 -7 v26 l-12 -7z" fill="${color}"/>`;
	m += `<circle cx="56" cy="50" r="8" fill="none" stroke="${color}" stroke-width="3"/>`;
	if (available) {
		m += `<circle cx="96" cy="24" r="5" fill="${C.coral}"/>`;
	}
	m += text(name, { x: 60, y: 100, size: 15, max: 100, fill: available ? C.text : C.grey });
	return keyImage(m);
}
