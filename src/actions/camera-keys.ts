/** The camera key: shows which printer, a press puts the camera on the whole deck. */
import { action, type KeyAction } from "@elgato/streamdeck";

import type { Printer } from "../bambu/connection.js";
import { cameraKey } from "../render/camera.js";
import { openCamera } from "../runtime.js";
import { PrinterAction, type PrinterSettings } from "./base.js";

const isDemo = (printer: Printer) => printer.config.id.startsWith("demo-");

@action({ UUID: "com.bambudeck.plugin.camera" })
export class CameraAction extends PrinterAction {
	constructor() {
		super(1);
	}

	protected paint(printer: Printer): string {
		return cameraKey(printer.config.name, !isDemo(printer));
	}

	protected override async press(printer: Printer, _s: PrinterSettings, key: KeyAction<PrinterSettings>): Promise<void> {
		if (isDemo(printer) || !openCamera(key.device, printer)) {
			await key.showAlert();
		}
	}
}
