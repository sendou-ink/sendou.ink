/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
// The mechanical sweep: every page of the manifest through the passes of passes.mjs, no judgment
// involved. Writes <run>/mechanical.json, the evidence (screenshots, before/after GIFs) under
// <run>/media and <run>/census.json. A finding is recorded once per component (its class
// signature) with the pages it was seen on, so forty pages showing the same button are one finding.
//
//   node .claude/skills/polish/scripts/sweep.mjs [--run=run]
//        [--passes=static,interactive,actions,explore,widths,load]
//        [--only=<part of url or feature>[,..]] [--limit=N] [--concurrency=4]
//        [--viewports=mobile,desktop]        any of mobile, tablet, desktop, wide
//        [--as=admin,anon,<user id>]         whose manifests to sweep (crawl.mjs --as=.. writes them)
//        [--lang=<code>|longest]             the site's language (default English)
//        [--widths=320,480,..]               the widths of the widths pass
//        [--actions-per-page=8] [--explore-per-page=12] [--evidence-per-rule=N]
//        [--urls=/a,/b --plain]              pages given by hand; --plain for a site that is not the app
//                                            (no login, no hydration marker), with POLISH_BASE_URL
//
// Passes:
//   static       overflow, overlap, sideways scroll, wrapping, truncation, alignment, scroll boxes,
//                fixed bars, images, junk text, contrast (both themes, over pictures too), centering
//                (boxes and pixels), tap targets (touch viewports), console errors, failed requests
//   interactive  hover and keyboard focus of every clickable component (pointer viewports), what
//                shows under a finger (touch viewports)
//   actions      tabs, disclosures and in-section links clicked: what moved, did the page scroll
//   explore      every other control clicked with writes blocked: what moved, and the dialogs,
//                popovers and menus that open put through the static probes
//   widths       the cheap probes at every width between and beyond the viewports, without reloading
//   load         layout shift while the page loads (uncached and cached, throttled), while it sits
//                idle and while it is scrolled
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	ADMIN_ID,
	assertServerUp,
	describeRun,
	isTouchViewport,
	launchBrowser,
	longestLanguage,
	manifestName,
	OUTPUT_DIR,
	openSession,
	parseArgs,
	pool,
	readOutputJson,
	resetSession,
	SWEEP_WIDTHS,
	setPlain,
	shootMarked,
	VIEWPORTS,
	visit,
} from "./lib.mjs";
import {
	actionsPass,
	defaultOptions,
	explorePass,
	focusPass,
	hoverPass,
	loadPass,
	newTested,
	open,
	pressPass,
	staticPass,
	watchPage,
	widthsPass,
} from "./passes.mjs";
import { Recorder } from "./recorder.mjs";

const ALL_PASSES = [
	"static",
	"interactive",
	"actions",
	"explore",
	"widths",
	"load",
];

const { flags } = parseArgs();
const RUN = String(flags.run ?? "run");
const RUN_DIR = path.join(OUTPUT_DIR, RUN);
const PASSES = String(flags.passes ?? ALL_PASSES.join(",")).split(",");
const VIEWPORT_NAMES = String(flags.viewports ?? "mobile,desktop").split(",");
const CONCURRENCY = Number(
	flags.concurrency ?? Math.min(8, Math.max(4, os.cpus().length - 2)),
);
const LANG =
	flags.lang === "longest"
		? longestLanguage()
		: flags.lang
			? String(flags.lang)
			: undefined;

for (const pass of PASSES) {
	if (!ALL_PASSES.includes(pass)) throw new Error(`Unknown pass "${pass}"`);
}
for (const name of VIEWPORT_NAMES) {
	if (!VIEWPORTS[name]) throw new Error(`Unknown viewport "${name}"`);
}
if (flags.plain) setPlain(true);

await assertServerUp();

const manifest = loadManifest();
let pages = manifest.pages;
if (flags.only) {
	const needles = String(flags.only).split(",");
	pages = pages.filter((entry) =>
		needles.some(
			(needle) => entry.url.includes(needle) || entry.feature === needle,
		),
	);
}
if (flags.limit) pages = pages.slice(0, Number(flags.limit));

const options = defaultOptions({
	lang: LANG,
	...(flags.widths
		? { widths: String(flags.widths).split(",").map(Number) }
		: {}),
	...(flags["actions-per-page"]
		? { actionsPerPage: Number(flags["actions-per-page"]) }
		: {}),
	...(flags["explore-per-page"]
		? { explorePerPage: Number(flags["explore-per-page"]) }
		: {}),
});
const recorder = new Recorder({
	runDir: RUN_DIR,
	evidencePerRule: flags["evidence-per-rule"]
		? Number(flags["evidence-per-rule"])
		: undefined,
});
const tested = newTested();

