/** The full-deck alert keys and the test key. */
import streamDeck, {
	action,
	SingletonAction,
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	type KeyUpEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { testKey } from "../render/keys.js";
import { alertKey, pictureMarkup } from "../render/scene.js";
import { roleAt } from "../roles.js";
import { alertLeft, center, fleet, send } from "../runtime.js";
import { Ticker } from "./ticker.js";

const HOLD_MS = 2000;

/**
 * One key of the full-deck alert. Every key of the bundled alarm profiles is
 * this action; its place on the grid decides what it shows and does.
 */
@action({ UUID: "com.bambudeck.plugin.alert" })
export class AlertAction extends SingletonAction {
	#scenes = new Map<string, { at: number; markup: string }>();
	#holding: { id: string; since: number } | undefined;
	#ticker = new Ticker(100, (key: KeyAction<any>, t) => {
		const at = key.coordinates;
		if (!at) {
			return undefined;
		}
		const { columns, rows } = key.device.size;
		const alert = center.current;
		const hold = this.#holding ? Math.min(1, (t * 1000 - this.#holding.since) / HOLD_MS) : 0;
		if (hold >= 1 && this.#holding) {
			this.#holding = undefined;
			this.#answerStop();
		}
		// Animate at 5 fps; one picture per device and frame, shared by its keys.
		const frame = Math.floor(t * 5) / 5;
		const id = `${key.device.id}:${columns}x${rows}`;
		let scene = this.#scenes.get(id);
		if (!scene || scene.at !== frame) {
			scene = { at: frame, markup: pictureMarkup({ columns, rows, alert, t: frame }) };
			this.#scenes.set(id, scene);
		}
		return alertKey({ columns, rows, alert, t: frame, hold }, at.column, at.row, scene.markup);
	});

	constructor() {
		super();
		center.on("change", () => this.#ticker.invalidate());
	}

	override onWillAppear(ev: WillAppearEvent): void {
		if (ev.action.isKey()) {
			this.#ticker.add(ev.action);
		}
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.#ticker.remove(ev.action.id);
		alertLeft(ev.action.device.id);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const at = ev.action.coordinates;
		const { columns, rows } = ev.action.device.size;
		const alert = center.current;
		const role = at ? roleAt(columns, rows, at.column, at.row, alert?.kind) : "back";
		streamDeck.logger.info(`alert key ${role}`);
		const printer = alert ? fleet.get(alert.printerId) : undefined;

		switch (role) {
			case "done":
				center.resolve();
				return;
			case "snooze":
				center.snooze();
				return;
			case "resume":
				if (await send(printer, { kind: "resume" })) {
					center.resolve();
				}
				return;
			case "pause":
				await send(printer, { kind: "pause" });
				return;
			case "stop":
				this.#holding = { id: ev.action.id, since: Date.now() };
				return;
			default:
				center.back();
		}
	}

	override onKeyUp(ev: KeyUpEvent): void {
		if (this.#holding?.id === ev.action.id) {
			this.#holding = undefined;
			this.#ticker.invalidate();
		}
	}

	#answerStop(): void {
		const alert = center.current;
		const printer = alert ? fleet.get(alert.printerId) : undefined;
		void send(printer, { kind: "stop" }).then(() => center.resolve());
	}
}

type TestSettings = JsonObject & { level?: "done" | "error" };

/** Alarm testen: raises a sample alert right away. */
@action({ UUID: "com.bambudeck.plugin.test" })
export class TestAction extends SingletonAction<TestSettings> {
	override async onWillAppear(ev: WillAppearEvent<TestSettings>): Promise<void> {
		if (ev.action.isKey()) {
			await ev.action.setImage(testKey(ev.payload.settings.level === "error" ? "error" : "done"));
		}
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<TestSettings>): Promise<void> {
		if (ev.action.isKey()) {
			await ev.action.setImage(testKey(ev.payload.settings.level === "error" ? "error" : "done"));
		}
	}

	override onKeyDown(ev: KeyDownEvent<TestSettings>): void {
		const error = ev.payload.settings.level === "error";
		const printer = fleet.get(undefined);
		center.raise({
			printerId: printer?.config.id ?? "test",
			printer: printer?.config.name ?? "Testdrucker",
			level: error ? "error" : "done",
			kind: "test",
			title: error ? "Spaghetti!" : "Fertig!",
			detail: error ? "Test: so sieht ein Fehler aus" : "Test: so sieht ein fertiger Druck aus",
		});
	}
}
