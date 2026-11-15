/**
 * The setup guide that fills the whole deck while no printer is set up:
 * first "which printer do you have?", then the steps for that model family,
 * one step per key, split into pages when the deck is small. Pure, for tests.
 */

export type GuideFamily = "X1" | "P1" | "P2" | "A1" | "H2";

export type FamilyInfo = {
	id: GuideFamily;
	/** Big on the key. */
	name: string;
	/** Small below: which printers belong here. */
	models: string;
	/** Where IP address and access code are on the printer's screen. */
	menu: string;
	/** Drawing on the key: closed box, open frame (bed slinger), wide box. */
	shape: "box" | "open" | "wide";
};

/**
 * Menu names as on the printer screens in German. Touchscreen printers (X1, P2S,
 * H2) show IP and access code under Network, P1 and A1 under WLAN.
 */
export const FAMILIES: FamilyInfo[] = [
	{ id: "X1", name: "X1", models: "X1C · X1 · X1E", menu: "Netzwerk", shape: "box" },
	{ id: "P1", name: "P1", models: "P1S · P1P", menu: "WLAN", shape: "box" },
	{ id: "P2", name: "P2S", models: "P2S", menu: "Netzwerk", shape: "box" },
	{ id: "A1", name: "A1", models: "A1 · A1 mini", menu: "WLAN", shape: "open" },
	{ id: "H2", name: "H2", models: "H2D · H2S", menu: "Netzwerk", shape: "wide" },
];

export function familyInfo(id: GuideFamily): FamilyInfo {
	return FAMILIES.find((f) => f.id === id) ?? FAMILIES[0]!;
}

export type StepIcon = "screen" | "ip" | "code" | "serial" | "deck" | "lan";
export type Step = { icon: StepIcon; title: string; lines: [string, string] };

/** The steps for one model family, in order. */
export function stepsFor(id: GuideFamily): Step[] {
	const f = familyInfo(id);
	return [
		{ icon: "screen", title: "Am Drucker", lines: ["Einstellungen", `› ${f.menu}`] },
		{ icon: "ip", title: "IP-Adresse", lines: ["steht dort,", "z. B. 192.168…"] },
		{ icon: "code", title: "Zugangscode", lines: ["8 Zeichen,", "gleiche Seite"] },
		{ icon: "serial", title: "Seriennummer", lines: ["Aufkleber am", "Drucker"] },
		{ icon: "deck", title: "Stream Deck", lines: ["Taste anklicken,", "unten eintragen"] },
		{ icon: "lan", title: "Steuern?", lines: ["LAN-Modus +", "Entwicklermodus"] },
	];
}

export type GuideState = { family?: GuideFamily; page: number };

export type GuideItem =
	/** Speech bubble: "Welcher Drucker?" */
	| { kind: "ask" }
	| { kind: "family"; family: GuideFamily }
	/** The chosen family; pressing it goes back to the choice. */
	| { kind: "header"; family: GuideFamily }
	| { kind: "step"; family: GuideFamily; index: number }
	/** A printer is entered but not connected yet. */
	| { kind: "status" }
	| { kind: "demo" }
	| { kind: "later" }
	| { kind: "prev" }
	| { kind: "next" }
	| { kind: "bao" }
	| { kind: "blank" };

/** What the guide wants to show, before it is cut into pages. */
export function guideItems(state: GuideState, connecting = false): { content: GuideItem[]; tail: GuideItem[] } {
	const status: GuideItem[] = connecting ? [{ kind: "status" }] : [];
	const tail: GuideItem[] = [{ kind: "demo" }, { kind: "later" }];
	if (!state.family) {
		return { content: [...status, { kind: "ask" }, ...FAMILIES.map((f): GuideItem => ({ kind: "family", family: f.id }))], tail };
	}
	const family = state.family;
	return { content: [{ kind: "header", family }, ...status, ...stepsFor(family).map((_, index): GuideItem => ({ kind: "step", family, index }))], tail };
}

/**
 * All pages, each exactly `columns × rows` items in reading order. "Weiter"
 * takes the last key of every page but the last, "Zurück" the first key of
 * every page but the first. Demo and "Später" sit in the last keys of the last page.
 */
export function guidePages(columns: number, rows: number, state: GuideState, connecting = false): GuideItem[][] {
	const slots = Math.max(3, columns * rows);
	const { content, tail } = guideItems(state, connecting);
	const all = [...content, ...tail];
	const pages: GuideItem[][] = [];
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
		const page: GuideItem[] = first ? [] : [{ kind: "prev" }];
		if (more) {
			page.push(...take, { kind: "next" });
		} else {
			const ending = take.filter((item) => tail.includes(item));
			const body = take.filter((item) => !tail.includes(item));
			const free = slots - page.length - body.length - ending.length;
			page.push(...body, ...Array.from({ length: free }, (_, n): GuideItem => ({ kind: n === 0 ? "bao" : "blank" })), ...ending);
		}
		pages.push(page);
	}
	return pages;
}

/** The item on one key, with the page clamped to what exists. */
export function guideAt(columns: number, rows: number, column: number, row: number, state: GuideState, connecting = false): GuideItem {
	const pages = guidePages(columns, rows, state, connecting);
	const page = pages[Math.min(Math.max(0, state.page), pages.length - 1)]!;
	return page[row * columns + column] ?? { kind: "blank" };
}

/** The state after pressing `item`; undefined when the press does not change the guide. */
export function guideNext(state: GuideState, item: GuideItem): GuideState | undefined {
	switch (item.kind) {
		case "family":
			return { family: item.family, page: 0 };
		case "header":
			return { page: 0 };
		case "next":
			return { ...state, page: state.page + 1 };
		case "prev":
			return { ...state, page: Math.max(0, state.page - 1) };
		default:
			return undefined;
	}
}
