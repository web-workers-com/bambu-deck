/**
 * Which printer is this, and what can it do? Bambu printers do not say their
 * model in the status report, but the first digits of the serial number do.
 */

export type Family = "X1" | "X2" | "P1" | "P2" | "A1" | "A2" | "H2" | "H3" | "unknown";

export type Model = {
	id: string;
	name: string;
	family: Family;
	/** Has a chamber light that can be switched. */
	light: boolean;
	/** Has a chamber temperature sensor. */
	chamber: boolean;
	/** Two nozzles (H2D). */
	dualNozzle: boolean;
	/** Which AMS the deck should expect. */
	ams: "ams" | "lite" | "none";
};

const M = (id: string, name: string, family: Family, extra: Partial<Model> = {}): Model => ({
	id,
	name,
	family,
	light: true,
	chamber: false,
	dualNozzle: false,
	ams: "ams",
	...extra,
});

export const MODELS: Model[] = [
	M("X1C", "X1 Carbon", "X1", { chamber: true }),
	M("X1", "X1", "X1", { chamber: true }),
	M("X1E", "X1E", "X1", { chamber: true }),
	M("P1S", "P1S", "P1"),
	M("P1P", "P1P", "P1"),
	M("P2S", "P2S", "P2"),
	M("A1", "A1", "A1", { light: false, ams: "lite" }),
	M("A1M", "A1 mini", "A1", { light: false, ams: "lite" }),
	M("H2D", "H2D", "H2", { chamber: true, dualNozzle: true }),
	M("H2S", "H2S", "H2", { chamber: true }),
	// Newer models (2025/2026): features as announced, not checked on hardware.
	M("H2C", "H2C", "H2", { chamber: true, dualNozzle: true }),
	M("H2DP", "H2D Pro", "H2", { chamber: true, dualNozzle: true }),
	M("X2D", "X2D", "X2", { chamber: true, dualNozzle: true }),
	M("A2L", "A2L", "A2", { light: false, ams: "lite" }),
	M("H3C", "H3C", "H3", { chamber: true }),
];

/**
 * Serial prefixes as the community knows them. Prefixes marked "unsure" are
 * not confirmed on real hardware; unknown serials fall back to "automatisch"
 * guessing from the report, and the user can pick the model by hand.
 */
const PREFIX: [string, string][] = [
	["00M", "X1C"],
	["00W", "X1"],
	["03W", "X1E"],
	["01P", "P1S"],
	["01S", "P1P"],
	["039", "A1"],
	["030", "A1M"],
	["094", "H2D"], // unsure
	["093", "H2S"], // unsure
	["22E", "P2S"], // unsure
];

export const UNKNOWN: Model = M("?", "Bambu-Drucker", "unknown");

export function modelById(id: string | undefined): Model | undefined {
	return MODELS.find((m) => m.id === id);
}

/** The model for a serial, or for a model chosen by hand ("auto" = by serial). */
export function detectModel(serial: string, chosen?: string): Model {
	if (chosen && chosen !== "auto") {
		const m = modelById(chosen);
		if (m) {
			return m;
		}
	}
	const s = serial.trim().toUpperCase();
	const hit = PREFIX.find(([prefix]) => s.startsWith(prefix));
	return (hit && modelById(hit[1])) || UNKNOWN;
}
