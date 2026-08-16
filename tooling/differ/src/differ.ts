import fs from "node:fs";
import path from "node:path";
import {
	type Browser,
	type BrowserContext,
	chromium,
	type Page,
} from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import type { AppServer } from "./servers.ts";
import type {
	AriaResult,
	Census,
	CensusRow,
	HtmlResult,
	PixelResult,
	Report,
	ResourceResult,
	RowResult,
	RunConfig,
	Viewport,
} from "./types.ts";

const PIXELMATCH_THRESHOLD = 0.1;
const SETTLE_INTERVAL_MS = 250;
const SETTLE_MAX_ATTEMPTS = 5;
const HYDRATION_TIMEOUT_MS = 15_000;
/** Very long pages are captured only down to this height: decoded RGBA of a
 * full leaderboard page runs to hundreds of MB and gets the process killed. */
const MAX_CAPTURE_HEIGHT = 12_000;

/** Belt and suspenders on top of Playwright's `animations: "disabled"`: kills
 * transitions and smooth scrolling for everything that renders after the
 * screenshot call chain starts observing the page. */
const KILL_ANIMATIONS_CSS = `
*, *::before, *::after {
	animation: none !important;
	transition: none !important;
	scroll-behavior: auto !important;
	caret-color: transparent !important;
}
`;

