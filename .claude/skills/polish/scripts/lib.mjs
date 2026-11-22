// Shared by the polish scripts: where the server lives, browser sessions, waiting for a page to
// settle, annotated screenshots and before/after GIFs.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

export const ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../..",
);

try {
	process.loadEnvFile(path.join(ROOT, ".env"));
} catch {
	// .env is optional
}

export const POLISH_PORT = Number(process.env.PORT || 5173) + 900;
/** Where `server.mjs` listens. */
export const SERVER_URL = `http://localhost:${POLISH_PORT}`;
/** The site the scripts look at: the polish server, or with `POLISH_BASE_URL` any other (the docs site's component showcase). */
export const BASE_URL = (process.env.POLISH_BASE_URL ?? SERVER_URL).replace(
	/\/$/,
	"",
);
export const POLISH_DB = process.env.POLISH_DB ?? "db-polish.sqlite3";
export const OUTPUT_DIR = path.join(ROOT, "scripts", "output", "polish");
export const SKILL_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
export const ADMIN_ID = 274;
/** A user of the dev seed without roles (`REGULAR_USER_TEST_ID` of app/db/seed/constants.ts). */
export const REGULAR_USER_ID = 2;

export const VIEWPORTS = {
	mobile: {
		viewport: { width: 375, height: 812 },
		deviceScaleFactor: 2,
		isMobile: true,
		hasTouch: true,
	},
	tablet: {
		viewport: { width: 768, height: 1024 },
		deviceScaleFactor: 2,
		hasTouch: true,
	},
	desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
	wide: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
};

/** Widths of the width sweep: what sits between and beyond the fixed viewports, where layouts switch. */
export const SWEEP_WIDTHS = [
	320, 360, 414, 480, 600, 700, 768, 900, 1024, 1200, 1366, 1600, 1920,
];

/** Whether a viewport of `VIEWPORTS` is a touch screen: no hover there, fingers instead of a pointer. */
export function isTouchViewport(name) {
	return Boolean(VIEWPORTS[name]?.hasTouch);
}

/** Findings of a narrow and of a wide layout are kept apart: they are different layouts of one component. */
export function viewportClassOf(width) {
	return width < 700 ? "mobile" : "desktop";
}

let isPlain = false;
let hydrationTimeout = 12_000;

/** How long `settle` waits for the page to hydrate before giving up on it. */
export function setHydrationTimeout(ms) {
	hydrationTimeout = ms;
}

/** For pages that are not the app (the docs site): nobody to log in as, no hydration marker to wait for. */
export function setPlain(plain) {
	isPlain = plain;
}

const PROBES_PATH = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"probes.mjs",
);

const YOUTUBE_STUB =
	"window.YT = { Player: class { getCurrentTime() { return 0; } destroy() {} } };";

/** Flags as argv (`--key=value`, bare `--key` is `true`, repeated keys collect into an array) plus the positionals. */
export function parseArgs(argv = process.argv.slice(2)) {
	const flags = {};
	const positionals = [];
	for (const arg of argv) {
		if (!arg.startsWith("--")) {
			positionals.push(arg);
			continue;
		}
		const [key, ...rest] = arg.slice(2).split("=");
		const value = rest.length > 0 ? rest.join("=") : true;
		if (key in flags) {
			flags[key] = [flags[key], value].flat();
		} else {
			flags[key] = value;
		}
	}
	return { flags, positionals };
}

export async function assertServerUp() {
	try {
		const response = await fetch(BASE_URL);
		if (response.ok) return;
	} catch {
		// reported below
	}
	throw new Error(
		`No polish server at ${BASE_URL}. Start it: node .claude/skills/polish/scripts/server.mjs`,
	);
}

