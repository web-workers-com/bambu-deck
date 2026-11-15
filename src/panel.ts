/**
 * The control panel across the whole deck: every control the printer has,
 * one per key, split into pages on small decks. Pure, for tests.
 */
import { PRESETS, type Command, type Fan } from "./bambu/commands.js";
import type { Model } from "./bambu/models.js";
import { allTrays, type Status } from "./bambu/report.js";

export type PanelItem =
	| { kind: "pause" }
	| { kind: "stop" }
	| { kind: "light" }
	| { kind: "speed" }
	| { kind: "preheat"; preset: string }
	| { kind: "fan"; which: Fan }
	| { kind: "home" }
	| { kind: "zup" }
	| { kind: "zdown" }
	| { kind: "unload" }
	| { kind: "load"; label: string }
	| { kind: "back" }
	| { kind: "prev" }
	| { kind: "next" }
	| { kind: "blank" };

/** What this printer can do, in a sensible order. */
export function panelItems(model: Pick<Model, "light" | "family">, status: Status): PanelItem[] {
	const items: PanelItem[] = [{ kind: "pause" }, { kind: "stop" }];
	if (model.light) {
		items.push({ kind: "light" });
	}
	items.push({ kind: "speed" });
	items.push(...Object.keys(PRESETS).map((preset): PanelItem => ({ kind: "preheat", preset })));
	items.push({ kind: "fan", which: "part" });
	if (model.family !== "A1") {
		items.push({ kind: "fan", which: "aux" }, { kind: "fan", which: "chamber" });
	}
	items.push({ kind: "home" }, { kind: "zup" }, { kind: "zdown" }, { kind: "unload" });
	items.push(...allTrays(status).filter((t) => t.loaded).map((t): PanelItem => ({ kind: "load", label: t.label })));
	return items;
}

/**
 * Pages of exactly `columns × rows` items. "Weiter" takes the last key of
 * every page but the last, "Zurück" (page) the first key of every page but
 * the first; "back" (leave the panel) ends the last page.
 */
export function panelPages(columns: number, rows: number, items: PanelItem[]): PanelItem[][] {
	const slots = Math.max(3, columns * rows);
	const all = [...items, { kind: "back" } as PanelItem];
	const pages: PanelItem[][] = [];
	let i = 0;
	while (i < all.length) {
		const first = pages.length === 0;
		let room = slots - (first ? 0 : 1);
		const more = all.length - i > room;
		if (more) {
			room -= 1;
		}
		const take = all.slice(i, i + room);
		i += room;
		const page: PanelItem[] = first ? [] : [{ kind: "prev" }];
		if (more) {
			page.push(...take, { kind: "next" });
		} else {
			const body = take.slice(0, -1);
			page.push(...body, ...Array.from({ length: slots - page.length - take.length }, (): PanelItem => ({ kind: "blank" })), take.at(-1)!);
		}
		pages.push(page);
	}
	return pages;
}

export function panelAt(columns: number, rows: number, column: number, row: number, items: PanelItem[], page: number): PanelItem {
	const pages = panelPages(columns, rows, items);
	const p = pages[Math.min(Math.max(0, page), pages.length - 1)]!;
	return p[row * columns + column] ?? { kind: "blank" };
}

/** Not printing, and connected: safe to heat, move or swap filament. */
export const idle = (s: Status) => !["printing", "heating", "paused", "offline"].includes(s.stage);

const fanPercent = (s: Status, which: Fan) => (which === "aux" ? s.fanAux : which === "chamber" ? s.fanChamber : s.fan);

/** What pressing an item sends right now; nothing when the key is grey. Stop needs holding and is not here. */
export function panelCommands(item: PanelItem, model: Pick<Model, "light">, s: Status): Command[] {
	switch (item.kind) {
		case "pause":
			return s.stage === "paused" ? [{ kind: "resume" }] : s.stage === "printing" || s.stage === "heating" ? [{ kind: "pause" }] : [];
		case "light":
			return model.light && s.stage !== "offline" ? [{ kind: "light", on: !s.light }] : [];
		case "speed":
			return s.stage === "offline" ? [] : [{ kind: "speed", level: s.speed >= 3 ? 1 : s.speed + 1 }];
		case "preheat": {
			const p = PRESETS[item.preset];
			if (!p || !idle(s)) {
				return [];
			}
			const again = p.nozzle > 0 && s.nozzleTarget === p.nozzle && s.bedTarget === p.bed;
			return [
				{ kind: "nozzle", target: again ? 0 : p.nozzle },
				{ kind: "bed", target: again ? 0 : p.bed },
			];
		}
		case "fan": {
			if (s.stage === "offline") {
				return [];
			}
			const now = fanPercent(s, item.which);
			return [{ kind: "fan", which: item.which, percent: now < 50 ? 50 : now < 100 ? 100 : 0 }];
		}
		case "home":
			return idle(s) ? [{ kind: "home" }] : [];
		case "zup":
		case "zdown":
			return idle(s) ? [{ kind: "moveZ", mm: item.kind === "zup" ? 10 : -10 }] : [];
		case "unload":
			return idle(s) ? [{ kind: "unload", temp: allTrays(s).find((t) => t.active)?.temp ?? 220 }] : [];
		case "load": {
			const t = allTrays(s).find((x) => x.label === item.label);
			return idle(s) && t?.loaded ? [{ kind: "load", slot: t.slot, amsId: t.amsId, trayIndex: t.trayIndex, temp: t.temp ?? 220 }] : [];
		}
		default:
			return [];
	}
}

export { fanPercent };
