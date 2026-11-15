/**
 * Glue between printers, alerts and Stream Deck: the shared fleet and alert
 * center, the settings that feed them, and switching decks into the bundled
 * alert profile and back.
 */
import streamDeck, { type KeyAction } from "@elgato/streamdeck";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { AlertCenter } from "./alerts.js";
import type { Command } from "./bambu/commands.js";
import type { Printer } from "./bambu/connection.js";
import { Fleet, type GlobalSettings } from "./bambu/fleet.js";
import { openExternal, pluginDir } from "./system.js";

export const ALERT_ACTION = "com.bambudeck.plugin.alert";

/** Bundled alert profile per device type (names as in the manifest). */
export const ALERT_PROFILE: Record<number, string> = {
	0: "Bambu Deck Alarm",
	1: "Bambu Deck Mini Alarm",
	2: "Bambu Deck XL Alarm",
	3: "Bambu Deck Mobile Alarm",
	7: "Bambu Deck Plus Alarm",
	9: "Bambu Deck Neo Alarm",
	10: "Bambu Deck Studio Alarm",
	11: "Bambu Deck Virtual Alarm",
	12: "Bambu Deck Galleon Alarm",
	13: "Bambu Deck Plus XL Alarm",
};

export const fleet = new Fleet();
export const center = new AlertCenter();

fleet.on("log", (m) => streamDeck.logger.info(m));
fleet.on("status", (printer) => center.observe(printer.config.id, printer.config.name, printer.status));

/** Reads the global settings once and follows every change. */
export async function loadSettings(): Promise<void> {
	streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => fleet.configure(ev.settings));
	const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>().catch(() => ({}) as GlobalSettings);
	fleet.configure(settings);
}

/** Keys waiting for a command reply, so a refusal can flash on the right key. */
const waiting = new Map<string, KeyAction<any>>();

fleet.on("result", (printer, result) => {
	const key = waiting.get(`${printer.config.id}:${result.command}`);
	waiting.delete(`${printer.config.id}:${result.command}`);
	if (!result.ok) {
		streamDeck.logger.warn(
			`${printer.config.name}: ${result.command} abgelehnt${result.reason ? ` (${result.reason})` : ""}. ` +
				"Neuere Firmware erlaubt Steuern nur im LAN-Modus mit Entwicklermodus.",
		);
		key?.showAlert().catch(() => {});
	}
});

/** Sends a command and gives the key quick feedback. */
export async function send(printer: Printer | undefined, command: Command, key?: KeyAction<any>): Promise<boolean> {
	if (!printer) {
		await key?.showAlert();
		return false;
	}
	const ok = printer.send(command);
	if (!ok) {
		await key?.showAlert();
		return false;
	}
	if (command.kind === "stop") {
		center.noteStop(printer.config.id);
	}
	if (key) {
		// gcode commands are named "gcode_line" in the reply.
		const reply = ["nozzle", "bed", "fan"].includes(command.kind) ? "gcode_line" : command.kind === "light" ? "ledctrl" : command.kind === "speed" ? "print_speed" : command.kind;
		waiting.set(`${printer.config.id}:${reply}`, key);
	}
	return true;
}

// --- Alert profile switching -------------------------------------------------

const alerting = new Set<string>();

function showing(deviceId: string): boolean {
	return [...streamDeck.actions].some((unit) => unit.manifestId === ALERT_ACTION && unit.device.id === deviceId);
}

center.on("takeover", async () => {
	for (const device of streamDeck.devices) {
		const profile = ALERT_PROFILE[device.type as number];
		if (!profile || !device.isConnected || alerting.has(device.id)) {
			continue;
		}
		alerting.add(device.id);
		streamDeck.logger.info(`alert: ${device.name} → ${profile}`);
		await streamDeck.profiles.switchToProfile(device.id, profile).catch((error: Error) => {
			alerting.delete(device.id);
			streamDeck.logger.warn(`alert: could not switch ${device.name}: ${error.message}`);
		});
		// Stream Deck does not say whether the profile exists; check it arrived.
		setTimeout(() => {
			if (!showing(device.id) && alerting.delete(device.id)) {
				streamDeck.logger.warn(`alert: ${profile} did not appear on ${device.name}; offering to import it`);
				offerImport(profile);
			}
		}, 2500).unref?.();
	}
});

center.on("release", async () => {
	const devices = [...alerting];
	alerting.clear();
	for (const id of devices) {
		// Without a name Stream Deck returns to the profile shown before.
		await streamDeck.profiles.switchToProfile(id).catch((error: Error) => streamDeck.logger.warn(`alert: could not switch back: ${error.message}`));
	}
});

const offered = new Set<string>();

/** A linked (not installed) plugin's profiles are not imported; opening the file asks to. */
function offerImport(profile: string): void {
	const file = join(pluginDir(), `${profile}.streamDeckProfile`);
	if (offered.has(profile) || !existsSync(file)) {
		return;
	}
	offered.add(profile);
	openExternal(file);
}

/** A deck left the alert profile by hand; do not switch it "back" later. */
export function alertLeft(deviceId: string): void {
	setTimeout(() => {
		if (!showing(deviceId)) {
			alerting.delete(deviceId);
		}
	}, 250).unref?.();
}
