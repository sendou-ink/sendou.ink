/** biome-ignore-all lint/suspicious/noConsole: CLI script output */

// renders the launch images described by a config JSON (see ../SKILL.md) with the templates of
// ./templates on top of the dev server's /admin/og-images page, so the site's fonts and theme apply
// usage: node build.mjs <config.json>

import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { TEMPLATES } from "./templates/index.mjs";
import { BASE_CSS } from "./templates/shared.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");
/** 1200 CSS px wide canvases come out 2000px wide, the largest Bluesky displays. */
const DEVICE_SCALE_FACTOR = 5 / 3;
/** Raw screenshots are captured at 2x, crops are given in their CSS px. */
const CAPTURE_SCALE = 2;
const BLUESKY_MAX_BYTES = 1_000_000;
const OG_COLORS = { pink: "#fd0075", cyan: "#01d4ff", green: "#21fe00" };

const configPath = process.argv[2];
if (!configPath) throw new Error("Usage: node build.mjs <config.json>");

const configDir = path.dirname(path.resolve(configPath));
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const devServer = config.devServer ?? `http://localhost:${devServerPort()}`;
const outDir = path.resolve(REPO_ROOT, config.out);
const colors = { ...pageColors(config.page), ...config.colors };
const images = config.images.map((image) => {
	const template = TEMPLATES[image.template];
	if (!template) {
		throw new Error(
			`Unknown template "${image.template}", available: ${Object.keys(TEMPLATES).join(", ")}`,
		);
	}

	return {
		...image,
		template,
		templateName: image.template,
		fileName: `${config.slug}-${image.name ?? image.template}.png`,
	};
});

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
	viewport: { width: 1200, height: 2000 },
	deviceScaleFactor: DEVICE_SCALE_FACTOR,
	colorScheme: "dark",
	reducedMotion: "reduce",
});

await page.goto(`${devServer}/admin/og-images`, { waitUntil: "networkidle" });
const iconSrc = await page.evaluate((navItem) => {
	const own = document.querySelector(`[data-og-name="${navItem}"] img`);
	if (own) return own.currentSrc;
	// pages without an OG image of their own: same folder, swap the name
	const any = document.querySelector("[data-og-name] img");
	return any.currentSrc.replace(/layout\/[^/.]+/, `layout/${navItem}`);
}, config.navItem ?? config.page);
const head = await page.evaluate(() =>
	[...document.querySelectorAll('link[rel="stylesheet"], style')]
		.map((el) => el.outerHTML)
		.join(""),
);
const htmlAttrs = await page.evaluate(() =>
	[...document.documentElement.attributes]
		.map((attr) => `${attr.name}="${attr.value}"`)
		.join(" "),
);

const ctx = { iconSrc, shotDataUri, shotCssWidth };
const css = [
	BASE_CSS,
	`.cv { --accent: ${OG_COLORS[colors.accent] ?? colors.accent}; --second: ${OG_COLORS[colors.second] ?? colors.second}; }`,
	...new Set(images.map((image) => image.template.css)),
].join("\n");
const canvases = images
	.map(
		(image) =>
			`<div class="cv ${image.templateName}" data-theme="dark" data-default-theme data-out="${image.fileName}">${image.template.html(image, ctx)}</div>`,
	)
	.join("");

await page.setContent(
	`<!doctype html><html ${htmlAttrs}><head><base href="${devServer}/">${head}<style>${css}</style></head><body>${canvases}</body></html>`,
	{ waitUntil: "networkidle" },
);
await page.waitForFunction(() => document.fonts.status === "loaded");
await page.evaluate(() =>
	Promise.all(
		[...document.images].map((img) => img.decode().catch(() => null)),
	),
);

for (const image of images) {
	const size = await page.evaluate((current) => {
		for (const el of document.querySelectorAll("[data-out]")) {
			el.style.display = el.dataset.out === current ? "" : "none";
		}
		window.scrollTo(0, 0);
		const el = document.querySelector(`[data-out="${current}"]`);
		return { width: el.offsetWidth, height: el.offsetHeight };
	}, image.fileName);

	const filePath = path.join(outDir, image.fileName);
	await page.screenshot({ path: filePath, clip: { x: 0, y: 0, ...size } });

	const bytes = fs.statSync(filePath).size;
	console.log(
		`${filePath} (${Math.round(size.width * DEVICE_SCALE_FACTOR)}x${Math.round(size.height * DEVICE_SCALE_FACTOR)}, ${Math.round(bytes / 1024)} kB)`,
	);
	if (bytes > BLUESKY_MAX_BYTES) {
		console.log("  WARNING: over Bluesky's 1 MB image limit, trim the content");
	}
}

await browser.close();

const altTextPath = path.join(outDir, "alt-texts.txt");
fs.writeFileSync(
	altTextPath,
	`${images.map((image) => `${image.fileName}\n${image.template.altText(image)}`).join("\n\n")}\n`,
	"utf8",
);
console.log(altTextPath);

function shotPath(shot) {
	return path.resolve(configDir, shot);
}

function shotDataUri(shot) {
	return `data:image/png;base64,${fs.readFileSync(shotPath(shot)).toString("base64")}`;
}

/** PNG width from its IHDR chunk, in the CSS px the crops are given in. */
function shotCssWidth(shot) {
	const header = Buffer.alloc(24);
	const fd = fs.openSync(shotPath(shot), "r");
	fs.readSync(fd, header, 0, 24, 0);
	fs.closeSync(fd);

	return header.readUInt32BE(16) / CAPTURE_SCALE;
}

/** Accent and second accent of the page's OG image, the colors of its nav icon. */
function pageColors(ogPage) {
	const source = fs.readFileSync(
		path.join(REPO_ROOT, "app/features/admin/routes/og-images.tsx"),
		"utf8",
	);
	const match = source.match(
		new RegExp(
			`["']?${ogPage}["']?: \\{ accent: "(\\w+)", second: "(\\w+)" \\}`,
		),
	);

	return match
		? { accent: match[1], second: match[2] }
		: { accent: "pink", second: "cyan" };
}

function devServerPort() {
	try {
		process.loadEnvFile(path.join(REPO_ROOT, ".env"));
	} catch {
		// .env is optional
	}

	return process.env.PORT ?? 5173;
}