/** Classic (space taking) scrollbars on purpose: most visitors are on Windows, where a page growing a scrollbar moves everything. */
export function launchBrowser() {
	return chromium.launch({
		ignoreDefaultArgs: ["--hide-scrollbars"],
		args: [
			"--host-resolver-rules=MAP youtube.com ~NOTFOUND, MAP *.youtube.com ~NOTFOUND",
			"--disable-features=OverlayScrollbar",
		],
	});
}

/**
 * A browser context showing the site as `viewer` (a user id, or nothing for logged out) at one of
 * `VIEWPORTS` (or a `{ viewport }` of its own) in the given color scheme, with the probes installed.
 */
export async function openSession(
	browser,
	{
		viewer,
		viewport = "desktop",
		theme = "dark",
		videoDir,
		readOnly = false,
		lang,
	} = {},
) {
	const device =
		typeof viewport === "string" ? VIEWPORTS[viewport] : { viewport };
	if (!device) throw new Error(`Unknown viewport "${viewport}"`);

	const context = await browser.newContext({
		baseURL: BASE_URL,
		...device,
		colorScheme: theme,
		serviceWorkers: "block",
		// a "paste" button clicked by the sweep is not to fail for want of a permission
		permissions: ["clipboard-read", "clipboard-write"],
		locale: "en-US",
		timezoneId: "Europe/Helsinki",
		...(videoDir
			? { recordVideo: { dir: videoDir, size: device.viewport } }
			: {}),
	});
	await context.addInitScript(YOUTUBE_STUB);
	await context.addInitScript({ path: PROBES_PATH });

	if (viewer && !isPlain) {
		const response = await context.request.post(
			`/auth/impersonate?id=${viewer}`,
			{ maxRedirects: 0 },
		);
		if (response.status() >= 400) {
			throw new Error(
				`Logging in as ${viewer} failed with ${response.status()}`,
			);
		}
	}
	// the site keeps the language of a `?lng=` visit in a cookie
	if (lang && !isPlain) await context.request.get(`/?lng=${lang}`);

	if (readOnly) await blockWrites(context);

	return context;
}

const blockedWrites = new WeakMap();
/** Requests that are not GETs and change nothing anyone would see: the page telling its event stream what to listen to. */
const NOT_A_WRITE = [/\/sse\/[^/]+\/topics$/];

/**
 * Lets nothing but reads out of the pages of the context, so any button can be clicked: a request that
 * would write is cut off and counted. The price is the HTTP cache (a routed context has none), so the
 * load pass never uses this.
 */
async function blockWrites(context) {
	const blocked = [];
	blockedWrites.set(context, blocked);
	await context.route("**/*", (route) => {
		const request = route.request();
		if (
			["GET", "HEAD", "OPTIONS"].includes(request.method()) ||
			NOT_A_WRITE.some((pattern) => pattern.test(request.url()))
		) {
			return route.continue();
		}
		blocked.push({ method: request.method(), url: request.url() });
		return route.abort("blockedbyclient");
	});
}

export function isReadOnly(context) {
	return blockedWrites.has(context);
}

/** The writes a read-only session cut off so far. */
export function writesBlocked(context) {
	return blockedWrites.get(context) ?? [];
}

/** Puts a session back to how it was logged in: a click may have switched the theme, the language or a remembered setting. */
export async function resetSession(context, state) {
	await context.clearCookies();
	await context.addCookies(state.cookies);
}

/** Navigates and waits until the page has hydrated and stopped moving. Resolves to the response status. */
export async function visit(page, url) {
	return (await visitInfo(page, url)).status;
}

/**
 * `visit` with what else happened: whether the page hydrated at all, and whether the browser ended up
 * somewhere else than the server sent it (a redirect done on the client, after the first page was shown).
 */
export async function visitInfo(page, url) {
	const response = await page.goto(url, { waitUntil: "domcontentloaded" });
	const served = response ? new URL(response.url()).pathname : null;
	const hydrated = await settle(page);
	const shown = new URL(page.url()).pathname;
	return {
		status: response?.status() ?? 0,
		hydrated,
		clientRedirect: served && served !== shown ? shown : null,
	};
}

