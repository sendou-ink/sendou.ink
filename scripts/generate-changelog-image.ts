/** biome-ignore-all lint/suspicious/noConsole: CLI script output */

// screenshots the canvas of the /admin/changelog-image page into a shareable PNG
// and writes the same update as text, both as Bluesky alt text and as a Discord
// post, see docs/dev/how-to.md

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium, type Page } from "@playwright/test";
import { format } from "date-fns";
import sharp from "sharp";
import {
	DISCORD_EMOJI_NAMES,
	DISCORD_FALLBACK_EMOJI_NAME,
} from "../app/features/changelog/changelog-constants.ts";

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

interface ChangelogEntry {
	navItems?: (keyof typeof DISCORD_EMOJI_NAMES)[];
	type: "feature" | "bug";
	headline: string;
	bullets?: string[];
}

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

	await assertSameCheckout(page);

	const entries = await parseEntries(page);
	if (entries.length === 0) {
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

	await browser.close();

	const date = new Date();
	const fileNameBase = `update-${format(date, "yyyy-MM-dd")}`;

	const imagePath = path.join(OUT_DIR, `${fileNameBase}.png`);
	await sharp(screenshot)
		.png({ compressionLevel: 9, effort: 10 })
		.toFile(imagePath);

	const { size } = await fs.stat(imagePath);
	console.log(`${imagePath} (${Math.round(size / 1024)} kB)`);
	console.log(
		(await copyToClipboard(imagePath))
			? "Image copied to the clipboard"
			: "Could not copy the image to the clipboard",
	);

	const versions = [
		{ label: "Alt text", suffix: "alt", text: altText(entries, date) },
		{ label: "Discord", suffix: "discord", text: discordText(entries, date) },
	];

	for (const version of versions) {
		const textPath = path.join(
			OUT_DIR,
			`${fileNameBase}-${version.suffix}.txt`,
		);
		await fs.writeFile(textPath, version.text, "utf8");

		console.log(`\n--- ${version.label} (${textPath}) ---\n`);
		console.log(version.text);
	}
}

/** The dev server holding the port can be another checkout whose entries are not the ones being shipped. */
async function assertSameCheckout(page: Page) {
	const marker = page.locator("[data-changelog-head]");
	const pageHead =
		(await marker.count()) > 0
			? await marker.getAttribute("data-changelog-head")
			: null;
	const localHead = (
		await execFileAsync("git", ["rev-parse", "HEAD"])
	).stdout.trim();

	if (pageHead !== localHead) {
		throw new Error(
			`The server at ${CHANGELOG_IMAGE_PAGE_URL} is a different checkout of the repo: its HEAD is ${pageHead ?? "unknown"}, this one is at ${localHead}. Start a dev server from this folder and run again.`,
		);
	}
}

async function parseEntries(page: Page): Promise<ChangelogEntry[]> {
	const json = await page
		.locator("[data-changelog-entries]")
		.getAttribute("data-changelog-entries");

	return json ? JSON.parse(json) : [];
}

/** Plain prose for the image's alt text, where markup and emoji only get in the way. */
function altText(entries: ChangelogEntry[], date: Date) {
	const { featured, oneLiners, fixes } = groupEntries(entries);

	const sections = [heading(date)];

	for (const entry of featured) {
		sections.push([entry.headline, ...bulletLines(entry)].join("\n"));
	}

	for (const entry of oneLiners) {
		sections.push(entry.headline);
	}

	if (fixes.length > 0) {
		sections.push(
			["Fixes", ...fixes.map((entry) => `- ${entry.headline}`)].join("\n"),
		);
	}

	return joinSections(sections);
}

/** The update as a Discord post, leading every entry with the server emoji of its nav items. */
function discordText(entries: ChangelogEntry[], date: Date) {
	const { featured, oneLiners, fixes } = groupEntries(entries);

	const sections = [`**${heading(date)}**`];

	for (const entry of featured) {
		sections.push(
			[`${emoji(entry)} **${entry.headline}**`, ...bulletLines(entry)].join(
				"\n",
			),
		);
	}

	if (oneLiners.length > 0) {
		sections.push(
			oneLiners.map((entry) => `${emoji(entry)} ${entry.headline}`).join("\n"),
		);
	}

	if (fixes.length > 0) {
		sections.push(
			[
				"**Fixes**",
				...fixes.map((entry) => `${emoji(entry)} ${entry.headline}`),
			].join("\n"),
		);
	}

	return joinSections(sections);
}

function groupEntries(entries: ChangelogEntry[]) {
	const features = entries.filter((entry) => entry.type === "feature");

	return {
		featured: features.filter((entry) => entry.bullets?.length),
		oneLiners: features.filter((entry) => !entry.bullets?.length),
		fixes: entries.filter((entry) => entry.type === "bug"),
	};
}

function heading(date: Date) {
	return `sendou.ink update - ${format(date, "MMMM do yyyy")}`;
}

function bulletLines(entry: ChangelogEntry) {
	return (entry.bullets ?? []).map((bullet) => `- ${bullet}`);
}

function emoji(entry: ChangelogEntry) {
	if (!entry.navItems) return `:${DISCORD_FALLBACK_EMOJI_NAME}:`;

	return entry.navItems
		.map((navItem) => `:${DISCORD_EMOJI_NAMES[navItem]}:`)
		.join("");
}

function joinSections(sections: string[]) {
	return `${sections.join("\n\n")}\n`;
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

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
