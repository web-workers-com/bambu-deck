/**
 * Glue between printers, alerts and Stream Deck: the shared fleet and alert
 * center, the settings that feed them, and switching decks into the bundled
 * alert profile and back.
 */
import streamDeck, { type KeyAction } from "@elgato/streamdeck";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { AlertCenter } from "./alerts.js";
import type { Command } from "./bambu/commands.js";
import type { Printer } from "./bambu/connection.js";
import { Fleet, type GlobalSettings } from "./bambu/fleet.js";
import type { GuideState } from "./setup.js";
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
	settingsLoaded = true;
	// Keys that appeared before the settings were known.
	for (const unit of streamDeck.actions) {
		if (unit.manifestId !== ALERT_ACTION) {
			autoGuide(unit.device);
		}
	}
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

type DeviceLike = { id: string; name: string; type: unknown; isConnected: boolean };

/**
 * Puts the device's full-deck profile up and remembers it in `set`, so it can
 * be switched back later. The alert and the setup guide share that profile.
 */
async function switchToFullDeck(device: DeviceLike, set: Set<string>, why: string): Promise<void> {
	const profile = ALERT_PROFILE[device.type as number];
	if (!profile || !device.isConnected) {
		return;
	}
	set.add(device.id);
	streamDeck.logger.info(`${why}: ${device.name} → ${profile}`);
	await streamDeck.profiles.switchToProfile(device.id, profile).catch((error: Error) => {
		set.delete(device.id);
		streamDeck.logger.warn(`${why}: could not switch ${device.name}: ${error.message}`);
	});
	// Stream Deck does not say whether the profile exists; check it arrived.
	setTimeout(() => {
		if (!showing(device.id) && set.delete(device.id)) {
			streamDeck.logger.warn(`${why}: ${profile} did not appear on ${device.name}; offering to import it`);
			offerImport(profile);
		}
	}, 2500).unref?.();
}

async function switchBack(set: Set<string>, ids: string[] = [...set]): Promise<void> {
	for (const id of ids) {
		if (!set.delete(id)) {
			continue;
		}
		// Without a name Stream Deck returns to the profile shown before.
		await streamDeck.profiles.switchToProfile(id).catch((error: Error) => streamDeck.logger.warn(`could not switch back: ${error.message}`));
	}
}

center.on("takeover", async () => {
	for (const device of streamDeck.devices) {
		if (alerting.has(device.id)) {
			continue;
		}
		if (guiding.delete(device.id)) {
			// Already on the full-deck profile: the alert takes over from the guide.
			alerting.add(device.id);
			continue;
		}
		await switchToFullDeck(device, alerting, "alert");
	}
});

center.on("release", () => switchBack(alerting));

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

/** A deck left the full-deck profile by hand; do not switch it "back" later. */
export function alertLeft(deviceId: string): void {
	setTimeout(() => {
		if (!showing(deviceId)) {
			alerting.delete(deviceId);
			guiding.delete(deviceId);
		}
	}, 250).unref?.();
}

// --- Setup guide ---------------------------------------------------------------

let settingsLoaded = false;
/** Devices the guide was switched onto, to switch back once a printer answers. */
const guiding = new Set<string>();
/** Devices the guide opened on by itself this session: only once each. */
const autoOpened = new Set<string>();
const guideStates = new Map<string, GuideState>();
export const guideEvents = new EventEmitter<{ change: [] }>();

/** A printer answers (or the demo runs): nothing left to set up. */
export function setupDone(): boolean {
	return fleet.list().some((p) => p.config.id.startsWith("demo-") || p.status.stage !== "offline");
}

/** The printer being tried while the guide shows, for its "Verbinde …" key. */
export function connecting(): Printer | undefined {
	return setupDone() ? undefined : fleet.list()[0];
}

/** What the guide shows on this device, or nothing when the deck should show alerts. */
export function guideFor(deviceId: string): GuideState | undefined {
	if (setupDone()) {
		return undefined;
	}
	return guideStates.get(deviceId) ?? { page: 0 };
}

export function setGuide(deviceId: string, state: GuideState): void {
	guideStates.set(deviceId, state);
	guideEvents.emit("change");
}

/** Shows the guide across the whole deck: on its own when no printer is entered, or when a "Einrichten" key is pressed. */
export function openGuide(device: DeviceLike, auto = false): boolean {
	if (!settingsLoaded || setupDone() || alerting.has(device.id)) {
		return false;
	}
	if (guiding.has(device.id) || showing(device.id)) {
		return true;
	}
	if (auto && (fleet.list().length > 0 || autoOpened.has(device.id))) {
		return false;
	}
	autoOpened.add(device.id);
	void switchToFullDeck(device, guiding, "setup");
	return true;
}

function autoGuide(device: DeviceLike): void {
	// A moment later, so the switch does not race Stream Deck loading the profile.
	setTimeout(() => openGuide(device, true), 600).unref?.();
}

/** A Bambu Deck key appeared; without printers the guide takes the deck. */
export function keyAppeared(device: DeviceLike): void {
	if (settingsLoaded) {
		autoGuide(device);
	}
}

/** "Später": back to the profile before; the guide does not come back by itself. */
export function closeGuide(deviceId: string): void {
	void switchBack(guiding, [deviceId]);
}

/** Demo key: switches the simulated printers on, which ends the guide. */
export async function startDemo(): Promise<void> {
	const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>().catch(() => ({}) as GlobalSettings);
	const next = { ...settings, demo: true };
	await streamDeck.settings.setGlobalSettings(next);
	fleet.configure(next);
}

let wasDone = false;
const followSetup = () => {
	const done = setupDone();
	if (done !== wasDone) {
		wasDone = done;
		if (done) {
			guideStates.clear();
			void switchBack(guiding);
		}
		guideEvents.emit("change");
	}
};
fleet.on("change", () => {
	followSetup();
	guideEvents.emit("change");
});
fleet.on("status", followSetup);
