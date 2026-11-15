/**
 * What each key of the full-deck alert does, by its place on the grid.
 * The answer keys sit in the right-hand column(s), top to bottom; every other
 * key is part of the big picture of Bao, and pressing the picture leads back.
 */
import type { Alert } from "./alerts.js";

/** "info" is the speech bubble: printer and what happened. Pressing it leads back. */
export type Answer = "info" | "done" | "snooze" | "back" | "resume" | "pause" | "stop";
/** "blank": a spare key in the answer column; pressing it leads back too. */
export type Role = Answer | "picture" | "blank";

export function answersFor(kind: Alert["kind"] | undefined): Answer[] {
	switch (kind) {
		case "paused":
			return ["info", "resume", "stop", "snooze"];
		case "hms":
			return ["info", "pause", "stop", "done"];
		default:
			return ["info", "done", "snooze"];
	}
}

export function roleAt(columns: number, rows: number, column: number, row: number, kind: Alert["kind"] | undefined): Role {
	const answers = answersFor(kind);
	const answerColumns = Math.ceil(answers.length / rows);
	if (columns - answerColumns < 1) {
		// Too small for a picture: first key answers, the rest lead back.
		return column === 0 && row === 0 ? answers[0]! : "back";
	}
	const last = columns - 1;
	if (column <= last - answerColumns) {
		return "picture";
	}
	const index = (last - column) * rows + row;
	return answers[index] ?? (index === answers.length ? "back" : "blank");
}

/** Width of the picture in keys. */
export function pictureColumns(columns: number, rows: number, kind: Alert["kind"] | undefined): number {
	const answerColumns = Math.ceil(answersFor(kind).length / rows);
	return Math.max(0, columns - answerColumns);
}

/** Keys across and down per Stream Deck device type. */
export const KEY_GRID: Record<number, [number, number]> = {
	0: [5, 3],
	1: [3, 2],
	2: [8, 4],
	3: [5, 3],
	7: [4, 2],
	9: [4, 2],
	10: [16, 2],
	11: [8, 8],
	12: [3, 4],
	13: [9, 4],
};