// what this run looked at, for the report's "What was audited" and the skill's audit log
const coverage = describeRun({
	run: RUN,
	manifest,
	pages,
	passes: PASSES,
	viewports: VIEWPORT_NAMES,
	widths: options.widths ?? SWEEP_WIDTHS,
	lang: LANG,
	scope: flags.only
		? `only: ${flags.only}`
		: flags.urls
			? `urls: ${flags.urls}`
			: "whole site",
});
saveCoverage();

const browser = await launchBrowser();
const startedAt = Date.now();

if (!flags.only && !flags.urls) {
	for (const link of manifest.broken ?? []) {
		recorder.add(
			`broken-link|${link.url}`,
			{
				rule: "broken-link",
				sig: link.url,
				detail: `a link on ${link.linkedFrom ?? "a page"} leads to ${link.url}, which answers ${link.status}`,
			},
			{
				entry: {
					url: link.linkedFrom ?? link.url,
					route: link.url,
					feature: "other",
					viewer: link.viewer ?? ADMIN_ID,
				},
				viewportName: "desktop",
				theme: "dark",
			},
		);
	}
}

if (PASSES.includes("static") || PASSES.includes("interactive")) {
	for (const viewportName of VIEWPORT_NAMES) {
		await eachPage(viewportName, {}, async (page, ctx) => {
			if (PASSES.includes("static")) await staticPass(page, ctx);
			if (!PASSES.includes("interactive")) return;
			if (isTouchViewport(viewportName)) {
				await pressPass(page, ctx);
			} else {
				await hoverPass(page, ctx);
				await focusPass(page, ctx);
			}
		});
		log(`static ${viewportName} done`);
	}
}
if (PASSES.includes("actions")) {
	for (const viewportName of VIEWPORT_NAMES) {
		await eachPage(viewportName, {}, actionsPass);
		log(`actions ${viewportName} done`);
	}
}
if (PASSES.includes("explore")) {
	for (const viewportName of VIEWPORT_NAMES) {
		await eachPage(viewportName, { readOnly: true }, explorePass);
		log(`explore ${viewportName} done`);
	}
}
if (PASSES.includes("widths")) {
	await eachPage("desktop", {}, widthsPass);
	log("widths done");
}
if (PASSES.includes("load")) {
	for (const viewportName of VIEWPORT_NAMES) {
		await loadEachPage(viewportName);
		log(`load ${viewportName} done`);
	}
}

recorder.finalize();
await lateEvidence();
await browser.close();

const findings = recorder.save();
recorder.saveCensus();
recorder.saveModules();
coverage.counters = recorder.counters;
saveCoverage();

const byRule = Map.groupBy(findings, (finding) => finding.rule);
const isNew = (finding) => !finding.known;
console.log(
	`\n${findings.length} findings over ${pages.length} pages (${findings.filter(isNew).length} without a verdict from an earlier run):`,
);
for (const [rule, items] of [...byRule].sort(
	(a, b) => b[1].length - a[1].length,
)) {
	console.log(
		`  ${String(items.length).padStart(4)}  ${rule}${items.some((item) => item.known) ? `  (${items.filter(isNew).length} new)` : ""}`,
	);
}
console.log(`\ncounters: ${JSON.stringify(recorder.counters)}`);
console.log(
	`\n${path.relative(process.cwd(), path.join(RUN_DIR, "mechanical.json"))}`,
);

// --------------------------------------------------------------- plumbing

/** The manifests of every viewer asked for as one, or the pages given with `--urls`. */
function loadManifest() {
	if (flags.urls) {
		return {
			pages: String(flags.urls)
				.split(",")
				.map((url) => ({
					url,
					route: url.split("?")[0],
					feature: "other",
					viewer: flags.plain ? null : ADMIN_ID,
				})),
		};
	}
	const viewers = String(flags.as ?? "admin").split(",");
	const merged = { pages: [], unreached: [], broken: [], skipped: [] };
	const seen = new Set();
	for (const viewer of viewers) {
		const name = manifestName(viewer);
		const one = readOutputJson(name);
		if (!one) {
			throw new Error(
				`${name} is missing, run: node .claude/skills/polish/scripts/crawl.mjs${name === "manifest.json" ? "" : ` --as=${viewer}`}`,
			);
		}
		for (const entry of one.pages) {
			const key = `${entry.viewer ?? "anon"} ${entry.url}`;
			if (seen.has(key)) continue;
			seen.add(key);
			merged.pages.push(entry);
		}
		merged.routesTotal = one.routesTotal;
		merged.skipped = one.skipped;
		merged.unreached =
			viewer === viewers[0]
				? one.unreached
				: merged.unreached.filter((route) => one.unreached.includes(route));
		merged.broken.push(...one.broken);
	}
	return merged;
}