/** Hydrated, router idle, fonts in, images of the first screen decoded, two frames painted. Resolves to whether the page hydrated. */
export async function settle(page, { quiet = 150 } = {}) {
	const hydrated = isPlain
		? true
		: await page
				.locator('[data-testid="hydrated"][data-router-idle="true"]')
				.waitFor({ state: "attached", timeout: hydrationTimeout })
				.then(
					() => true,
					() => false,
				);
	await page
		.evaluate(async (quietMs) => {
			await Promise.race([
				document.fonts.ready,
				new Promise((resolve) => setTimeout(resolve, 2000)),
			]);
			// an image inside something closed (a popover, a menu) is lazy and never loads: not one to wait for
			const pending = [...document.images].filter(
				(img) =>
					!img.complete &&
					img.checkVisibility() &&
					img.getBoundingClientRect().top < innerHeight * 2,
			);
			await Promise.race([
				Promise.all(
					pending.map(
						(img) =>
							new Promise((resolve) => {
								img.addEventListener("load", resolve, { once: true });
								img.addEventListener("error", resolve, { once: true });
							}),
					),
				),
				new Promise((resolve) => setTimeout(resolve, 3000)),
			]);
			await new Promise((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(resolve)),
			);
			await new Promise((resolve) => setTimeout(resolve, quietMs));
		}, quiet)
		.catch(() => {});
	return hydrated;
}

/** A screenshot of a part of the viewport as base64, for the pixel checks done in the page (`diffImages`, `inkGaps`). */
export async function shotBase64(page, clip) {
	const viewport = page.viewportSize();
	const x = Math.max(0, Math.floor(clip.x));
	const y = Math.max(0, Math.floor(clip.y));
	const width = Math.min(viewport.width, Math.ceil(clip.x + clip.width)) - x;
	const height = Math.min(viewport.height, Math.ceil(clip.y + clip.height)) - y;
	if (width < 2 || height < 2) return null;
	const buffer = await page
		.screenshot({ clip: { x, y, width, height }, animations: "disabled" })
		.catch(() => null);
	return buffer ? buffer.toString("base64") : null;
}

/**
 * Screenshot of the viewport with boxes drawn on it. `marks` are `{ rect: {x,y,width,height} in
 * viewport coordinates, color?, dashed?, label? }`. With `crop` the picture is cut to the marks
 * plus `pad` pixels of surroundings.
 */
export async function shootMarked(
	page,
	outPath,
	{ marks = [], badge, crop = true, pad = 90 } = {},
) {
	fs.mkdirSync(path.dirname(outPath), { recursive: true });
	await page.evaluate(
		(overlay) => window.__polish.drawMarks(overlay.marks, overlay.badge),
		{ marks, badge },
	);

	const viewport = page.viewportSize();
	let clip;
	if (crop && marks.length > 0) {
		const left = Math.max(0, Math.min(...marks.map((m) => m.rect.x)) - pad);
		const top = Math.max(0, Math.min(...marks.map((m) => m.rect.y)) - pad);
		const right = Math.min(
			viewport.width,
			Math.max(...marks.map((m) => m.rect.x + m.rect.width)) + pad,
		);
		const bottom = Math.min(
			viewport.height,
			Math.max(...marks.map((m) => m.rect.y + m.rect.height)) + pad,
		);
		if (right - left > 8 && bottom - top > 8) {
			clip = { x: left, y: top, width: right - left, height: bottom - top };
		}
	}

	try {
		await page.screenshot({ path: outPath, clip, animations: "disabled" });
	} finally {
		await page.evaluate(() => window.__polish.clearMarks()).catch(() => {});
	}
	return outPath;
}