export async function runDiff(
	config: RunConfig,
	census: Census,
	servers: AppServer[],
): Promise<Report> {
	const startedAt = new Date();
	const left = servers.find((server) => server.name === "left");
	const right = servers.find((server) => server.name === "right");
	if (!left || !right) throw new Error("Both servers must be running");

	const browser = await chromium.launch();
	const contexts = await createContexts(browser, config, census, [left, right]);

	let rows = census.rows.filter((row) => !row.skipped);
	const skippedRows = census.rows.filter((row) => row.skipped);
	if (config.filter) {
		rows = rows.filter((row) => row.pattern.includes(config.filter as string));
	}
	if (config.maxRows !== null) {
		rows = rows.slice(0, config.maxRows);
	}

	const results: RowResult[] = [];
	let nextIndex = 0;

	const worker = async () => {
		while (nextIndex < rows.length) {
			const row = rows[nextIndex++];
			let result: RowResult;
			try {
				result = await diffRow(config, contexts, left, right, row);
			} catch (error) {
				result = {
					pattern: row.pattern,
					url: row.url as string,
					kind: row.kind,
					pixel: [
						{
							theme: "-",
							viewport: "-",
							status: "fail",
							note: `capture crashed: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					html: null,
					aria: [],
					resource: null,
					notes: [],
				};
			}
			results.push(result);
			logRowResult(result);
		}
	};
	await Promise.all(Array.from({ length: config.concurrency }, () => worker()));

	await browser.close();

	results.sort((a, b) => a.pattern.localeCompare(b.pattern));

	return {
		startedAt: startedAt.toISOString(),
		durationMs: Date.now() - startedAt.getTime(),
		seedNow: new Date(config.seedNow).toISOString(),
		left: left.baseURL,
		right: right.baseURL,
		rows: results,
		skippedRows,
		summary: {
			pixelFailures: results
				.flatMap((row) => row.pixel)
				.filter((pixel) => pixel.status === "fail").length,
			htmlFailures: results.filter((row) => row.html?.status === "fail").length,
			resourceFailures: results.filter((row) => row.resource?.status === "fail")
				.length,
			ariaChanges: results
				.flatMap((row) => row.aria)
				.filter((aria) => aria.status === "changed").length,
			errorPages: results.filter((row) =>
				row.notes.some((note) => note.includes("error page")),
			).length,
		},
	};
}

type ContextKey = `${"left" | "right"}:${string}`;
type Contexts = Map<ContextKey, BrowserContext>;

/**
 * One context per side x theme, logged in as the seeded admin with the theme
 * cookie set. `Math.random` is reseeded per document so both sides draw the
 * same sequence, and requests leaving localhost are aborted for determinism
 * (fonts fall back identically, third-party avatars 404 identically).
 */
async function createContexts(
	browser: Browser,
	config: RunConfig,
	census: Census,
	servers: AppServer[],
): Promise<Contexts> {
	const contexts: Contexts = new Map();

	for (const server of servers) {
		for (const theme of config.themes) {
			const context = await browser.newContext({ baseURL: server.baseURL });

			// per context, not per page: concurrent pages installing the clock race
			// inside Playwright ("Cannot read properties of undefined")
			await context.clock.setFixedTime(config.seedNow);

			await context.route(
				(url) => url.hostname !== "localhost" && url.hostname !== "127.0.0.1",
				(route) => route.abort(),
			);

			await context.addInitScript(() => {
				let state = 42;
				Math.random = () => {
					state = (state * 1664525 + 1013904223) % 4294967296;
					return state / 4294967296;
				};
			});

			// the redirect target is app-specific (and may not exist on a
			// partially migrated right side), so only the impersonation
			// response itself is checked
			const impersonate = await context.request.post(
				`/auth/impersonate?id=${census.adminUserId}`,
				{ maxRedirects: 0 },
			);
			if (impersonate.status() >= 400) {
				throw new Error(
					`Impersonation on ${server.baseURL} failed with status ${impersonate.status()}`,
				);
			}

			const themeResponse = await context.request.post("/theme", {
				form: { theme },
			});
			if (!themeResponse.ok()) {
				throw new Error(
					`Setting theme on ${server.baseURL} failed with status ${themeResponse.status()}`,
				);
			}

			contexts.set(`${server.name}:${theme}`, context);
		}
	}

	return contexts;
}

async function diffRow(
	config: RunConfig,
	contexts: Contexts,
	left: AppServer,
	right: AppServer,
	row: CensusRow,
): Promise<RowResult> {
	const result: RowResult = {
		pattern: row.pattern,
		url: row.url as string,
		kind: row.kind,
		pixel: [],
		html: null,
		aria: [],
		resource: null,
		notes: [],
	};

	const leftContext = contexts.get(
		`left:${config.themes[0]}`,
	) as BrowserContext;
	const rightContext = contexts.get(
		`right:${config.themes[0]}`,
	) as BrowserContext;

	const [leftResponse, rightResponse] = await Promise.all([
		fetchRaw(leftContext, left.baseURL, result.url),
		fetchRaw(rightContext, right.baseURL, result.url),
	]);

	const isHtmlPage =
		leftResponse.status === 200 &&
		leftResponse.contentType.includes("text/html") &&
		rightResponse.status === 200 &&
		rightResponse.contentType.includes("text/html");

	if (!isHtmlPage) {
		result.resource = compareResources(
			config,
			row,
			[left.baseURL, right.baseURL],
			leftResponse,
			rightResponse,
		);
		return result;
	}

	result.html = compareHeads(
		config,
		row,
		[left.baseURL, right.baseURL],
		leftResponse.body,
		rightResponse.body,
	);

	for (const theme of config.themes) {
		for (const viewport of config.viewports) {
			const captureAria = theme === config.themes[0];
			const [leftCapture, rightCapture] = await Promise.all([
				capturePage(
					contexts.get(`left:${theme}`) as BrowserContext,
					result.url,
					viewport,
					captureAria,
				),
				capturePage(
					contexts.get(`right:${theme}`) as BrowserContext,
					result.url,
					viewport,
					captureAria,
				),
			]);

			for (const [side, capture] of [
				["left", leftCapture],
				["right", rightCapture],
			] as const) {
				for (const note of capture.notes) {
					const fullNote = `${side} ${theme}/${viewport.name}: ${note}`;
					if (!result.notes.includes(fullNote)) result.notes.push(fullNote);
				}
			}

			result.pixel.push(
				await comparePixels(
					config,
					row,
					theme,
					viewport,
					leftCapture,
					rightCapture,
				),
			);

			if (captureAria) {
				result.aria.push(
					compareAria(config, row, viewport, leftCapture, rightCapture),
				);
			}
		}
	}

	return result;
}

interface RawResponse {
	status: number;
	contentType: string;
	location: string | null;
	body: string;
}

async function fetchRaw(
	context: BrowserContext,
	baseURL: string,
	url: string,
): Promise<RawResponse> {
	const response = await context.request.get(`${baseURL}${url}`, {
		maxRedirects: 0,
	});
	return {
		status: response.status(),
		contentType: response.headers()["content-type"] ?? "",
		location: response.headers().location ?? null,
		body: await response.text().catch(() => ""),
	};
}

interface PageCapture {
	screenshot: Buffer;
	aria: string | null;
	notes: string[];
}

async function capturePage(
	context: BrowserContext,
	url: string,
	viewport: Viewport,
	captureAria: boolean,
): Promise<PageCapture> {
	const page = await context.newPage();
	const notes: string[] = [];

	try {
		await page.setViewportSize({
			width: viewport.width,
			height: viewport.height,
		});
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto(url, { waitUntil: "load", timeout: 30_000 });

		const hydrated = page.getByTestId("hydrated");
		await hydrated
			.waitFor({ state: "attached", timeout: HYDRATION_TIMEOUT_MS })
			.catch(() => {
				notes.push("page never reported hydration");
			});

		if ((await page.getByTestId("error-page").count()) > 0) {
			notes.push("rendered the error page (seed data gap?)");
		}

		await page.addStyleTag({ content: KILL_ANIMATIONS_CSS });
		await page.evaluate(() => document.fonts.ready);

		const screenshot = await settleScreenshot(page, notes);
		const aria = captureAria ? await page.locator("body").ariaSnapshot() : null;

		return { screenshot, aria, notes };
	} finally {
		await page.close();
	}
}

/** Screenshots until two consecutive shots are identical, so anything still
 * animating (canvas charts, image decode) has settled before comparison. */
async function settleScreenshot(page: Page, notes: string[]): Promise<Buffer> {
	let previous = await takeScreenshot(page);
	for (let attempt = 0; attempt < SETTLE_MAX_ATTEMPTS; attempt++) {
		await page.waitForTimeout(SETTLE_INTERVAL_MS);
		const current = await takeScreenshot(page);
		if (current.equals(previous)) return current;
		previous = current;
	}
	notes.push("screenshot never settled (still animating after retries)");
	return previous;
}

async function takeScreenshot(page: Page): Promise<Buffer> {
	const pageHeight = await page.evaluate(
		() => document.documentElement.scrollHeight,
	);
	if (pageHeight <= MAX_CAPTURE_HEIGHT) {
		return page.screenshot({
			fullPage: true,
			animations: "disabled",
			caret: "hide",
		});
	}

	const viewport = page.viewportSize();
	return page.screenshot({
		clip: {
			x: 0,
			y: 0,
			width: viewport?.width ?? 1440,
			height: MAX_CAPTURE_HEIGHT,
		},
		fullPage: true,
		animations: "disabled",
		caret: "hide",
	});
}

/** Serializes the decoded-pixel comparisons: decoded RGBA buffers are ~50MB+
 * each for tall pages, and letting every worker decode at once is what OOMs
 * the process. Identical buffers (the common case) never take the lock. */
let pixelCompareLock: Promise<void> = Promise.resolve();

async function comparePixels(
	config: RunConfig,
	row: CensusRow,
	theme: string,
	viewport: Viewport,
	leftCapture: PageCapture,
	rightCapture: PageCapture,
): Promise<PixelResult> {
	const base: PixelResult = { theme, viewport: viewport.name, status: "pass" };

	if (leftCapture.screenshot.equals(rightCapture.screenshot)) {
		return { ...base, diffPixels: 0 };
	}

	const previousLock = pixelCompareLock;
	let release = () => {};
	pixelCompareLock = new Promise((resolve) => {
		release = resolve;
	});
	await previousLock;

	try {
		const left = PNG.sync.read(leftCapture.screenshot);
		const right = PNG.sync.read(rightCapture.screenshot);

		const variant = `${theme}-${viewport.name}`;
		if (left.width !== right.width || left.height !== right.height) {
			const artifacts = writeArtifacts(config, row, variant, {
				"left.png": leftCapture.screenshot,
				"right.png": rightCapture.screenshot,
			});
			return {
				...base,
				status: "fail",
				note: `size mismatch: ${left.width}x${left.height} vs ${right.width}x${right.height}`,
				artifacts,
			};
		}

		const diff = new PNG({ width: left.width, height: left.height });
		const diffPixels = pixelmatch(
			left.data,
			right.data,
			diff.data,
			left.width,
			left.height,
			{ threshold: PIXELMATCH_THRESHOLD },
		);

		if (diffPixels === 0) return { ...base, diffPixels };

		const artifacts = writeArtifacts(config, row, variant, {
			"left.png": leftCapture.screenshot,
			"right.png": rightCapture.screenshot,
			"diff.png": PNG.sync.write(diff),
		});
		return { ...base, status: "fail", diffPixels, artifacts };
	} finally {
		release();
	}
}

function compareHeads(
	config: RunConfig,
	row: CensusRow,
	origins: string[],
	leftHtml: string,
	rightHtml: string,
): HtmlResult {
	const leftHead = normalizeHead(extractHead(leftHtml), origins);
	const rightHead = normalizeHead(extractHead(rightHtml), origins);

	if (leftHead === rightHead) return { status: "pass" };

	const artifacts = writeArtifacts(config, row, "head", {
		"left-head.html": Buffer.from(leftHead),
		"right-head.html": Buffer.from(rightHead),
	});
	return { status: "fail", note: "SSR <head> differs", artifacts };
}

function compareAria(
	config: RunConfig,
	row: CensusRow,
	viewport: Viewport,
	leftCapture: PageCapture,
	rightCapture: PageCapture,
): AriaResult {
	const base: AriaResult = { viewport: viewport.name, status: "same" };
	if (leftCapture.aria === null || rightCapture.aria === null) {
		return { ...base, status: "skipped", note: "no snapshot captured" };
	}
	if (leftCapture.aria === rightCapture.aria) return base;

	const artifacts = writeArtifacts(config, row, `aria-${viewport.name}`, {
		"left.aria.yml": Buffer.from(leftCapture.aria),
		"right.aria.yml": Buffer.from(rightCapture.aria),
	});
	return { ...base, status: "changed", artifacts };
}

function compareResources(
	config: RunConfig,
	row: CensusRow,
	origins: string[],
	left: RawResponse,
	right: RawResponse,
): ResourceResult {
	const problems: string[] = [];

	if (left.status !== right.status) {
		problems.push(`status ${left.status} vs ${right.status}`);
	}
	if (left.contentType !== right.contentType) {
		problems.push(
			`content-type "${left.contentType}" vs "${right.contentType}"`,
		);
	}
	if (
		normalizeOrigins(left.location ?? "", origins) !==
		normalizeOrigins(right.location ?? "", origins)
	) {
		problems.push(`location "${left.location}" vs "${right.location}"`);
	}

	const leftBody = normalizeOrigins(left.body, origins);
	const rightBody = normalizeOrigins(right.body, origins);
	if (leftBody !== rightBody) {
		problems.push("body differs");
	}

	if (problems.length === 0) {
		return {
			status: "pass",
			leftStatus: left.status,
			rightStatus: right.status,
		};
	}

	const artifacts = writeArtifacts(config, row, "resource", {
		"left.body.txt": Buffer.from(leftBody),
		"right.body.txt": Buffer.from(rightBody),
	});
	return {
		status: "fail",
		leftStatus: left.status,
		rightStatus: right.status,
		note: problems.join("; "),
		artifacts,
	};
}

function extractHead(html: string): string {
	const match = html.match(/<head[^>]*>([\s\S]*?)<\/head>/);
	return match?.[1] ?? "";
}

/** `<link rel>` values that carry SEO/PWA meaning and must survive the cutover. */
const MEANINGFUL_LINK_RELS = new Set([
	"canonical",
	"alternate",
	"manifest",
	"icon",
	"apple-touch-icon",
	"apple-touch-startup-image",
]);

/**
 * Reduces a `<head>` to the tags that must match across the two apps: the
 * title and every meta plus SEO/PWA-meaningful links. Framework output
 * (hashed stylesheets, module preloads, inline scripts) legitimately differs
 * between React Router and SvelteKit and is dropped. Tags are compared as a
 * sorted set since the frameworks emit them in different orders.
 */
function normalizeHead(head: string, origins: string[]): string {
	const withoutComments = normalizeOrigins(head, origins).replace(
		/<!--[\s\S]*?-->/g,
		"",
	);

	const tags: string[] = [];

	const titleMatch = withoutComments.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	if (titleMatch) {
		tags.push(`<title>${titleMatch[1].trim()}</title>`);
	}

	for (const match of withoutComments.matchAll(/<(meta|link)\b[^>]*>/gi)) {
		const tag = match[0]
			.replace(/\s+/g, " ")
			.replace(/\s*\/?>$/, ">")
			.trim();

		if (match[1].toLowerCase() === "link") {
			const rel = tag.match(/\brel="([^"]*)"/i)?.[1]?.toLowerCase();
			if (!rel || !MEANINGFUL_LINK_RELS.has(rel)) continue;
		}

		tags.push(tag);
	}

	return tags.sort().join("\n");
}

function normalizeOrigins(text: string, origins: string[]): string {
	let normalized = text;
	for (const origin of origins) {
		normalized = normalized.replaceAll(origin, "{{ORIGIN}}");
	}
	return normalized;
}

function writeArtifacts(
	config: RunConfig,
	row: CensusRow,
	variant: string,
	files: Record<string, Buffer>,
): string[] {
	const slug =
		row.pattern === "/"
			? "index"
			: row.pattern.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
	const dir = path.join(config.outDir, "artifacts", slug, variant);
	fs.mkdirSync(dir, { recursive: true });

	const written: string[] = [];
	for (const [name, contents] of Object.entries(files)) {
		const filePath = path.join(dir, name);
		fs.writeFileSync(filePath, contents);
		written.push(path.relative(config.outDir, filePath));
	}
	return written;
}

function logRowResult(result: RowResult) {
	const pixelFails = result.pixel.filter((p) => p.status === "fail").length;
	const failed =
		pixelFails > 0 ||
		result.html?.status === "fail" ||
		result.resource?.status === "fail";
	const ariaChanged = result.aria.some((a) => a.status === "changed");

	const marker = failed ? "✗" : "✓";
	const details = [
		pixelFails > 0 ? `${pixelFails} pixel` : null,
		result.html?.status === "fail" ? "head" : null,
		result.resource?.status === "fail"
			? `resource (${result.resource.note})`
			: null,
		ariaChanged ? "aria~" : null,
	]
		.filter(Boolean)
		.join(", ");

	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log(`${marker} ${result.url}${details ? ` [${details}]` : ""}`);
}
