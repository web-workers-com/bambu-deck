/** The few OS helpers the plugin needs. */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const isWindows = process.platform === "win32";
const isMac = process.platform === "darwin";

/** The .sdPlugin folder (bin/plugin.js lives one level below). */
export function pluginDir(): string {
	return join(dirname(fileURLToPath(import.meta.url)), "..");
}

/** Hands a link or file to the system. `url.dll` because `start` mangles `&`. */
export function openExternal(target: string): void {
	const [command, args] = isWindows ? ["rundll32.exe", ["url.dll,FileProtocolHandler", target]] : isMac ? ["open", [target]] : ["xdg-open", [target]];
	spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
}
