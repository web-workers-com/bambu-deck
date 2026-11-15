/** Keys that show one printer: Bao, AMS slots, humidity, temperatures. */
import { action, type KeyAction } from "@elgato/streamdeck";

import type { Printer } from "../bambu/connection.js";
import { findTray } from "../bambu/report.js";
import { humidityKey, printerKey, tempKey, trayKey, type TempWhat, type View } from "../render/keys.js";
import { center } from "../runtime.js";
import { PrinterAction, type PrinterSettings } from "./base.js";

type BaoSettings = PrinterSettings & { look?: "bao" | "compact" };

const VIEWS: View[] = ["percent", "time", "layer"];

/** Bao: the printer's state. Press: show the alert if there is one, else switch percent / time / layer. */
@action({ UUID: "com.bambudeck.plugin.printer" })
export class BaoAction extends PrinterAction<BaoSettings> {
	#views = new Map<string, View>();

	protected paint(printer: Printer, s: BaoSettings, t: number, key: KeyAction<BaoSettings>): string {
		return printerKey({
			status: printer.status,
			name: printer.config.name,
			alert: center.forPrinter(printer.config.id),
			problem: printer.problem,
			view: this.#views.get(key.id) ?? "percent",
			look: s.look === "compact" ? "compact" : "bao",
			t,
		});
	}

	protected override press(printer: Printer, _s: BaoSettings, key: KeyAction<BaoSettings>): void {
		const alert = center.forPrinter(printer.config.id);
		if (alert) {
			if (alert.snoozedUntil) {
				delete alert.snoozedUntil;
			}
			center.takeover();
			return;
		}
		const now = this.#views.get(key.id) ?? "percent";
		this.#views.set(key.id, VIEWS[(VIEWS.indexOf(now) + 1) % VIEWS.length]!);
	}
}

type TraySettings = PrinterSettings & { slot?: string };

/** One AMS slot (A1 … D4, HT1, Ext) or whichever slot is printing. */
@action({ UUID: "com.bambudeck.plugin.tray" })
export class TrayAction extends PrinterAction<TraySettings> {
	protected paint(printer: Printer, s: TraySettings, t: number): string {
		const slot = s.slot || "A1";
		return trayKey(findTray(printer.status, slot), printer.status.stage, t, slot === "active" ? "aktiv" : slot);
	}
}

type HumiditySettings = PrinterSettings & { unit?: string };

/** Humidity (or drying time) of one AMS unit. */
@action({ UUID: "com.bambudeck.plugin.humidity" })
export class HumidityAction extends PrinterAction<HumiditySettings> {
	protected paint(printer: Printer, s: HumiditySettings, t: number): string {
		const label = (s.unit || "A").toUpperCase();
		return humidityKey(printer.status.ams.find((u) => u.label === label), t, label);
	}
}

type TempSettings = PrinterSettings & { what?: TempWhat };

@action({ UUID: "com.bambudeck.plugin.temp" })
export class TempAction extends PrinterAction<TempSettings> {
	constructor() {
		super(1);
	}

	protected paint(printer: Printer, s: TempSettings): string {
		return tempKey(printer.status, s.what ?? "both");
	}
}