/** Opens every page in the viewport (one browser context per viewer, per worker) and hands it to the pass. */
async function eachPage(viewportName, { readOnly = false }, pass) {
	let done = 0;
	const sessions = new Map();
	const sessionFor = async (workerIndex, viewer) => {
		const key = `${workerIndex}:${viewer ?? "anon"}`;
		if (!sessions.has(key)) {
			const context = await openSession(browser, {
				viewer,
				viewport: viewportName,
				readOnly,
				lang: LANG,
			});
			sessions.set(key, { context, state: await context.storageState() });
		}
		return sessions.get(key);
	};

	await pool(pages, CONCURRENCY, async (entry, workerIndex) => {
		const session = await sessionFor(workerIndex, entry.viewer);
		const page = await session.context.newPage();
		const ctx = { recorder, entry, viewportName, tested, options, log };
		const flush = watchPage(page, ctx);
		try {
			if (await open(page, ctx)) await pass(page, ctx);
			flush();
		} catch (error) {
			recorder.count("pageErrors");
			log(
				`${entry.url} (${viewportName}): ${String(error.message).split("\n")[0]}`,
			);
		} finally {
			if (readOnly) {
				// a click may have switched the theme or dismissed something for good
				await page
					.evaluate(() => {
						localStorage.clear();
						sessionStorage.clear();
					})
					.catch(() => {});
				await resetSession(session.context, session.state).catch(() => {});
			}
			await page.close().catch(() => {});
		}
		if (++done % 25 === 0) {
			log(
				`${viewportName}: ${done}/${pages.length} pages, ${recorder.findings.size} findings`,
			);
			recorder.save();
		}
	});

	for (const session of sessions.values()) await session.context.close();
	recorder.save();
}

async function loadEachPage(viewportName) {
	const videoDir = path.join(RUN_DIR, "video-tmp");
	const sessions = new Map();
	let done = 0;

	await pool(pages, CONCURRENCY, async (entry, workerIndex) => {
		const key = `${workerIndex}:${entry.viewer ?? "anon"}`;
		if (!sessions.has(key)) {
			sessions.set(
				key,
				await openSession(browser, {
					viewer: entry.viewer,
					viewport: viewportName,
					videoDir,
					lang: LANG,
				}),
			);
		}
		await loadPass(sessions.get(key), {
			recorder,
			entry,
			viewportName,
			tested,
			options,
			log,
		});
		if (++done % 25 === 0) {
			log(`load ${viewportName}: ${done}/${pages.length} pages`);
			recorder.save();
		}
	});

	for (const session of sessions.values()) await session.close();
	fs.rmSync(videoDir, { recursive: true, force: true });
	recorder.save();
}

/** Screenshots for the findings that only exist once the whole run is in (sizes off the tokens, headings unlike the rest). */
async function lateEvidence() {
	const late = [...recorder.findings.values()].filter(
		(finding) =>
			["off-token", "inconsistent-heading"].includes(finding.rule) &&
			finding.media.length === 0 &&
			finding.selector,
	);
	const sessions = new Map();
	for (const finding of late.slice(0, 80)) {
		const viewportName = VIEWPORTS[finding.viewport]
			? finding.viewport
			: "desktop";
		const key = `${finding.viewer ?? "anon"}:${viewportName}`;
		if (!sessions.has(key)) {
			sessions.set(
				key,
				await openSession(browser, {
					viewer: finding.viewer ?? undefined,
					viewport: viewportName,
					lang: LANG,
				}),
			);
		}
		const page = await sessions.get(key).newPage();
		try {
			await visit(page, finding.url);
			const target = page
				.locator(finding.selector.replace(/#[^.[\s>]+/g, ""))
				.first();
			await target.scrollIntoViewIfNeeded({ timeout: 2000 });
			const box = await target.boundingBox();
			if (box) {
				const file = `${recorder.stem(finding.rule, { viewportName, entry: { url: finding.url } })}.png`;
				await shootMarked(page, file, {
					marks: [{ rect: box, label: finding.rule }],
					pad: 180,
				});
				finding.media.push(recorder.relative(file));
			}
		} catch {
			// the finding stands without a picture
		}
		await page.close().catch(() => {});
	}
	for (const session of sessions.values()) await session.close();
}

function saveCoverage() {
	fs.mkdirSync(RUN_DIR, { recursive: true });
	fs.writeFileSync(
		path.join(RUN_DIR, "coverage.json"),
		JSON.stringify(coverage, null, "\t"),
	);
}

function log(message) {
	console.log(`[${Math.round((Date.now() - startedAt) / 1000)}s] ${message}`);
}
