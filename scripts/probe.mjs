/**
 * Connects to a real printer once, shows what Bambu Deck understands, and
 * saves the raw report (serial removed) as a test fixture.
 *
 *   npm run probe -- <ip> <serial> <access code> [seconds]
 *
 * Nothing is sent except "pushall" (asks for the full state).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCommand } from "../.build/bambu/commands.js";
import { detectModel } from "../.build/bambu/models.js";
import { mergeReport, toStatus } from "../.build/bambu/report.js";
import { MqttClient } from "../.build/mqtt/client.js";

const [host, serialArg, code, secondsArg] = process.argv.slice(2);
if (!host || !serialArg || !code) {
	console.error("Aufruf: npm run probe -- <IP> <Seriennummer> <Zugangscode> [Sekunden]");
	process.exit(1);
}
const serial = serialArg.toUpperCase();
const seconds = Number(secondsArg ?? 20);
const model = detectModel(serial);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let raw = {};
let messages = 0;
const client = new MqttClient({ host, port: 8883, username: "bblp", password: code, clientId: `bambu-deck-probe-${process.pid}` });

client.on("connect", () => {
	console.log(`verbunden mit ${host} (${model.name}), lausche ${seconds} s …`);
	client.subscribe(`device/${serial}/report`);
	client.publish(`device/${serial}/request`, JSON.stringify(buildCommand({ kind: "pushall" })));
});
client.on("message", (_topic, payload) => {
	try {
		raw = mergeReport(raw, JSON.parse(payload.toString("utf8")));
		messages++;
	} catch {
		// ignore non-JSON
	}
});
client.on("close", async (reason) => {
	if (messages === 0) {
		console.error(`keine Daten: ${reason}`);
		process.exit(2);
	}
	const s = toStatus(raw, { liteHint: model.ams === "lite" });
	console.log(`\n${messages} Nachrichten. Das versteht Bambu Deck:\n`);
	console.log(`  Zustand      ${s.stage} (${s.state || "–"})  ${s.percent}%  noch ${s.remaining} min  Schicht ${s.layer}/${s.layers}`);
	console.log(`  Druck        ${s.job || "–"}`);
	console.log(`  Temperatur   Düse ${s.nozzle}/${s.nozzleTarget}°  Bett ${s.bed}/${s.bedTarget}°  Kammer ${s.chamber ?? "–"}°`);
	console.log(`  Lüfter       ${s.fan}%   Tempo ${s.speed}   Licht ${s.light === undefined ? "–" : s.light ? "an" : "aus"}`);
	for (const u of s.ams) {
		console.log(`  AMS ${u.label.padEnd(4)}     ${u.kind}  Feuchte ${u.humidity !== undefined ? `${u.humidity}%` : `Stufe ${u.humidityLevel ?? "–"}`}  ${u.temperature ?? "–"}°  trocknet ${u.dryingLeft} min`);
		for (const t of u.trays) {
			console.log(`     ${t.label.padEnd(4)} ${t.loaded ? `${t.material.padEnd(6)} ${(t.name || "").padEnd(12)} ${t.color.padEnd(8)} ${t.remain ?? "?"}%${t.rfid ? "" : " (ohne RFID)"}${t.active ? "  ← aktiv" : ""}` : "leer"}`);
		}
	}
	if (s.external?.loaded) console.log(`  Extern       ${s.external.material} ${s.external.color}`);
	if (s.error) console.log(`  Fehler       ${s.error}`);
	for (const h of s.hms) console.log(`  HMS          ${h.code} (${h.severity})`);

	const anon = JSON.parse(JSON.stringify({ print: raw }).replaceAll(serial, "SERIAL"));
	const file = join(root, "tests", "fixtures", `${model.id.toLowerCase()}-live.json`);
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, `${JSON.stringify(anon, null, "\t")}\n`);
	console.log(`\nRohdaten (ohne Seriennummer): ${file}`);
	process.exit(0);
});

client.start();
setTimeout(() => client.end(), seconds * 1000).unref();
