/**
 * Renders the setup guide on a few deck sizes to .build/guide.png, with gaps
 * between keys as on a real deck. Usage: npm run preview:guide
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import { guideKey } from "../.build/render/guide.js";
import { guidePages } from "../.build/setup.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svgOf = (uri) => Buffer.from(uri.split(",")[1], "base64");
const K = 80;
const GAP = 8;

const decks = [
	{ columns: 5, rows: 3, state: { page: 0 } },
	{ columns: 5, rows: 3, state: { family: "X1", page: 0 } },
	{ columns: 5, rows: 3, state: { family: "A1", page: 0 }, connecting: true },
	{ columns: 3, rows: 2, state: { family: "P1", page: 0 } },
	{ columns: 3, rows: 2, state: { family: "P1", page: 1 } },
	{ columns: 4, rows: 2, state: { family: "H2", page: 0 } },
];

const tiles = [];
let top = GAP;
let width = 0;
for (const d of decks) {
	const page = guidePages(d.columns, d.rows, d.state, d.connecting)[d.state.page];
	page.forEach((item, i) => {
		const c = i % d.columns;
		const r = Math.floor(i / d.columns);
		tiles.push({ uri: guideKey(item, 0.4, { name: "192.168.1.42", problem: "Zugangscode falsch?" }), left: GAP + c * (K + GAP), top: top + r * (K + GAP) });
	});
	width = Math.max(width, GAP + d.columns * (K + GAP));
	top += d.rows * (K + GAP) + 24;
}
const composites = await Promise.all(tiles.map(async (t) => ({ input: await sharp(svgOf(t.uri), { density: 200 }).resize(K, K).png().toBuffer(), left: t.left, top: t.top })));
const out = join(root, ".build", "guide.png");
await mkdir(dirname(out), { recursive: true });
await writeFile(out, await sharp({ create: { width, height: top, channels: 4, background: "#F3F0E8" } }).composite(composites).png().toBuffer());
console.log(out);
