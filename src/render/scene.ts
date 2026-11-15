/**
 * The full-deck alert: Bao big across the picture keys, the answers on the
 * right. One scene per device and frame; each key shows its own crop.
 */
import type { Alert } from "../alerts.js";
import { pictureColumns, roleAt, type Answer } from "../roles.js";
import { panda } from "./panda.js";
import { BG, C, keyImage, q, ring, swing, text } from "./svg.js";

export type SceneOptions = { columns: number; rows: number; alert: Alert | undefined; t: number; hold?: number };

/**
 * The picture as one big drawing in key units (120 per key, no gaps).
 * Bao is placed so his face sits inside a single key: the gaps between keys
 * never cut through eyes or nose.
 */
export function pictureMarkup(o: SceneOptions): string {
	const cols = pictureColumns(o.columns, o.rows, o.alert?.kind);
	const W = cols * 120;
	const H = o.rows * 120;
	const level = o.alert?.level ?? "done";
	const glow = level === "error" ? "bdGlowCoral" : level === "wait" ? "bdGlowHoney" : "bdGlowGreen";
	const mood = level === "error" ? "x" : level === "wait" ? "wide" : "happy";
	// Face centre: the key centre nearest to the middle (across) and a bit above the middle (down).
	const nearest = (target: number, count: number) => Math.min(count - 1, Math.max(0, Math.round((target - 60) / 120))) * 120 + 60;
	const cx = nearest(W / 2, cols);
	const cy = o.rows === 1 ? 60 : nearest(H * 0.42, o.rows);
	// Big enough to fill the picture, small enough that eyes and nose fit one key (they span ±21 × s).
	const s = Math.max(1, Math.min(2.45, Math.min(W, H) / 120));
	const hop = level === "done" ? Math.max(0, Math.sin(((o.t % 1.4) / 1.4) * Math.PI * 2)) * 4 : 0;
	const shake = level === "error" ? Math.sin(o.t * 20) * 2.5 : 0;
	// panda(): translate(dx + 60 - 60s, dy + 60 - 60s) scale(s); eyes sit at (60, 65) in Bao's own units.
	const dx = cx - 60 + shake;
	const dy = cy - 65 * s - 60 + 60 * s - hop;
	let m = `<rect width="${W}" height="${H}" fill="url(#${glow})"/>`;
	m += panda({ mood, scale: s, dx, dy, bamboo: level === "done" });
	if (level === "error") {
		m += `<rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="18" fill="none" stroke="${C.coral}" stroke-width="4" opacity="${q(0.35 + swing(o.t, 1.4) * 0.65, 0.05)}"/>`;
	}
	return m;
}

/** Splits a title into at most two lines for the speech bubble. */
function lines(title: string): string[] {
	const words = title.split(/\s+/).filter(Boolean);
	if (words.length < 2 || title.length <= 9) {
		return [title];
	}
	let best = 1;
	for (let i = 1; i < words.length; i++) {
		const a = words.slice(0, i).join(" ").length;
		const b = words.slice(i).join(" ").length;
		const bestA = words.slice(0, best).join(" ").length;
		const bestB = words.slice(best).join(" ").length;
		if (Math.max(a, b) < Math.max(bestA, bestB)) best = i;
	}
	return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

/** The speech bubble: which printer, and what happened. */
export function infoKey(alert: SceneOptions["alert"]): string {
	const level = alert?.level ?? "done";
	const fill = level === "error" ? C.coral : level === "wait" ? C.honey : C.bamboo;
	let inner = BG;
	inner += `<path d="M18 14 h84 a10 10 0 0 1 10 10 v56 a10 10 0 0 1 -10 10 h-62 l-18 14 l4 -14 h-8 a10 10 0 0 1 -10 -10 v-56 a10 10 0 0 1 10 -10 z" fill="${fill}"/>`;
	const title = lines(alert?.title ?? "Hallo!");
	if (title.length === 1) {
		inner += text(title[0]!, { x: 60, y: 60, size: 22, max: 88, fill: C.graphite, weight: 700 });
	} else {
		inner += text(title[0]!, { x: 60, y: 47, size: 18, max: 88, fill: C.graphite, weight: 700 });
		inner += text(title[1]!, { x: 60, y: 70, size: 18, max: 88, fill: C.graphite, weight: 700 });
	}
	inner += text(alert?.printer ?? "", { x: 60, y: 112, size: 13, max: 104, fill: C.greyLight, face: "body" });
	return keyImage(inner);
}

const ANSWER: Record<Exclude<Answer, "info">, { label: string; color: string; icon: string }> = {
	done: { label: "Erledigt", color: C.bambooLight, icon: `<circle cx="60" cy="48" r="18" fill="${C.bamboo}"/><path d="M51 48 l6 6 l12 -12" stroke="${C.graphite}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` },
	snooze: { label: "Später", color: C.greyLight, icon: `<circle cx="60" cy="48" r="18" fill="none" stroke="${C.greyLight}" stroke-width="3"/><path d="M60 38 v10 l7 4" stroke="${C.greyLight}" stroke-width="3" fill="none" stroke-linecap="round"/>` },
	back: { label: "Zurück", color: C.greyLight, icon: `<path d="M74 48 h-28 M56 37 l-11 11 l11 11" stroke="${C.greyLight}" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` },
	resume: { label: "Fortsetzen", color: C.bambooLight, icon: `<path d="M50 30 v36 l30 -18z" fill="${C.bamboo}"/>` },
	pause: { label: "Pause", color: C.honeyLight, icon: `<rect x="46" y="31" width="10" height="34" rx="3" fill="${C.honey}"/><rect x="64" y="31" width="10" height="34" rx="3" fill="${C.honey}"/>` },
	stop: { label: "Abbrechen", color: C.coralLight, icon: `<rect x="46" y="34" width="28" height="28" rx="6" fill="${C.coral}"/>` },
};

export function answerKey(answer: Exclude<Answer, "info">, hold = 0): string {
	const a = ANSWER[answer];
	let inner = BG;
	if (answer === "stop") {
		inner += ring(C.coral, hold, C.coralDim);
	}
	inner += a.icon;
	inner += text(answer === "stop" && hold > 0 ? "halten …" : answer === "stop" ? "halten" : a.label, { x: 60, y: 98, size: 16, max: 100, fill: a.color });
	if (answer === "stop") {
		inner += text("Abbrechen", { x: 60, y: 22, size: 12, max: 100, fill: C.label, face: "body" });
	}
	return keyImage(inner);
}

/** The image for one key of the alert profile. */
export function alertKey(o: SceneOptions, column: number, row: number, picture?: string): string {
	const role = roleAt(o.columns, o.rows, column, row, o.alert?.kind);
	if (role === "info") {
		return infoKey(o.alert);
	}
	if (role === "blank") {
		return keyImage(BG);
	}
	if (role !== "picture") {
		return answerKey(role, role === "stop" ? (o.hold ?? 0) : 0);
	}
	const markup = picture ?? pictureMarkup(o);
	return keyImage(markup, `${column * 120} ${row * 120} 120 120`);
}
