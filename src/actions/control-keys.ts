/** Keys that change something: pause, stop (held), light, speed, and the dials. */
import streamDeck, {
	action,
	SingletonAction,
	type DialAction,
	type DialRotateEvent,
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	type KeyUpEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";

import { LIMITS, SPEED_NAMES, type Command } from "../bambu/commands.js";
import type { Printer } from "../bambu/connection.js";
import { lightKey, pauseKey, speedKey, stopKey } from "../render/keys.js";
import { fleet, send } from "../runtime.js";
import { PrinterAction, type PrinterSettings } from "./base.js";

@action({ UUID: "com.bambudeck.plugin.pause" })
export class PauseAction extends PrinterAction {
	constructor() {
		super(2);
	}

	protected paint(printer: Printer): string {
		return pauseKey(printer.status.stage);
	}

	protected override async press(printer: Printer, _s: PrinterSettings, key: KeyAction<PrinterSettings>): Promise<void> {
		const stage = printer.status.stage;
		if (stage === "paused") {
			await send(printer, { kind: "resume" }, key);
		} else if (stage === "printing" || stage === "heating") {
			await send(printer, { kind: "pause" }, key);
		} else {
			await key.showAlert();
		}
	}
}

const HOLD_MS = 2000;

/** Stop: only after holding the key for two seconds, the edge fills up meanwhile. */
@action({ UUID: "com.bambudeck.plugin.stop" })
export class StopAction extends PrinterAction {
	#held = new Map<string, number>();

	constructor() {
		super(10);
	}

	protected paint(printer: Printer, _s: PrinterSettings, t: number, key: KeyAction<PrinterSettings>): string {
		const since = this.#held.get(key.id);
		const active = ["printing", "heating", "paused"].includes(printer.status.stage);
		if (since !== undefined && active) {
			const p = Math.min(1, (t * 1000 - since) / HOLD_MS);
			if (p >= 1) {
				this.#held.delete(key.id);
				void send(printer, { kind: "stop" }, key).then((ok) => { if (ok) void key.showOk(); });
			}
			return stopKey(p, true);
		}
		return stopKey(0, active);
	}

	override async onKeyDown(ev: KeyDownEvent<PrinterSettings>): Promise<void> {
		const printer = fleet.get(ev.payload.settings.printer);
		if (!printer || !["printing", "heating", "paused"].includes(printer.status.stage)) {
			await ev.action.showAlert();
			return;
		}
		this.#held.set(ev.action.id, Date.now());
		this.ticker.invalidate();
	}

	override onKeyUp(ev: KeyUpEvent<PrinterSettings>): void {
		this.#held.delete(ev.action.id);
		this.ticker.invalidate();
	}
}

@action({ UUID: "com.bambudeck.plugin.light" })
export class LightAction extends PrinterAction {
	constructor() {
		super(1);
	}

	protected paint(printer: Printer): string {
		return lightKey(printer.status.light, printer.model.light);
	}

	protected override async press(printer: Printer, _s: PrinterSettings, key: KeyAction<PrinterSettings>): Promise<void> {
		if (!printer.model.light) {
			await key.showAlert();
			return;
		}
		await send(printer, { kind: "light", on: !printer.status.light }, key);
	}
}

type SpeedSettings = PrinterSettings & { ludicrous?: boolean };

/** Speed: Leise → Standard → Sport (→ Ludicrous, if allowed) → Leise. */
@action({ UUID: "com.bambudeck.plugin.speed" })
export class SpeedAction extends PrinterAction<SpeedSettings> {
	constructor() {
		super(1);
	}

	protected paint(printer: Printer): string {
		return speedKey(printer.status.speed);
	}

	protected override async press(printer: Printer, s: SpeedSettings, key: KeyAction<SpeedSettings>): Promise<void> {
		const top = s.ludicrous ? 4 : 3;
		const next = printer.status.speed >= top ? 1 : printer.status.speed + 1;
		await send(printer, { kind: "speed", level: next }, key);
	}
}

// --- Stream Deck + dials -------------------------------------------------------

type DialWhat = "nozzle" | "bed" | "fan" | "speed";
type DialSettings = PrinterSettings & { what?: DialWhat };

const DIAL_LABEL: Record<DialWhat, string> = { nozzle: "Düse", bed: "Bett", fan: "Bauteillüfter", speed: "Tempo" };

/** A dial for nozzle, bed, fan or speed. Turning sets a new target, sent after a short pause. */
@action({ UUID: "com.bambudeck.plugin.dial" })
export class DialActionImpl extends SingletonAction<DialSettings> {
	#dials = new Map<string, { action: DialAction<DialSettings>; settings: DialSettings }>();
	#pending = new Map<string, { value: number; timer: NodeJS.Timeout }>();

	constructor() {
		super();
		fleet.on("status", () => this.#paintAll());
		fleet.on("change", () => this.#paintAll());
	}

	override onWillAppear(ev: WillAppearEvent<DialSettings>): void {
		if (ev.action.isDial()) {
			this.#dials.set(ev.action.id, { action: ev.action, settings: ev.payload.settings });
			void ev.action.setFeedbackLayout("$B1").then(() => this.#paint(ev.action.id));
		}
	}

	override onWillDisappear(ev: WillDisappearEvent<DialSettings>): void {
		this.#dials.delete(ev.action.id);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<DialSettings>): void {
		const d = this.#dials.get(ev.action.id);
		if (d) {
			d.settings = ev.payload.settings;
			this.#paint(ev.action.id);
		}
	}

	override onDialRotate(ev: DialRotateEvent<DialSettings>): void {
		const d = this.#dials.get(ev.action.id);
		const printer = fleet.get(ev.payload.settings.printer);
		if (!d || !printer) {
			return;
		}
		const what = ev.payload.settings.what ?? "nozzle";
		const pending = this.#pending.get(ev.action.id);
		const current = pending?.value ?? currentTarget(printer, what);
		const step = what === "speed" ? 1 : what === "fan" ? 10 : 5;
		const [lo, hi] = what === "speed" ? [1, 4] : what === "fan" ? [0, 100] : [0, what === "nozzle" ? LIMITS.nozzle : LIMITS.bed];
		const value = Math.max(lo, Math.min(hi, current + ev.payload.ticks * step));
		clearTimeout(pending?.timer);
		const timer = setTimeout(() => {
			this.#pending.delete(ev.action.id);
			const command: Command =
				what === "speed" ? { kind: "speed", level: value } : what === "fan" ? { kind: "fan", percent: value } : what === "bed" ? { kind: "bed", target: value } : { kind: "nozzle", target: value };
			void send(printer, command).then((ok) => { if (!ok) void d.action.showAlert(); });
			streamDeck.logger.info(`dial ${what} → ${value}`);
		}, 700);
		this.#pending.set(ev.action.id, { value, timer });
		this.#paint(ev.action.id);
	}

	#paintAll(): void {
		for (const id of this.#dials.keys()) {
			this.#paint(id);
		}
	}

	#paint(id: string): void {
		const d = this.#dials.get(id);
		if (!d) {
			return;
		}
		const what = d.settings.what ?? "nozzle";
		const printer = fleet.get(d.settings.printer);
		if (!printer) {
			void d.action.setFeedback({ title: DIAL_LABEL[what], value: "einrichten", indicator: { value: 0 } });
			return;
		}
		const s = printer.status;
		const pending = this.#pending.get(id)?.value;
		let value: string;
		let indicator: number;
		switch (what) {
			case "speed": {
				const level = pending ?? s.speed;
				value = SPEED_NAMES[level] ?? String(level);
				indicator = (level / 4) * 100;
				break;
			}
			case "fan":
				value = `${pending ?? s.fan}%`;
				indicator = pending ?? s.fan;
				break;
			default: {
				const now = what === "nozzle" ? s.nozzle : s.bed;
				const target = pending ?? (what === "nozzle" ? s.nozzleTarget : s.bedTarget);
				value = pending !== undefined ? `→ ${target}°` : target > 0 ? `${Math.round(now)}° → ${Math.round(target)}°` : `${Math.round(now)}°`;
				indicator = (now / (what === "nozzle" ? LIMITS.nozzle : LIMITS.bed)) * 100;
			}
		}
		void d.action.setFeedback({ title: `${DIAL_LABEL[what]} · ${printer.config.name}`, value, indicator: { value: Math.round(indicator) } }).catch(() => {});
	}
}

function currentTarget(printer: Printer, what: DialWhat): number {
	const s = printer.status;
	switch (what) {
		case "speed":
			return s.speed;
		case "fan":
			return s.fan;
		case "bed":
			return s.bedTarget || Math.round(s.bed);
		default:
			return s.nozzleTarget || Math.round(s.nozzle);
	}
}
