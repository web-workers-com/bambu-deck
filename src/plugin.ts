import streamDeck from "@elgato/streamdeck";

import { AlertAction, TestAction } from "./actions/alert-keys.js";
import { CameraAction } from "./actions/camera-keys.js";
import { ControlsAction, FanAction, FilamentAction, GcodeAction, InfoAction, MoveAction, PreheatAction } from "./actions/more-keys.js";
import { DialActionImpl, LightAction, PauseAction, SpeedAction, StopAction } from "./actions/control-keys.js";
import { BaoAction, HumidityAction, TempAction, TrayAction } from "./actions/printer-keys.js";
import { fleet, loadSettings } from "./runtime.js";

streamDeck.logger.setLevel("info");

process.on("unhandledRejection", (reason) => {
	streamDeck.logger.error(`unhandled rejection: ${reason instanceof Error ? reason.stack : String(reason)}`);
});
process.on("uncaughtException", (error) => {
	streamDeck.logger.error(`uncaught exception: ${error.stack ?? error.message}`);
});
process.on("exit", () => fleet.stopAll());

for (const a of [
	new BaoAction(),
	new TrayAction(),
	new HumidityAction(),
	new TempAction(),
	new PauseAction(),
	new StopAction(),
	new LightAction(),
	new SpeedAction(),
	new DialActionImpl(),
	new CameraAction(),
	new ControlsAction(),
	new PreheatAction(),
	new FanAction(),
	new InfoAction(),
	new MoveAction(),
	new FilamentAction(),
	new GcodeAction(),
	new AlertAction(),
	new TestAction(),
]) {
	streamDeck.actions.registerAction(a);
}

await streamDeck.connect();
await loadSettings();
