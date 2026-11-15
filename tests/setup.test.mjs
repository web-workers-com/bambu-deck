import assert from "node:assert/strict";
import { test } from "node:test";

import { guideKey } from "../.build/render/guide.js";
import { KEY_GRID } from "../.build/roles.js";
import { FAMILIES, guideAt, guideItems, guideNext, guidePages, stepsFor } from "../.build/setup.js";

const decode = (uri) => Buffer.from(uri.split(",")[1], "base64").toString("utf8");
const states = [{ page: 0 }, ...FAMILIES.map((f) => ({ family: f.id, page: 0 }))];

test("every deck shows the whole guide: nothing lost, nothing twice, pages full", () => {
	for (const [type, [columns, rows]] of Object.entries(KEY_GRID)) {
		for (const state of states) {
			for (const connecting of [false, true]) {
				const pages = guidePages(columns, rows, state, connecting);
				const { content, tail } = guideItems(state, connecting);
				const shown = pages.flat().filter((i) => !["prev", "next", "bao", "blank"].includes(i.kind));
				assert.deepEqual(shown, [...content, ...tail], `type ${type}`);
				for (const [n, page] of pages.entries()) {
					assert.equal(page.length, columns * rows, `type ${type} page ${n}`);
					assert.equal(page[0].kind === "prev", n > 0);
					assert.equal(page.at(-1).kind === "next", n < pages.length - 1);
				}
				// Demo and "Später" end the last page.
				assert.deepEqual(pages.at(-1).slice(-2).map((i) => i.kind), ["demo", "later"]);
			}
		}
	}
});

test("a 5×3 deck fits the model choice and every model's steps on one page", () => {
	for (const state of states) {
		assert.equal(guidePages(5, 3, state).length, 1);
	}
	assert.equal(guideAt(5, 3, 0, 0, { page: 0 }).kind, "ask");
	assert.deepEqual(guideAt(5, 3, 1, 0, { page: 0 }), { kind: "family", family: "X1" });
});

test("pressing walks through the guide", () => {
	let s = { page: 0 };
	s = guideNext(s, guideAt(3, 2, 3 - 1, 1, s)); // Mini: last key is "Weiter"
	assert.equal(s.page, 1);
	s = guideNext(s, { kind: "family", family: "A1" });
	assert.deepEqual(s, { family: "A1", page: 0 });
	assert.equal(guideAt(5, 3, 0, 0, s).kind, "header");
	assert.deepEqual(guideNext(s, { kind: "header", family: "A1" }), { page: 0 });
	assert.equal(guideNext(s, { kind: "step", family: "A1", index: 0 }), undefined);
	// A page past the end shows the last one.
	assert.equal(guideAt(5, 3, 0, 0, { family: "X1", page: 9 }).kind, "header");
});

test("the steps name the right menu for each model", () => {
	assert.match(stepsFor("X1")[0].lines.join(" "), /Netzwerk/);
	assert.match(stepsFor("H2")[0].lines.join(" "), /Netzwerk/);
	assert.match(stepsFor("A1")[0].lines.join(" "), /WLAN/);
	assert.match(stepsFor("P1")[0].lines.join(" "), /WLAN/);
});

test("every guide key draws", () => {
	for (const state of states) {
		for (const item of guidePages(5, 3, state, true).flat()) {
			assert.match(decode(guideKey(item, 0.4, { name: "192.168.1.42", problem: "Zeitüberschreitung" })), /^<svg[\s\S]*<\/svg>$/);
		}
	}
});
