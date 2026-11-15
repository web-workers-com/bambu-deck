/**
 * Renders the four "connect your printer" slides (English) into one image for
 * the GitHub README: github/assets/setup.png. Run after changing the slides:
 *   npm run prebuild-scripts && node scripts/setup-slides.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import { slidesFor } from "../website/slides.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const T = JSON.parse(await readFile(join(root, "website", "i18n", "en.json"), "utf8"));
const slides = slidesFor(T.connect.svg, T.connect.slides);
const W = 960, H = 600, G = 24;
const tiles = await Promise.all(
	slides.map(async (s, i) => ({ input: await sharp(Buffer.from(s.svg), { density: 192 }).resize(W, H).png().toBuffer(), left: G + (i % 2) * (W + G), top: G + Math.floor(i / 2) * (H + G) })),
);
const out = join(root, "github", "assets", "setup.png");
await writeFile(out, await sharp({ create: { width: G + 2 * (W + G), height: G + 2 * (H + G), channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(tiles).png({ compressionLevel: 9 }).toBuffer());
console.log(out);
