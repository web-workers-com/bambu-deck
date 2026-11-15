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

import { cameraDeckKey } from "../render/camera.js";
import { guideKey } from "../render/guide.js";
import { panelKey } from "../render/panel.js";
import { panelAt, panelCommands, panelItems } from "../panel.js";
import { testKey } from "../render/keys.js";
import { alertKey, pictureMarkup } from "../render/scene.js";
import { roleAt } from "../roles.js";
import {
	alertLeft,
	cameraEvents,
	cameraFor,
	center,
	closeCamera,
	closeGuide,
	closePanel,
	connecting,
	fleet,
	guideEvents,
	guideFor,
	panelEvents,
	panelFor,
	send,
	setGuide,
	setPanelPage,
	startDemo,
	touchPanel,
} from "../runtime.js";
import { guideAt, guideNext } from "../setup.js";
import { Ticker } from "./ticker.js";

const HOLD_MS = 2000;

/**
 * One key of the full-deck alert. Every key of the bundled alarm profiles is
 * this action; its place on the grid decides what it shows and does.
 * While no printer is set up (and no alert is up) the same keys show the setup guide.
 */
@action({ UUID: "com.bambudeck.plugin.alert" })
export class AlertAction extends SingletonAction {
	#scenes = new Map<string, { at: number; markup: string }>();
	#holding: { id: string; since: number; what: "alert" | "panel" } | undefined;
	#camera = new Map<string, { stamp: string; image: string }>();
	#ticker = new Ticker(100, (key: KeyAction<any>, t) => {
		const at = key.coordinates;
		if (!at) {
			return undefined;
		}
		const { columns, rows } = key.device.size;
		const alert = center.current;
		const view = alert ? undefined : cameraFor(key.device.id);
		if (view) {
			// A frame's images are built once per key; the ticker skips identical ones.
			const { camera, printer } = view;
			const stamp = `${camera.frameNo}:${camera.frameNo ? "" : `${camera.problem}:${Math.floor(t * 5)}`}`;
			const cached = this.#camera.get(key.id);
			if (cached?.stamp === stamp) {
				return cached.image;
			}
			const image = cameraDeckKey({ columns, rows, jpeg: camera.latest, printer: printer.config.name, problem: camera.problem, t }, at.column, at.row);
			this.#camera.set(key.id, { stamp, image });
			return image;
		}
		const panel = alert ? undefined : panelFor(key.device.id);
		if (panel) {
			const { printer, page } = panel;
			const item = panelAt(columns, rows, at.column, at.row, panelItems(printer.model, printer.status), page);
			const hold = this.#holding?.what === "panel" ? Math.min(1, (t * 1000 - this.#holding.since) / HOLD_MS) : 0;
			if (hold >= 1 && this.#holding) {
				this.#holding = undefined;
				void send(printer, { kind: "stop" });
			}
			return panelKey(item, printer.model, printer.status, Math.floor(t * 6) / 6, item.kind === "stop" ? hold : 0);
		}
		const guide = alert ? undefined : guideFor(key.device.id);
		if (guide) {
			const printer = connecting();
			const item = guideAt(columns, rows, at.column, at.row, guide, !!printer);
			return guideKey(item, Math.floor(t * 5) / 5, printer && { name: printer.config.host || printer.config.name, problem: printer.problem });
		}
		const hold = this.#holding?.what === "alert" ? Math.min(1, (t * 1000 - this.#holding.since) / HOLD_MS) : 0;
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
		guideEvents.on("change", () => this.#ticker.invalidate());
		panelEvents.on("change", () => this.#ticker.invalidate());
		cameraEvents.on("change", () => {
			this.#camera.clear();
			this.#ticker.invalidate();
		});
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
		if (!alert && cameraFor(ev.action.device.id)) {
			closeCamera(ev.action.device.id);
			return;
		}
		const panel = alert ? undefined : panelFor(ev.action.device.id);
		if (panel) {
			const deviceId = ev.action.device.id;
			const { printer, page } = panel;
			const item = at ? panelAt(columns, rows, at.column, at.row, panelItems(printer.model, printer.status), page) : ({ kind: "back" } as const);
			touchPanel(deviceId);
			switch (item.kind) {
				case "back":
					closePanel(deviceId);
					return;
				case "next":
				case "prev":
					setPanelPage(deviceId, page + (item.kind === "next" ? 1 : -1));
					return;
				case "stop":
					if (["printing", "heating", "paused"].includes(printer.status.stage)) {
						this.#holding = { id: ev.action.id, since: Date.now(), what: "panel" };
					}
					return;
				default:
					for (const [n, command] of panelCommands(item, printer.model, printer.status).entries()) {
						await send(printer, command, n === 0 && ev.action.isKey() ? ev.action : undefined);
					}
					return;
			}
		}
		const guide = alert ? undefined : guideFor(ev.action.device.id);
		if (guide) {
			const item = at ? guideAt(columns, rows, at.column, at.row, guide, !!connecting()) : { kind: "blank" as const };
			streamDeck.logger.info(`guide key ${item.kind}`);
			if (item.kind === "demo") {
				await startDemo();
			} else if (item.kind === "later") {
				closeGuide(ev.action.device.id);
			} else {
				const next = guideNext(guide, item);
				if (next) {
					setGuide(ev.action.device.id, next);
				}
			}
			return;
		}
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
				this.#holding = { id: ev.action.id, since: Date.now(), what: "alert" };
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
