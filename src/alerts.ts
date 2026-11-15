/**
 * Decides when Bao should call: watches every printer's stage changes and
 * keeps the current alert, a queue behind it, and snoozing.
 */
import { EventEmitter } from "node:events";

import type { Stage, Status } from "./bambu/report.js";

export type Level = "done" | "wait" | "error";

export type Alert = {
	id: string;
	printerId: string;
	printer: string;
	level: Level;
	title: string;
	detail: string;
	/** Kind of trouble, decides which answer keys show. */
	kind: "finished" | "failed" | "paused" | "hms" | "test";
	at: number;
	snoozedUntil?: number;
};

const RANK: Record<Level, number> = { error: 3, wait: 2, done: 1 };

/** Print errors that are not trouble: the user cancelled. */
const CANCELLED = new Set(["0300400C", "0500400E"]);

const ACTIVE: Stage[] = ["heating", "printing", "paused"];

export type Transition = { printerId: string; printer: string; before: Status | undefined; after: Status };

/**
 * What a stage change means, or nothing. Pure, for tests.
 * `stoppedByUser` is true when the deck itself sent "stop" a moment ago.
 */
export function alertFor(t: Transition, stoppedByUser = false): Omit<Alert, "id" | "at"> | undefined {
	const { before, after } = t;
	const was = before?.stage;
	const base = { printerId: t.printerId, printer: t.printer };
	const job = after.job || before?.job || "Druck";

	if (after.stage === "finished" && was && ACTIVE.includes(was)) {
		return { ...base, level: "done", kind: "finished", title: "Fertig!", detail: `${job} ist fertig` };
	}
	if (after.stage === "failed" && was && ACTIVE.includes(was)) {
		if (stoppedByUser || CANCELLED.has(after.error)) {
			return undefined;
		}
		return { ...base, level: "error", kind: "failed", title: "Abgebrochen", detail: after.error ? `Fehler ${after.error}` : `${job} ist fehlgeschlagen` };
	}
	if (after.stage === "paused" && was && was !== "paused" && after.error) {
		const runout = /8011$/.test(after.error);
		return {
			...base,
			level: runout ? "wait" : "error",
			kind: "paused",
			title: runout ? "Filament leer" : "Angehalten",
			detail: runout ? "Neue Spule einlegen, dann Fortsetzen" : `Fehler ${after.error}`,
		};
	}
	if (after.stage !== "idle" && after.stage !== "offline") {
		const known = new Set((before?.hms ?? []).map((h) => h.code));
		const fresh = after.hms.find((h) => !known.has(h.code) && (h.severity === "fatal" || h.severity === "serious"));
		if (fresh) {
			return { ...base, level: "error", kind: "hms", title: "Drucker meldet", detail: `HMS ${fresh.code}` };
		}
	}
	return undefined;
}

export type CenterEvents = { change: []; takeover: []; release: [] };

export class AlertCenter extends EventEmitter<CenterEvents> {
	#queue: Alert[] = [];
	#seen = new Map<string, Status>();
	#stopped = new Map<string, number>();
	#counter = 0;
	/** Is the alert profile showing right now? */
	takenOver = false;

	constructor(private readonly snoozeMs = 5 * 60_000) {
		super();
		const timer = setInterval(() => this.#wake(), 15_000);
		timer.unref?.();
	}

	/** The alert Bao shows now: the most serious one that is not snoozed. */
	get current(): Alert | undefined {
		const now = Date.now();
		const awake = this.#queue.filter((a) => !a.snoozedUntil || a.snoozedUntil <= now);
		const pool = awake.length ? awake : this.#queue;
		return [...pool].sort((a, b) => RANK[b.level] - RANK[a.level] || b.at - a.at)[0];
	}

	forPrinter(printerId: string): Alert | undefined {
		return this.#queue.find((a) => a.printerId === printerId);
	}

	/** The deck sent "stop": the coming FAILED is not a surprise. */
	noteStop(printerId: string): void {
		this.#stopped.set(printerId, Date.now());
	}

	/** Feed every status update here. */
	observe(printerId: string, printer: string, status: Status): void {
		const before = this.#seen.get(printerId);
		this.#seen.set(printerId, status);
		if (status.stage === "offline") {
			return;
		}
		// Back to work: whatever this printer called about is over.
		if (before && before.stage !== status.stage && (status.stage === "printing" || status.stage === "heating" || status.stage === "idle")) {
			const had = this.#queue.some((a) => a.printerId === printerId && a.kind !== "test");
			if (had && !(status.stage === "idle" && before.stage === "finished")) {
				this.#remove((a) => a.printerId === printerId && a.kind !== "test");
			}
		}
		const stoppedAt = this.#stopped.get(printerId) ?? 0;
		const alert = alertFor({ printerId, printer, before, after: status }, Date.now() - stoppedAt < 60_000);
		if (alert) {
			this.raise(alert);
		}
	}

	raise(a: Omit<Alert, "id" | "at">): Alert {
		// One alert per printer: the newer one replaces the older.
		this.#queue = this.#queue.filter((x) => x.printerId !== a.printerId);
		const alert: Alert = { ...a, id: `a${++this.#counter}`, at: Date.now() };
		this.#queue.push(alert);
		this.emit("change");
		this.takeover();
		return alert;
	}

	takeover(): void {
		if (!this.current || this.current.snoozedUntil) {
			return;
		}
		this.takenOver = true;
		this.emit("takeover");
	}

	/** Answered: the current alert is done. */
	resolve(id = this.current?.id): void {
		this.#remove((a) => a.id === id);
	}

	snooze(): void {
		const a = this.current;
		if (!a) {
			return;
		}
		a.snoozedUntil = Date.now() + this.snoozeMs;
		this.emit("change");
		this.#release();
	}

	/** Leave the alert profile without answering; Bao keeps pulsing. */
	back(): void {
		this.#release();
	}

	#remove(match: (a: Alert) => boolean): void {
		const before = this.#queue.length;
		this.#queue = this.#queue.filter((a) => !match(a));
		if (this.#queue.length === before) {
			return;
		}
		this.emit("change");
		if (!this.current || this.current.snoozedUntil) {
			this.#release();
		} else if (this.takenOver) {
			this.emit("takeover");
		}
	}

	#release(): void {
		if (this.takenOver) {
			this.takenOver = false;
			this.emit("release");
		}
	}

	#wake(): void {
		const now = Date.now();
		const due = this.#queue.find((a) => a.snoozedUntil && a.snoozedUntil <= now);
		if (due) {
			delete due.snoozedUntil;
			this.emit("change");
			this.takeover();
		}
	}
}