/** Loops two (or more) same sized screenshots as a GIF, the quickest way to see what moved. */
export function makeFlickerGif(framePaths, outPath, { seconds = 0.9 } = {}) {
	const inputs = framePaths.flatMap((frame) => [
		"-loop",
		"1",
		"-t",
		String(seconds),
		"-i",
		frame,
	]);
	const concat = `${framePaths.map((_, i) => `[${i}:v]`).join("")}concat=n=${framePaths.length}:v=1:a=0,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5`;
	execFileSync(
		"ffmpeg",
		["-y", ...inputs, "-filter_complex", concat, "-loop", "0", outPath],
		{ stdio: "ignore" },
	);
	return outPath;
}

/** A recorded page video as a GIF, slowed down so a shift lasting a frame can be seen. */
export function videoToGif(
	videoPath,
	outPath,
	{ slowdown = 3, fps = 12, width = 720, from = 0, duration } = {},
) {
	const filter = `setpts=${slowdown}*PTS,fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5`;
	execFileSync(
		"ffmpeg",
		[
			"-y",
			"-ss",
			String(from),
			...(duration ? ["-t", String(duration)] : []),
			"-i",
			videoPath,
			"-filter_complex",
			filter,
			"-loop",
			"0",
			outPath,
		],
		{ stdio: "ignore" },
	);
	return outPath;
}

