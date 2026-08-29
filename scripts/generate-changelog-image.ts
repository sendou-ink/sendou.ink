/** biome-ignore-all lint/suspicious/noConsole: CLI script output */

// screenshots the canvas of the /admin/changelog-image page into a shareable PNG,
// see docs/dev/how-to.md

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

try {
	process.loadEnvFile();
} catch {
	// .env is optional, the dev server port can also come from the environment
}

const CHANGELOG_IMAGE_PAGE_URL = `http://localhost:${process.env.PORT ?? 5173}/admin/changelog-image`;

const OUT_DIR = fileURLToPath(new URL("./output", import.meta.url));

/** Doubles the canvas' CSS pixels so the posted image stays sharp. */
const DEVICE_SCALE_FACTOR = 2;

async function main() {
	const since = process.argv[2];
	if (!since) {
		throw new Error(
			"Usage: pnpm run changelog:image <sha-of-previous-update-commit>",
		);
	}

	await fs.mkdir(OUT_DIR, { recursive: true });

	const browser = await chromium.launch();
	const page = await browser.newPage({
		deviceScaleFactor: DEVICE_SCALE_FACTOR,
		colorScheme: "dark",
		reducedMotion: "reduce",
	});

	await page.goto(`${CHANGELOG_IMAGE_PAGE_URL}?since=${since}`, {
		waitUntil: "networkidle",
	});
	await page.waitForFunction(() => document.fonts.status === "loaded");

	const canvas = page.locator("[data-changelog-canvas]");
	if ((await canvas.count()) === 0) {
		throw new Error(`No changelog canvas found at ${CHANGELOG_IMAGE_PAGE_URL}`);
	}

	const entryCount = Number(
		await page
			.locator("[data-changelog-entry-count]")
			.getAttribute("data-changelog-entry-count"),
	);
	if (entryCount === 0) {
		throw new Error(
			`No changelog entries were added between ${since} and HEAD. Note that only committed entries count.`,
		);
	}

	await canvas.evaluate(async (element) => {
		await Promise.all(
			Array.from(element.querySelectorAll("img")).map((image) =>
				image.decode().catch(() => null),
			),
		);
	});

	const screenshot = await canvas.screenshot({ type: "png" });

	const filePath = path.join(OUT_DIR, `update-${dateStamp()}.png`);
	await sharp(screenshot)
		.png({ compressionLevel: 9, effort: 10 })
		.toFile(filePath);

	await browser.close();

	const { size } = await fs.stat(filePath);
	console.log(`${filePath} (${Math.round(size / 1024)} kB)`);

	const copied = await copyToClipboard(filePath);
	console.log(
		copied ? "Copied to the clipboard" : "Could not copy to the clipboard",
	);
}

/** Puts the PNG itself (not its path) on the clipboard, ready to paste into a post. */
async function copyToClipboard(filePath: string) {
	if (process.platform !== "darwin") return false;

	try {
		await execFileAsync("osascript", [
			"-e",
			`set the clipboard to (read (POSIX file ${JSON.stringify(filePath)}) as «class PNGf»)`,
		]);
		return true;
	} catch {
		return false;
	}
}

function dateStamp() {
	return new Date().toISOString().slice(0, 10);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
