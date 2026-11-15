/**
 * The full-deck alert: Bao big across the picture keys, the answers on the
 * right. One scene per device and frame; each key shows its own crop.
 */
import type { Alert } from "../alerts.js";
import { pictureColumns, roleAt, type Answer } from "../roles.js";
import { panda } from "./panda.js";
import { BG, C, keyImage, q, ring, swing, text } from "./svg.js";

export type SceneOptions = { columns: number; rows: number; alert: Alert | undefined; t: number; hold?: number };

/** The picture as one big drawing in key units (120 per key, no gaps). */
export function pictureMarkup(o: SceneOptions): string {
	const cols = pictureColumns(o.columns, o.rows, o.alert?.kind);
	const W = cols * 120;
	const H = o.rows * 120;
	const level = o.alert?.level ?? "done";
	const glow = level === "error" ? "bdGlowCoral" : level === "wait" ? "bdGlowHoney" : "bdGlowGreen";
	const mood = level === "error" ? "x" : level === "wait" ? "wide" : "happy";
	const s = Math.min(W, H) / 120;
	const hop = level === "done" ? Math.max(0, Math.sin(((o.t % 1.4) / 1.4) * Math.PI * 2)) * 6 * s : 0;
	const shake = level === "error" ? Math.sin(o.t * 20) * 2.5 * s : 0;
	// Bao sits at the bottom centre; scale grows from the key centre (60, 60).
	const dx = W / 2 - 60 + shake;
	const dy = H - 60 - 52 * s + 16 * s - hop;
	let m = `<rect width="${W}" height="${H}" fill="url(#${glow})"/>`;
	m += panda({ mood, scale: s, dx, dy, bamboo: level === "done" });
	if (level === "error") {
		m += `<rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="18" fill="none" stroke="${C.coral}" stroke-width="4" opacity="${q(0.35 + swing(o.t, 1.4) * 0.65, 0.05)}"/>`;
	}
	if (o.alert) {
		const label = `${o.alert.printer} · ${o.alert.title}`;
		const size = Math.min(22, 14 * Math.max(1, s * 0.6));
		m += `<rect x="8" y="${H - size * 2 - 6}" width="${W - 16}" height="${size * 2}" rx="${size}" fill="#0B0D0F" opacity="0.72"/>`;
		m += text(label, { x: W / 2, y: H - size * 0.62 - 6 - size * 0.38, size, max: W - 32, fill: level === "error" ? C.coralLight : level === "wait" ? C.honeyLight : C.bambooLight });
	}
	return m;
}

const ANSWER: Record<Answer, { label: string; color: string; icon: string }> = {
	done: { label: "Erledigt", color: C.bambooLight, icon: `<circle cx="60" cy="48" r="18" fill="${C.bamboo}"/><path d="M51 48 l6 6 l12 -12" stroke="${C.graphite}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` },
	snooze: { label: "Später", color: C.greyLight, icon: `<circle cx="60" cy="48" r="18" fill="none" stroke="${C.greyLight}" stroke-width="3"/><path d="M60 38 v10 l7 4" stroke="${C.greyLight}" stroke-width="3" fill="none" stroke-linecap="round"/>` },
	back: { label: "Zurück", color: C.greyLight, icon: `<path d="M74 48 h-28 M56 37 l-11 11 l11 11" stroke="${C.greyLight}" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` },
	resume: { label: "Fortsetzen", color: C.bambooLight, icon: `<path d="M50 30 v36 l30 -18z" fill="${C.bamboo}"/>` },
	pause: { label: "Pause", color: C.honeyLight, icon: `<rect x="46" y="31" width="10" height="34" rx="3" fill="${C.honey}"/><rect x="64" y="31" width="10" height="34" rx="3" fill="${C.honey}"/>` },
	stop: { label: "Abbrechen", color: C.coralLight, icon: `<rect x="46" y="34" width="28" height="28" rx="6" fill="${C.coral}"/>` },
};

export function answerKey(answer: Answer, hold = 0): string {
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
	if (role !== "picture") {
		return answerKey(role, role === "stop" ? (o.hold ?? 0) : 0);
	}
	const markup = picture ?? pictureMarkup(o);
	return keyImage(markup, `${column * 120} ${row * 120} 120 120`);
}
