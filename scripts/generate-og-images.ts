/** biome-ignore-all lint/suspicious/noConsole: CLI script output */

// screenshots the canvases of the /admin/og-images page into the assets repo,
// see docs/dev/how-to.md

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Locator } from "@playwright/test";
import sharp from "sharp";

try {
	process.loadEnvFile();
} catch {
	// .env is optional, the dev server port can also come from the environment
}

const OG_IMAGES_PAGE_URL = `http://localhost:${process.env.PORT ?? 5173}/admin/og-images`;

const DEFAULT_OUT_DIR = fileURLToPath(
	new URL("../../assets/assets/img/og", import.meta.url),
);

const WIDTH = 1200;
const HEIGHT = 630;

async function main() {
	const outDir = path.resolve(process.argv[2] ?? DEFAULT_OUT_DIR);
	await fs.mkdir(outDir, { recursive: true });

	const browser = await chromium.launch();
	const page = await browser.newPage({
		viewport: { width: WIDTH, height: HEIGHT },
		deviceScaleFactor: 1,
		colorScheme: "dark",
		reducedMotion: "reduce",
	});

	await page.goto(OG_IMAGES_PAGE_URL, { waitUntil: "networkidle" });
	// the page previews the canvases scaled down; the captured one is blown up to full size on top of everything
	await page.addStyleTag({
		content: `
			* { --og-scale: 1 !important }
			[data-og-capturing] {
				position: fixed !important;
				top: 0 !important;
				left: 0 !important;
				z-index: 2147483647 !important;
			}
		`,
	});
	await page.waitForFunction(() => document.fonts.status === "loaded");

	const canvases = await page.locator("[data-og-name]").all();
	if (canvases.length === 0) {
		throw new Error(`No OG canvases found at ${OG_IMAGES_PAGE_URL}`);
	}

	for (const canvas of canvases) {
		const name = await canvas.getAttribute("data-og-name");
		await canvas.evaluate((element) => {
			element.dataset.ogCapturing = "true";
		});
		await waitForImages(canvas);

		const screenshot = await page.screenshot({
			type: "png",
			clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
		});

		await canvas.evaluate((element) => {
			delete element.dataset.ogCapturing;
		});

		const filePath = path.join(outDir, `${name}.png`);

		await sharp(screenshot)
			.png({ compressionLevel: 9, effort: 10 })
			.toFile(filePath);

		const { size } = await fs.stat(filePath);
		console.log(`${name}.png (${Math.round(size / 1024)} kB)`);
	}

	await browser.close();
	console.log(`\n${canvases.length} images written to ${outDir}`);
}

async function waitForImages(canvas: Locator) {
	await canvas.evaluate(async (element) => {
		await Promise.all(
			Array.from(element.querySelectorAll("img")).map((image) =>
				image.decode().catch(() => null),
			),
		);
	});
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
