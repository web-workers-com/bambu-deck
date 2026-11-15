/** Keys of the setup guide: one item per key, text never crosses a key edge. */
import { familyInfo, stepsFor, type FamilyInfo, type GuideItem, type StepIcon } from "../setup.js";
import { panda } from "./panda.js";
import { printerOutline } from "./printer.js";
import { BG, C, keyImage, swing, text } from "./svg.js";

function printerShape(shape: FamilyInfo["shape"], cy: number, color: string): string {
	return printerOutline(shape, 60, cy, color, 0.52);
}

const ICON: Record<StepIcon, (color: string) => string> = {
	screen: (c) => `<rect x="44" y="24" width="32" height="22" rx="3" fill="none" stroke="${c}" stroke-width="3"/><path d="M50 31 h14 M50 38 h20" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/>`,
	ip: (c) => `<circle cx="60" cy="35" r="12" fill="none" stroke="${c}" stroke-width="3"/><path d="M48 35 h24 M60 23 c-6 6 -6 18 0 24 M60 23 c6 6 6 18 0 24" stroke="${c}" stroke-width="2.2" fill="none"/>`,
	code: (c) => `<circle cx="51" cy="35" r="8" fill="none" stroke="${c}" stroke-width="3"/><path d="M59 35 h16 M70 35 v6 M75 35 v4" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`,
	serial: (c) => `<rect x="42" y="25" width="36" height="20" rx="3" fill="none" stroke="${c}" stroke-width="3"/><path d="M48 31 v8 M52 31 v8 M57 31 v8 M60 31 v8 M65 31 v8 M70 31 v8" stroke="${c}" stroke-width="2"/>`,
	deck: (c) =>
		`<rect x="40" y="23" width="40" height="25" rx="4" fill="none" stroke="${c}" stroke-width="3"/>` +
		[46, 56, 66].flatMap((x) => [29, 37].map((y) => `<rect x="${x}" y="${y}" width="8" height="6" rx="1.5" fill="${c}" fill-opacity="${x === 46 && y === 29 ? 1 : 0.35}"/>`)).join(""),
	lan: (c) => `<path d="M60 22 v10 M52 32 h16 v8 h-16z M56 40 v8 M64 40 v8" stroke="${c}" stroke-width="3" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`,
};

function badge(n: number): string {
	return `<circle cx="20" cy="20" r="11" fill="${C.bamboo}"/>` + text(String(n), { x: 20, y: 25, size: 14, max: 16, fill: C.graphite, weight: 700 });
}

function bubble(title: [string, string], sub: string): string {
	let m = BG + `<path d="M18 12 h84 a10 10 0 0 1 10 10 v56 a10 10 0 0 1 -10 10 h-62 l-18 14 l4 -14 h-8 a10 10 0 0 1 -10 -10 v-56 a10 10 0 0 1 10 -10 z" fill="${C.bamboo}"/>`;
	m += text(title[0], { x: 60, y: 45, size: 19, max: 88, fill: C.graphite, weight: 700 });
	m += text(title[1], { x: 60, y: 68, size: 19, max: 88, fill: C.graphite, weight: 700 });
	m += text(sub, { x: 60, y: 113, size: 11, max: 96, fill: C.greyLight, face: "body" });
	return keyImage(m);
}

