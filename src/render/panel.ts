/** Keys of the full-deck control panel, drawn with the same pictures as the single keys. */
import { PRESETS } from "../bambu/commands.js";
import type { Model } from "../bambu/models.js";
import { findTray, type Status } from "../bambu/report.js";
import { fanPercent, idle, type PanelItem } from "../panel.js";
import { fanKey, filamentKey, moveKey, preheatKey } from "./control.js";
import { guideKey } from "./guide.js";
import { lightKey, pauseKey, speedKey, stopKey } from "./keys.js";
import { BAMBOO, printerOutline, type Shape } from "./printer.js";
import { BG, C, keyImage, text } from "./svg.js";

export function panelKey(item: PanelItem, model: Pick<Model, "light">, s: Status, t: number, hold = 0): string {
	const active = ["printing", "heating", "paused"].includes(s.stage);
	switch (item.kind) {
		case "pause":
			return pauseKey(s.stage);
		case "stop":
			return stopKey(hold, active);
		case "light":
			return lightKey(s.light, model.light);
		case "speed":
			return speedKey(s.speed);
		case "preheat": {
			const p = PRESETS[item.preset]!;
			return preheatKey(p.label, p.nozzle, p.bed, s, idle(s));
		}
		case "fan":
			return fanKey(item.which, fanPercent(s, item.which), t);
		case "home":
			return moveKey("home", idle(s));
		case "zup":
		case "zdown":
			return moveKey(item.kind, idle(s));
		case "unload":
			return filamentKey("unload", undefined, "", s.stage, idle(s));
		case "load":
			return filamentKey("load", findTray(s, item.label), item.label, s.stage, idle(s));
		case "back":
			return keyImage(
				BG +
					`<path d="M74 46 h-28 M56 35 l-11 11 l11 11" stroke="${C.greyLight}" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
					text("Fertig", { x: 60, y: 92, size: 17, max: 100, fill: C.greyLight }) +
					text("zurück zum Profil", { x: 60, y: 109, size: 10, max: 100, fill: C.label, face: "body" }),
			);
		case "prev":
		case "next":
			return guideKey(item);
		default:
			return keyImage(BG);
	}
}

/** The key that opens the panel: the printer's outline with two small sliders. */
export function controlsKey(name: string, shape: Shape = "box"): string {
	let m = BG + BAMBOO;
	m += printerOutline(shape, 60, 44, C.bambooLight, 0.95);
	for (const [y, x] of [[74, 70], [82, 50]] as const) {
		m += `<path d="M40 ${y} h40" stroke="${C.track}" stroke-width="3" stroke-linecap="round"/><path d="M40 ${y} h${x - 40}" stroke="${C.bamboo}" stroke-width="3" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="3.6" fill="${C.bambooLight}"/>`;
	}
	m += text("Steuern", { x: 60, y: 103, size: 15, max: 100, fill: C.text, weight: 700 });
	m += text(name, { x: 60, y: 116, size: 10, max: 100, fill: C.label, face: "body" });
	return keyImage(m);
}
