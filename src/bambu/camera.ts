/**
 * The printer's camera as a stream of JPEG frames.
 *
 * - P1 and A1 send JPEGs themselves over TLS on port 6000, after an 80-byte login.
 * - X1, H2 and P2S stream H.264 over RTSPS on port 322 ("LAN-Liveview" on the
 *   printer). ffmpeg turns that into JPEGs; it is looked up on the computer.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import tls from "node:tls";

import type { PrinterConfig } from "./connection.js";
import type { Model } from "./models.js";

export type CameraEvents = { frame: [jpeg: Buffer]; problem: [message: string] };

export type CameraKind = "jpeg" | "rtsps";

/** P1 and A1 send JPEGs; everything else streams video. */
export function cameraKind(model: Model): CameraKind {
	return model.family === "P1" || model.family === "A1" ? "jpeg" : "rtsps";
}

/** The login packet for port 6000: sizes, then user and access code padded to 32 bytes. */
export function jpegLogin(accessCode: string): Buffer {
	const b = Buffer.alloc(80);
	b.writeUInt32LE(0x40, 0);
	b.writeUInt32LE(0x3000, 4);
	b.write("bblp", 16, 32, "ascii");
	b.write(accessCode, 48, 32, "ascii");
	return b;
}

/**
 * Collects port-6000 frames: a 16-byte header (payload size first, little
 * endian), then the JPEG. Returns whole frames and keeps the rest.
 */
export class JpegFrames {
	#buf: Buffer<ArrayBufferLike> = Buffer.alloc(0);

	push(chunk: Buffer): Buffer[] {
		this.#buf = this.#buf.length ? Buffer.concat([this.#buf, chunk]) : chunk;
		const out: Buffer[] = [];
		while (this.#buf.length >= 16) {
			const size = this.#buf.readUInt32LE(0);
			if (size <= 0 || size > 8_000_000) {
				// Out of step: drop everything and wait for the next header.
				this.#buf = Buffer.alloc(0);
				break;
			}
			if (this.#buf.length < 16 + size) {
				break;
			}
			const frame = this.#buf.subarray(16, 16 + size);
			this.#buf = this.#buf.subarray(16 + size);
			if (frame[0] === 0xff && frame[1] === 0xd8) {
				out.push(Buffer.from(frame));
			}
		}
		return out;
	}
}

/** Splits ffmpeg's MJPEG output into single JPEGs (start FFD8, end FFD9). */
export class MjpegSplitter {
	#buf: Buffer<ArrayBufferLike> = Buffer.alloc(0);

