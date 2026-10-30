/** biome-ignore-all lint/suspicious/noConsole: CLI script output */

// screenshots one element of a dev server page at 2x as raw material for the launch images
// usage: node capture.mjs <url> <out.png> [--tab=<tab name>] [--selector=main] [--width=1100]

import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";

const { values: args, positionals } = parseArgs({
	options: {
		tab: { type: "string" },
		selector: { type: "string", default: "main" },
		width: { type: "string", default: "1100" },
	},
	allowPositionals: true,
});

const [url, out] = positionals;
if (!url || !out) {
	throw new Error(
		"Usage: node capture.mjs <url> <out.png> [--tab=<name>] [--selector=main] [--width=1100]",
	);
}

const browser = await chromium.launch();
const page = await browser.newPage({
	viewport: { width: Number(args.width), height: 1000 },
	deviceScaleFactor: 2,
	colorScheme: "dark",
	reducedMotion: "reduce",
});

await page.goto(url, { waitUntil: "networkidle" });
// minimizes the dev toolbar, then hides the handle it leaves behind
await page.keyboard.press("Alt+Shift+D");
await page.addStyleTag({
	content: `button[aria-label^="Show dev tools"] { display: none !important; }`,
});

if (args.tab) {
	await page.getByRole("tab", { name: args.tab }).click();
}
await page.waitForTimeout(1000);

await page.locator(args.selector).first().screenshot({ path: out });
await browser.close();

console.log(out);
