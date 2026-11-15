/**
 * Draws the sample camera frame for the website (website/src/camera-sample.jpg):
 * a print in the chamber, not a photo. Run once after changing the drawing:
 *   node scripts/camera-sample.mjs
 */
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const chamber = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
<defs>
<radialGradient id="l" cx="0.5" cy="0" r="1"><stop offset="0" stop-color="#5b5f66"/><stop offset="0.6" stop-color="#2a2d31"/><stop offset="1" stop-color="#141517"/></radialGradient>
<linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6d6650"/><stop offset="1" stop-color="#3d3a2e"/></linearGradient>
<linearGradient id="o" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4f8f2f"/><stop offset="0.5" stop-color="#8fcf5c"/><stop offset="1" stop-color="#3f7a25"/></linearGradient>
<linearGradient id="h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9e6df"/><stop offset="1" stop-color="#a9a59c"/></linearGradient>
</defs>
<rect width="1280" height="720" fill="url(#l)"/>
<path d="M180 720 L340 430 H940 L1100 720z" fill="url(#p)"/>
<path d="M340 430 H940" stroke="#8a8266" stroke-width="3"/>
<g opacity="0.18" stroke="#000">${Array.from({ length: 12 }, (_, i) => `<path d="M${360 + i * 50} 432 L${215 + i * 78} 720"/>`).join("")}</g>
<ellipse cx="640" cy="585" rx="150" ry="34" fill="#000" opacity="0.35"/>
<path d="M520 580 C520 470 560 420 560 360 L720 360 C720 420 760 470 760 580 C760 610 520 610 520 580z" fill="url(#o)"/>
<g stroke="#2f5f1e" stroke-width="2" opacity="0.35">${Array.from({ length: 22 }, (_, i) => `<path d="M${556 - (i > 11 ? (i - 11) * 3.6 : 0)} ${364 + i * 10} H${724 + (i > 11 ? (i - 11) * 3.6 : 0)}"/>`).join("")}</g>
<ellipse cx="640" cy="360" rx="80" ry="12" fill="#a8e07a"/>
<path d="M0 150 H1280" stroke="#1d1f22" stroke-width="26"/>
<rect x="560" y="120" width="190" height="170" rx="18" fill="url(#h)"/>
<rect x="580" y="150" width="70" height="44" rx="8" fill="#2b2e33"/>
<path d="M640 290 L652 330 L664 290z" fill="#c9a24a"/>
<circle cx="658" cy="336" r="5" fill="#ffb27a"/>
<ellipse cx="640" cy="40" rx="420" ry="40" fill="#fffbe8" opacity="0.12"/>
<text x="1240" y="60" text-anchor="end" font-family="Arial, sans-serif" font-size="26" fill="#c9cdd3" opacity="0.7">15.11. 14:32</text>
</svg>`;
await writeFile(join(root, "website", "src", "camera-sample.jpg"), await sharp(Buffer.from(chamber)).resize(864).jpeg({ quality: 72 }).toBuffer());
console.log("website/src/camera-sample.jpg written");