	push(chunk: Buffer): Buffer[] {
		this.#buf = this.#buf.length ? Buffer.concat([this.#buf, chunk]) : chunk;
		const out: Buffer[] = [];
		for (;;) {
			const start = this.#buf.indexOf(Buffer.from([0xff, 0xd8]));
			if (start < 0) {
				this.#buf = Buffer.alloc(0);
				break;
			}
			const end = this.#buf.indexOf(Buffer.from([0xff, 0xd9]), start + 2);
			if (end < 0) {
				this.#buf = this.#buf.subarray(start);
				break;
			}
			out.push(Buffer.from(this.#buf.subarray(start, end + 2)));
			this.#buf = this.#buf.subarray(end + 2);
		}
		return out;
	}
}

/** ffmpeg on PATH or in the usual install places (winget, Chocolatey, Scoop, Homebrew). */
export function findFfmpeg(): string | undefined {
	const exe = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
	const home = homedir();
	const places = [
		...(process.env.PATH ?? "").split(delimiter),
		join(home, "AppData", "Local", "Microsoft", "WinGet", "Links"),
		"C:\\ProgramData\\chocolatey\\bin",
		join(home, "scoop", "shims"),
		"C:\\ffmpeg\\bin",
		"/opt/homebrew/bin",
		"/usr/local/bin",
		"/usr/bin",
	];
	for (const dir of places) {
		if (dir && existsSync(join(dir, exe))) {
			return join(dir, exe);
		}
	}
	return undefined;
}

export type CameraOptions = {
	/** Frame width ffmpeg scales to (RTSPS only). */
	width: number;
	fps: number;
};

export class Camera extends EventEmitter<CameraEvents> {
	#socket: tls.TLSSocket | undefined;
	#ffmpeg: ChildProcess | undefined;
	#retry: NodeJS.Timeout | undefined;
	#running = false;
	#lastFrame = 0;
	latest: Buffer | undefined;
	/** Counts frames, so keys repaint only when a new one came. */
	frameNo = 0;
	problem = "";

	constructor(
		private readonly config: PrinterConfig,
		private readonly kind: CameraKind,
		private readonly options: CameraOptions = { width: 960, fps: 4 },
	) {
		super();
	}

	start(): void {
		if (this.#running) {
			return;
		}
		this.#running = true;
		this.#open();
	}

	stop(): void {
		this.#running = false;
		clearTimeout(this.#retry);
		this.#socket?.destroy();
		this.#socket = undefined;
		this.#ffmpeg?.kill();
		this.#ffmpeg = undefined;
	}

	#fail(message: string): void {
		this.problem = message;
		this.emit("problem", message);
		this.#socket?.destroy();
		this.#socket = undefined;
		this.#ffmpeg?.kill();
		this.#ffmpeg = undefined;
		if (this.#running) {
			clearTimeout(this.#retry);
			this.#retry = setTimeout(() => this.#open(), 5000);
			this.#retry.unref?.();
		}
	}

	#frame(jpeg: Buffer): void {
		// Keep to the frame rate the deck can take; the printer may send faster.
		const now = Date.now();
		if (now - this.#lastFrame < 1000 / this.options.fps) {
			return;
		}
		this.#lastFrame = now;
		this.problem = "";
		this.latest = jpeg;
		this.frameNo++;
		this.emit("frame", jpeg);
	}

	#open(): void {
		const { host, accessCode } = this.config;
		if (!host || !accessCode) {
			this.#fail("Drucker nicht eingerichtet");
			return;
		}
		if (this.kind === "jpeg") {
			this.#openJpeg(host, accessCode);
		} else {
			this.#openRtsps(host, accessCode);
		}
	}

	#openJpeg(host: string, accessCode: string): void {
		const frames = new JpegFrames();
		const socket = tls.connect({ host, port: 6000, rejectUnauthorized: false, timeout: 10_000 });
		this.#socket = socket;
		socket.on("secureConnect", () => socket.write(jpegLogin(accessCode)));
		socket.on("data", (chunk: Buffer) => frames.push(chunk).forEach((f) => this.#frame(f)));
		socket.on("timeout", () => this.#fail("Kamera antwortet nicht"));
		socket.on("error", (error: Error) => this.#fail(`Kamera: ${error.message}`));
		socket.on("close", () => this.#socket === socket && this.#fail("Kamera getrennt"));
	}

	#openRtsps(host: string, accessCode: string): void {
		const ffmpeg = findFfmpeg();
		if (!ffmpeg) {
			this.#fail("ffmpeg fehlt");
			return;
		}
		const url = `rtsps://bblp:${encodeURIComponent(accessCode)}@${host}:322/streaming/live/1`;
		const { width, fps } = this.options;
		const child = spawn(
			ffmpeg,
			["-hide_banner", "-loglevel", "error", "-rtsp_transport", "tcp", "-i", url, "-an", "-vf", `fps=${fps},scale=${width}:-2`, "-q:v", "6", "-f", "image2pipe", "-c:v", "mjpeg", "pipe:1"],
			{ windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
		);
		this.#ffmpeg = child;
		const split = new MjpegSplitter();
		let errors = "";
		child.stdout?.on("data", (chunk: Buffer) => split.push(chunk).forEach((f) => this.#frame(f)));
		child.stderr?.on("data", (chunk: Buffer) => (errors = (errors + chunk.toString("utf8")).slice(-400)));
		child.on("error", (error) => this.#fail(`ffmpeg: ${error.message}`));
		child.on("exit", () => {
			if (this.#ffmpeg !== child) {
				return;
			}
			const why = /401|Unauthorized/i.test(errors) ? "Zugangscode falsch" : /refused|timed out|Connection/i.test(errors) ? "LAN-Liveview aus?" : "Kamera getrennt";
			this.#fail(why);
		});
	}
}
