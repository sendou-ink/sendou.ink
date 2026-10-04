import path from "node:path";
import type { Page } from "@playwright/test";
import { type FixtureFrame, fixtureFramePath } from "./fixture-game";

const FRAME_ROUTE_PREFIX = "/__e2e-capture/";

/** Labels the scanner picks on its own (a capture card) or ignores unless picked by hand (a webcam). */
const DEVICE_LABELS = {
	captureCard: "E2E Capture Card",
	webcam: "E2E HD Webcam",
} as const;

declare global {
	interface Window {
		__e2eCapture?: { show: (url: string | null) => Promise<void> };
	}
}

/**
 * Stands in for a capture card: the page's only video input is a canvas
 * stream showing whichever fixture frame the test puts on screen (black
 * otherwise), so the live capture runs its real pipeline on known frames.
 */
export class FakeCaptureCard {
	private readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	/** Installs the device for every later load of the page. */
	async install({
		kind = "captureCard",
	}: {
		kind?: keyof typeof DEVICE_LABELS;
	} = {}) {
		await this.page.route(`**${FRAME_ROUTE_PREFIX}*.png`, (route) => {
			const name = path.basename(
				new URL(route.request().url()).pathname,
				".png",
			) as FixtureFrame;
			return route.fulfill({ path: fixtureFramePath(name) });
		});
		await this.page.addInitScript(installFakeDevice, DEVICE_LABELS[kind]);
	}

	/** Puts a frame on the capture card's screen; null goes black. */
	async show(frame: FixtureFrame | null) {
		await this.page.evaluate(
			(url) => window.__e2eCapture!.show(url),
			frame === null ? null : `${FRAME_ROUTE_PREFIX}${frame}.png`,
		);
	}
}

/** Runs in the page: a 1080p canvas repainted at 10 fps behind fake media device APIs. */
function installFakeDevice(label: string) {
	const canvas = document.createElement("canvas");
	canvas.width = 1920;
	canvas.height = 1080;
	const ctx = canvas.getContext("2d")!;
	let current: HTMLImageElement | null = null;

	const paint = () => {
		if (current) {
			ctx.drawImage(current, 0, 0, canvas.width, canvas.height);
		} else {
			ctx.fillStyle = "#000";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
		}
	};
	paint();
	setInterval(paint, 100);

	window.__e2eCapture = {
		show: async (url) => {
			if (url === null) {
				current = null;
			} else {
				const image = new Image();
				image.src = url;
				await image.decode();
				current = image;
			}
			paint();
		},
	};

	const device = {
		deviceId: "e2e-video-input",
		groupId: "e2e",
		kind: "videoinput",
		label,
		toJSON() {
			return this;
		},
	} as MediaDeviceInfo;

	navigator.mediaDevices.enumerateDevices = async () => [device];
	navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(30);
}