/** One key of the guide. `status` is the connecting printer's line ("192.168.1.42", "Zeitüberschreitung"). */
export function guideKey(item: GuideItem, t = 0, status?: { name: string; problem: string }): string {
	switch (item.kind) {
		case "ask":
			return bubble(["Welcher", "Drucker?"], "Bambu Deck einrichten");
		case "family": {
			const f = familyInfo(item.family);
			let m = BG + printerShape(f.shape, 40, C.greyLight);
			m += text(f.name, { x: 60, y: 88, size: 22, max: 100, fill: C.text, weight: 700 });
			m += text(f.models, { x: 60, y: 108, size: 12, max: 96, fill: C.label, face: "body" });
			return keyImage(m);
		}
		case "header": {
			const f = familyInfo(item.family);
			let m = BG + `<rect x="4" y="4" width="112" height="112" rx="22" fill="none" stroke="${C.bamboo}" stroke-width="3"/>`;
			m += printerShape(f.shape, 36, C.bambooLight);
			m += text(f.name, { x: 60, y: 80, size: 20, max: 100, fill: C.text, weight: 700 });
			m += text("‹ anderer Drucker", { x: 60, y: 104, size: 12, max: 90, fill: C.label, face: "body" });
			return keyImage(m);
		}
		case "step": {
			const step = stepsFor(item.family)[item.index]!;
			const optional = step.icon === "lan";
			let m = BG + (optional ? "" : badge(item.index + 1));
			m += ICON[step.icon](optional ? C.honey : C.bambooLight);
			m += text(step.title, { x: 60, y: 72, size: 15, max: 94, fill: optional ? C.honeyLight : C.text, weight: 700 });
			m += text(step.lines[0], { x: 60, y: 92, size: 13, max: 98, fill: C.greyLight, face: "body" });
			m += text(step.lines[1], { x: 60, y: 108, size: 13, max: 98, fill: C.greyLight, face: "body" });
			return keyImage(m);
		}
		case "status": {
			const pulse = 0.35 + swing(t, 1.6) * 0.65;
			let m = BG + `<rect x="4" y="4" width="112" height="112" rx="22" fill="none" stroke="${C.print}" stroke-width="4" opacity="${pulse.toFixed(2)}"/>`;
			m += [44, 60, 76].map((x, n) => `<circle cx="${x}" cy="38" r="5" fill="${C.printLight}" opacity="${(0.3 + swing(t, 1.2, n * 0.3) * 0.7).toFixed(2)}"/>`).join("");
			m += text("Verbinde …", { x: 60, y: 72, size: 15, max: 104, fill: C.printLight, weight: 700 });
			m += text(status?.name ?? "", { x: 60, y: 92, size: 13, max: 96, fill: C.text, face: "body" });
			m += text(status?.problem || "warte auf Antwort", { x: 60, y: 108, size: 12, max: 96, fill: status?.problem ? C.coralLight : C.label, face: "body" });
			return keyImage(m);
		}
		case "demo": {
			let m = BG + `<path d="M50 28 v26 l22 -13z" fill="${C.print}"/>`;
			m += text("Demo", { x: 60, y: 82, size: 17, max: 100, fill: C.printLight, weight: 700 });
			m += text("ohne Drucker", { x: 60, y: 102, size: 12, max: 100, fill: C.label, face: "body" });
			return keyImage(m);
		}
		case "later": {
			let m = BG + `<circle cx="60" cy="42" r="15" fill="none" stroke="${C.greyLight}" stroke-width="3"/><path d="M60 34 v8 l6 4" stroke="${C.greyLight}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
			m += text("Später", { x: 60, y: 82, size: 17, max: 100, fill: C.greyLight });
			m += text("Anleitung zu", { x: 60, y: 102, size: 12, max: 100, fill: C.label, face: "body" });
			return keyImage(m);
		}
		case "next":
		case "prev": {
			const next = item.kind === "next";
			const arrow = next ? `<path d="M46 44 h28 M64 33 l11 11 l-11 11" ` : `<path d="M74 44 h-28 M56 33 l-11 11 l11 11" `;
			let m = BG + `${arrow}stroke="${next ? C.bambooLight : C.greyLight}" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
			m += text(next ? "Weiter" : "Zurück", { x: 60, y: 90, size: 17, max: 100, fill: next ? C.bambooLight : C.greyLight });
			return keyImage(m);
		}
		case "bao": {
			const blink = t % 4 < 0.15;
			return keyImage(BG + panda({ mood: "open", dy: 14, blink }));
		}
		default:
			return keyImage(BG);
	}
}
