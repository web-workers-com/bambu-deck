/**
 * Base for every key that shows one printer: remembers each key's settings,
 * repaints on a timer (only when the image changed) and when anything new
 * arrives from the printers or the alert center.
 */
import {
	SingletonAction,
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import type { Printer } from "../bambu/connection.js";
import { setupKey } from "../render/keys.js";
import { center, fleet, keyAppeared, openGuide } from "../runtime.js";
import { Ticker } from "./ticker.js";

export type PrinterSettings = JsonObject & { printer?: string };

export abstract class PrinterAction<S extends PrinterSettings = PrinterSettings> extends SingletonAction<S> {
	protected settings = new Map<string, S>();
	protected ticker: Ticker<S>;

	constructor(fps = 4) {
		super();
		this.ticker = new Ticker(1000 / fps, (key: KeyAction<any>, t) => {
			const s = this.settings.get(key.id) ?? ({} as S);
			const printer = fleet.get(s.printer);
			return printer ? this.paint(printer, s, t, key) : setupKey();
		});
		fleet.on("change", () => this.ticker.invalidate());
		center.on("change", () => this.ticker.invalidate());
	}

	/** The key image for this printer and these settings. */
	protected abstract paint(printer: Printer, settings: S, t: number, key: KeyAction<S>): string | undefined;

	/** What a press does; nothing by default. */
	protected press(_printer: Printer, _settings: S, _key: KeyAction<S>): void | Promise<void> {}

	override onWillAppear(ev: WillAppearEvent<S>): void {
		this.settings.set(ev.action.id, ev.payload.settings);
		if (ev.action.isKey()) {
			this.ticker.add(ev.action);
		}
		keyAppeared(ev.action.device);
	}

	override onWillDisappear(ev: WillDisappearEvent<S>): void {
		this.settings.delete(ev.action.id);
		this.ticker.remove(ev.action.id);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<S>): void {
		this.settings.set(ev.action.id, ev.payload.settings);
		this.ticker.invalidate();
	}

	override async onKeyDown(ev: KeyDownEvent<S>): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}
		const printer = fleet.get(ev.payload.settings.printer);
		if (!printer) {
			// "Einrichten": the guide across the whole deck.
			if (!openGuide(ev.action.device)) {
				await ev.action.showAlert();
			}
			return;
		}
		await this.press(printer, ev.payload.settings, ev.action);
		this.ticker.invalidate();
	}
}