/** File name safe version of a URL or label. */
export function slug(text) {
	return (
		text
			.replace(/^https?:\/\/[^/]+/, "")
			.replace(/[^a-zA-Z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 70) || "root"
	);
}

/** Runs `worker(item, workerIndex)` over the items, `concurrency` at a time. */
export async function pool(items, concurrency, worker) {
	let next = 0;
	await Promise.all(
		Array.from({ length: concurrency }, async (_, workerIndex) => {
			while (next < items.length) {
				const item = items[next++];
				await worker(item, workerIndex);
			}
		}),
	);
}

/** What a sweep covers, saved as `<run>/coverage.json`: the pages, the matrix and what the crawl could not reach. */
export function describeRun({
	run,
	manifest,
	pages,
	passes,
	viewports,
	scope,
	widths,
	lang,
}) {
	const sizeOf = (name) => {
		const size = VIEWPORTS[name].viewport;
		return `${name} (${size.width}x${size.height})`;
	};
	return {
		run,
		date: new Date().toISOString().slice(0, 10),
		database: POLISH_DB,
		baseUrl: BASE_URL,
		scope,
		passes,
		lang: lang ?? "en",
		viewports: viewports.map(sizeOf),
		viewportsNotRun: Object.keys(VIEWPORTS)
			.filter((name) => !viewports.includes(name))
			.map(sizeOf),
		widths: passes.includes("widths") ? widths : [],
		pages: pages.map(({ url, route, feature, viewer, stress, scenario }) => ({
			url,
			route,
			feature,
			viewer: viewer ?? null,
			stress: stress ?? null,
			scenario: scenario ?? null,
		})),
		routesTotal: manifest.routesTotal ?? null,
		unreached: manifest.unreached ?? [],
		skipped: manifest.skipped ?? [],
		broken: manifest.broken ?? [],
	};
}

/** The sections findings are grouped by, in the report and as tasks. */
export const SECTIONS = [
	{
		title: "Layout shift",
		rules: [
			"shift-on-load",
			"shift-on-scroll",
			"shift-on-idle",
			"shift-on-action",
			"control-moved",
		],
	},
	{ title: "Scroll jumps", rules: ["scroll-jump"] },
	{
		title: "Text overflow",
		rules: [
			"text-clipped",
			"text-spill",
			"text-overlap",
			"text-under-control",
			"squashed",
		],
	},
	{
		title: "Wrapping and truncation",
		rules: [
			"wrapping",
			"label-wraps",
			"mid-word-break",
			"orphan-word",
			"truncation",
			"truncated-with-room",
		],
	},
	{ title: "Horizontal scroll", rules: ["horizontal-scroll"] },
	{
		title: "Scroll boxes and fixed bars",
		rules: [
			"nested-scroll",
			"accidental-scroll",
			"content-under-fixed-bar",
			"anchor-under-header",
		],
	},
	{ title: "Overlays", rules: ["overlay-offscreen"] },
	{ title: "Contrast", rules: ["low-contrast", "low-contrast-ui"] },
	{
		title: "Hover and focus feedback",
		rules: [
			"no-hover-feedback",
			"cursor-not-pointer",
			"no-press-feedback",
			"no-focus-indicator",
			"focus-ring-clipped",
			"focus-not-visible",
			"focus-obscured",
		],
	},
	{
		title: "Alignment and spacing",
		rules: [
			"off-center",
			"alignment",
			"spacing",
			"near-miss-alignment",
			"misaligned-row",
			"touching-text",
			"uneven-gaps",
		],
	},
	{
		title: "Consistency",
		rules: ["consistency", "off-token", "inconsistent-heading", "page-title"],
	},
	{ title: "Touch targets", rules: ["small-tap-target"] },
	{
		title: "Images",
		rules: ["broken-image", "distorted-image", "blurry-image"],
	},
];
export const SECTION_TITLES = [
	...SECTIONS.map((section) => section.title),
	"Everything else",
];
export const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

export function sectionOf(finding) {
	return (
		SECTIONS.find((section) => section.rules.includes(finding.rule))?.title ??
		"Everything else"
	);
}

/** Every reviewed finding of a run (`<run>/reviewed/<reviewer>.json`), with who wrote it. */
export function loadFindings(runDir) {
	const reviewedDir = path.join(runDir, "reviewed");
	return fs
		.readdirSync(reviewedDir)
		.filter(
			(file) =>
				file.endsWith(".json") &&
				!file.endsWith(".notes.json") &&
				!file.endsWith(".triage.json"),
		)
		.flatMap((file) =>
			JSON.parse(fs.readFileSync(path.join(reviewedDir, file), "utf8")).map(
				(finding) => ({ ...finding, reviewer: file.replace(/\.json$/, "") }),
			),
		);
}

/**
 * Reviewer prose as markdown text: a tag written outside backticks (`an empty <a>`) would otherwise be read as
 * HTML, and an unclosed one swallows the rest of the document. Code spans are left alone.
 */
export function markdownText(prose) {
	return prose
		.split(/(`[^`]*`)/)
		.map((part) =>
			part.startsWith("`")
				? part
				: part.replaceAll("&", "&amp;").replaceAll("<", "&lt;"),
		)
		.join("");
}

/** The `shoot.mjs` line showing a finding's page the way it was audited: same viewer, viewport, theme, language and steps. */
export function reproduceCommand(finding, out = "/tmp/polish.png") {
	const flagsText = [
		finding.viewer
			? `--as=${finding.viewer}`
			: finding.viewer === null
				? "--anon"
				: null,
		finding.viewport && finding.viewport !== "desktop"
			? `--viewport=${finding.viewport}`
			: null,
		finding.theme && finding.theme !== "dark"
			? `--theme=${finding.theme}`
			: null,
		finding.lang && finding.lang !== "en" ? `--lang=${finding.lang}` : null,
		// steps come from the explore pass, which clicks with writes blocked
		finding.steps?.length ? "--read-only" : null,
		...(finding.steps ?? []).map((step) => `--do='${step}'`),
	]
		.filter(Boolean)
		.join(" ");
	return `node .claude/skills/polish/scripts/shoot.mjs '${finding.url.replace(BASE_URL, "")}' --out=${out}${flagsText ? ` ${flagsText}` : ""}`;
}

// ------------------------------------------------------------- source of a class

const MODULE_CLASS =
	/_([A-Za-z][A-Za-z0-9-]*(?:_[A-Za-z0-9-]+)*?)_([a-z0-9]{5})_(\d+)/g;

let moduleIndex = null;

/**
 * hash -> CSS module file, for every `*.module.css` of the app. A built class reads `_name_hash_line`
 * and the hash is one of the file's content as Vite sees it (wrapped in its cascade layer, see
 * `cssModulesLayer` of vite-css-plugins.ts, which this mirrors), so the class leads back to its file.
 * Files edited since the build no longer match and stay unresolved.
 */
function modules() {
	if (moduleIndex) return moduleIndex;
	moduleIndex = new Map();
	const files = fs.globSync("app/**/*.module.css", { cwd: ROOT });
	for (const file of files) {
		const id = `/${file.split(path.sep).join("/")}`;
		const layer = id.includes("/app/components/elements/")
			? "elements"
			: /\/app\/components\/[^/]+\.module\.css$/.test(id)
				? "components"
				: "features";
		const code = fs.readFileSync(path.join(ROOT, file), "utf8");
		moduleIndex.set(
			stringHash(
				`@layer reset, base, elements, components, features, utilities;\n@layer ${layer} {\n${code}\n}`,
			),
			file.split(path.sep).join("/"),
		);
	}
	return moduleIndex;
}

/** The hash postcss-modules puts into a class name. */
function stringHash(text) {
	let hash = 5381;
	for (let index = text.length; index > 0; ) {
		hash = (hash * 33) ^ text.charCodeAt(--index);
	}
	return (hash >>> 0).toString(36).slice(0, 5);
}

/** The CSS module files and class names behind the built class names in a selector or signature. */
export function sourcesOf(text) {
	const found = new Map();
	for (const [, name, hash] of String(text ?? "").matchAll(MODULE_CLASS)) {
		const file = modules().get(hash);
		if (!file) continue;
		found.set(`${file} .${name}`, { file, name });
	}
	return [...found.values()];
}

/**
 * The same text with every built class name replaced by one that survives a rebuild: `name@file`
 * (or the bare name when the file can't be told). What findings of two runs are matched by.
 */
export function stableText(text) {
	return String(text ?? "").replace(MODULE_CLASS, (_match, name, hash) => {
		const file = modules().get(hash);
		return file
			? `${name}@${file.replace(/^app\//, "").replace(/\.module\.css$/, "")}`
			: name;
	});
}

// ------------------------------------------------------------------------ routes

/** The route of `routes.json` rendering a pathname: the one with the most static segments (scripts/living-docs/app-routes.ts `matchRoute`). */
export function matchRoute(routes, pathname) {
	let best = null;
	for (const route of routes) {
		const score = matchScore(route.path, pathname);
		if (score === null) continue;
		if (!best || score > best.score) best = { route, score };
	}
	return best?.route ?? null;
}

function matchScore(pattern, pathname) {
	const patternSegments = pattern.split("/").filter(Boolean);
	const pathSegments = pathname.split("/").filter(Boolean);
	let score = 0;
	let index = 0;

	for (const segment of patternSegments) {
		if (segment === "*") return score;
		const pathSegment = pathSegments[index];
		const isOptional = segment.endsWith("?");
		if (pathSegment === undefined) {
			if (isOptional) continue;
			return null;
		}
		if (segment.startsWith(":")) {
			score += 1;
		} else if (segment.replace(/\?$/, "") === decodeURIComponent(pathSegment)) {
			score += 10;
		} else if (isOptional) {
			continue;
		} else {
			return null;
		}
		index++;
	}
	return index === pathSegments.length ? score : null;
}

export function featureOfRoute(route) {
	return route?.file.match(/app\/features\/([^/]+)\//)?.[1] ?? "other";
}

export function readOutputJson(name) {
	const file = path.join(OUTPUT_DIR, name);
	return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

/** The manifest of a viewer: the admin's is `manifest.json`, anyone else's `manifest-<viewer>.json`. */
export function manifestName(viewer) {
	return viewer === undefined ||
		viewer === null ||
		viewer === "admin" ||
		Number(viewer) === ADMIN_ID
		? "manifest.json"
		: `manifest-${viewer}.json`;
}

// ------------------------------------------------------------------- mechanical

/**
 * Every mechanical finding of a run: the sweep's (`mechanical.json`, ids `m1`...) and what the probes
 * saw during an e2e run (`e2e/*.json`, ids `e1`...), each with the verdict an earlier run gave it.
 */
export function loadMechanical(runDir) {
	const verdicts = loadVerdicts();
	const file = path.join(runDir, "mechanical.json");
	const swept = fs.existsSync(file)
		? JSON.parse(fs.readFileSync(file, "utf8"))
		: [];

	const e2eDir = path.join(runDir, "e2e");
	const fromE2e = new Map();
	if (fs.existsSync(e2eDir)) {
		for (const name of fs.readdirSync(e2eDir).sort()) {
			if (!name.endsWith(".json")) continue;
			for (const finding of JSON.parse(
				fs.readFileSync(path.join(e2eDir, name), "utf8"),
			)) {
				const existing = fromE2e.get(finding.key);
				if (!existing) {
					fromE2e.set(finding.key, finding);
					continue;
				}
				existing.occurrences += finding.occurrences;
				for (const page of finding.pages) {
					if (!existing.pages.includes(page) && existing.pages.length < 12)
						existing.pages.push(page);
				}
			}
		}
	}
	const e2e = [...fromE2e.values()]
		.sort((a, b) => a.key.localeCompare(b.key))
		.map((finding, index) => ({ ...finding, id: `e${index + 1}` }));

	return [...swept, ...e2e].map((finding) => {
		const stableKey = finding.stableKey ?? stableText(finding.key);
		return { ...finding, stableKey, known: verdicts[stableKey] ?? null };
	});
}

const VERDICTS_FILE = path.join(SKILL_DIR, "verdicts.json");

/** What reviewers of earlier runs said about a mechanical finding, by its stable key: `{ verdict, note, run, rule }`. */
export function loadVerdicts() {
	return fs.existsSync(VERDICTS_FILE)
		? JSON.parse(fs.readFileSync(VERDICTS_FILE, "utf8"))
		: {};
}

export function saveVerdicts(verdicts) {
	const sorted = Object.fromEntries(
		Object.entries(verdicts).sort(([a], [b]) => a.localeCompare(b)),
	);
	fs.writeFileSync(VERDICTS_FILE, `${JSON.stringify(sorted, null, "\t")}\n`);
}

export const VERDICTS = [
	"real",
	"intentional",
	"probe-mistake",
	"not-reproduced",
];

// --------------------------------------------------------------------- languages

/** The language whose translations are longest overall: the one sweep that stretches the most labels. */
export function longestLanguage() {
	const localesDir = path.join(ROOT, "locales");
	const english = strings(path.join(localesDir, "en"));
	let best = null;
	for (const lang of fs.readdirSync(localesDir)) {
		if (lang === "en") continue;
		const translated = strings(path.join(localesDir, lang));
		let total = 0;
		for (const [key, value] of english) {
			total += (translated.get(key) ?? value).length;
		}
		if (!best || total > best.total) best = { lang, total };
	}
	return best?.lang ?? "en";
}

function strings(dir) {
	const result = new Map();
	if (!fs.existsSync(dir)) return result;
	const walk = (prefix, value) => {
		if (typeof value === "string") result.set(prefix, value);
		else if (value && typeof value === "object") {
			for (const [key, child] of Object.entries(value))
				walk(`${prefix}.${key}`, child);
		}
	};
	for (const file of fs.readdirSync(dir)) {
		if (!file.endsWith(".json")) continue;
		walk(file, JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")));
	}
	return result;
}

/** The CSS module file a class hash belongs to, or undefined. */
export function moduleFileOf(hash) {
	return modules().get(hash);
}
