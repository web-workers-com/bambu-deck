/**
 * Extra controls: preheat, fans, job info, axes, filament and a G-code macro.
 * Whatever moves or heats the printer only works while it is not printing.
 */
import { action, type KeyAction } from "@elgato/streamdeck";

import { PRESETS, type Fan } from "../bambu/commands.js";
import type { Printer } from "../bambu/connection.js";
import { findTray, type Status } from "../bambu/report.js";
import { fanKey, filamentKey, gcodeKey, INFO_VIEWS, jobKey, moveKey, preheatKey, type InfoView, type MoveWhat } from "../render/control.js";
import { send } from "../runtime.js";
import { PrinterAction, type PrinterSettings } from "./base.js";

/** Not printing, and connected: safe to heat, move or swap filament. */
export const idle = (s: Status) => !["printing", "heating", "paused", "offline"].includes(s.stage);

type PreheatSettings = PrinterSettings & { preset?: string };

@action({ UUID: "com.bambudeck.plugin.preheat" })
export class PreheatAction extends PrinterAction<PreheatSettings> {
	constructor() {
		super(1);
	}

	protected paint(printer: Printer, s: PreheatSettings): string {
		const p = PRESETS[s.preset ?? "pla"] ?? PRESETS.pla!;
		return preheatKey(p.label, p.nozzle, p.bed, printer.status, idle(printer.status));
	}

	protected override async press(printer: Printer, s: PreheatSettings, key: KeyAction<PreheatSettings>): Promise<void> {
		const st = printer.status;
		if (!idle(st)) {
			await key.showAlert();
			return;
		}
		const p = PRESETS[s.preset ?? "pla"] ?? PRESETS.pla!;
		// Pressed again while this preset heats: switch off.
		const again = p.nozzle > 0 && st.nozzleTarget === p.nozzle && st.bedTarget === p.bed;
		const nozzle = again ? 0 : p.nozzle;
		const bed = again ? 0 : p.bed;
		await send(printer, { kind: "nozzle", target: nozzle }, key);
		await send(printer, { kind: "bed", target: bed });
	}
}

type FanSettings = PrinterSettings & { which?: Fan };

@action({ UUID: "com.bambudeck.plugin.fan" })
export class FanAction extends PrinterAction<FanSettings> {
	constructor() {
		super(6);
	}

	#percent(st: Status, which: Fan): number {
		return which === "aux" ? st.fanAux : which === "chamber" ? st.fanChamber : st.fan;
	}

	protected paint(printer: Printer, s: FanSettings, t: number): string {
		const which = s.which ?? "part";
		return fanKey(which, this.#percent(printer.status, which), t);
	}

	protected override async press(printer: Printer, s: FanSettings, key: KeyAction<FanSettings>): Promise<void> {
		const which = s.which ?? "part";
		if (printer.status.stage === "offline" || (printer.model.family === "A1" && which !== "part")) {
			await key.showAlert();
			return;
		}
		const now = this.#percent(printer.status, which);
		const next = now < 50 ? 50 : now < 100 ? 100 : 0;
		await send(printer, { kind: "fan", percent: next, which }, key);
	}
}

type InfoSettings = PrinterSettings & { view?: InfoView };

@action({ UUID: "com.bambudeck.plugin.info" })
export class InfoAction extends PrinterAction<InfoSettings> {
	#views = new Map<string, InfoView>();

	constructor() {
		super(1);
	}

	protected paint(printer: Printer, s: InfoSettings, _t: number, key: KeyAction<InfoSettings>): string {
		return jobKey(printer.status, this.#views.get(key.id) ?? s.view ?? "eta");
	}

	protected override press(_printer: Printer, s: InfoSettings, key: KeyAction<InfoSettings>): void {
		const now = this.#views.get(key.id) ?? s.view ?? "eta";
		this.#views.set(key.id, INFO_VIEWS[(INFO_VIEWS.indexOf(now) + 1) % INFO_VIEWS.length]!);
	}
}

type MoveSettings = PrinterSettings & { what?: MoveWhat };

@action({ UUID: "com.bambudeck.plugin.move" })
export class MoveAction extends PrinterAction<MoveSettings> {
	constructor() {
		super(1);
	}

	protected paint(printer: Printer, s: MoveSettings): string {
		return moveKey(s.what ?? "home", idle(printer.status));
	}

	protected override async press(printer: Printer, s: MoveSettings, key: KeyAction<MoveSettings>): Promise<void> {
		if (!idle(printer.status)) {
			await key.showAlert();
			return;
		}
		const what = s.what ?? "home";
		await send(printer, what === "home" ? { kind: "home" } : { kind: "moveZ", mm: what === "zup" ? 10 : -10 }, key);
	}
}

type FilamentSettings = PrinterSettings & { mode?: "load" | "unload"; slot?: string };

@action({ UUID: "com.bambudeck.plugin.filament" })
export class FilamentAction extends PrinterAction<FilamentSettings> {
	constructor() {
		super(1);
	}

	protected paint(printer: Printer, s: FilamentSettings): string {
		const mode = s.mode ?? "unload";
		const label = s.slot || "A1";
		return filamentKey(mode, findTray(printer.status, label), label, printer.status.stage, idle(printer.status));
	}

	protected override async press(printer: Printer, s: FilamentSettings, key: KeyAction<FilamentSettings>): Promise<void> {
		const st = printer.status;
		if (!idle(st)) {
			await key.showAlert();
			return;
		}
		if ((s.mode ?? "unload") === "unload") {
			const current = findTray(st, "active");
			await send(printer, { kind: "unload", temp: current?.temp ?? 220 }, key);
			return;
		}
		const tray = findTray(st, s.slot || "A1");
		if (!tray?.loaded) {
			await key.showAlert();
			return;
		}
		await send(printer, { kind: "load", slot: tray.slot, amsId: tray.amsId, trayIndex: tray.trayIndex, temp: tray.temp ?? 220 }, key);
	}
}

type GcodeSettings = PrinterSettings & { name?: string; gcode?: string; whilePrinting?: boolean };

@action({ UUID: "com.bambudeck.plugin.gcode" })
export class GcodeAction extends PrinterAction<GcodeSettings> {
	constructor() {
		super(1);
	}

	protected paint(printer: Printer, s: GcodeSettings): string {
		return gcodeKey(s.name ?? "", !!s.gcode?.trim() && (s.whilePrinting ? printer.status.stage !== "offline" : idle(printer.status)));
	}

	protected override async press(printer: Printer, s: GcodeSettings, key: KeyAction<GcodeSettings>): Promise<void> {
		const lines = s.gcode?.trim();
		const allowed = s.whilePrinting ? printer.status.stage !== "offline" : idle(printer.status);
		if (!lines || !allowed) {
			await key.showAlert();
			return;
		}
		await send(printer, { kind: "gcode", lines }, key);
	}
}
