/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
// Checks the probes against pages with known defects: every rule has a case in `../selftest/` that
// has to be found (`data-expect` on the case names the rules), and nothing may be found in a case
// that does not expect it. Runs the passes the sweep runs, on a small server of its own, so it needs
// neither the polish server nor its database.
//
// Run it after changing a probe or a pass: a fix for one false finding must not silence a true one.
//
//   node .claude/skills/polish/scripts/selftest.mjs [--only=<part of a case or fixture name>] [--verbose]
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import {
	launchBrowser,
	OUTPUT_DIR,
	openSession,
	parseArgs,
	ROOT,
	SKILL_DIR,
	setHydrationTimeout,
	writesBlocked,
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

const FIXTURE_DIR = path.join(SKILL_DIR, "selftest");
const RUN_DIR = path.join(OUTPUT_DIR, "selftest");
const LATE_FONT = path.join(ROOT, "app/styles/fonts/lexend-latin.woff2");
const PASSES = {
	static: staticPass,
	hover: hoverPass,
	focus: focusPass,
	press: pressPass,
	actions: actionsPass,
	explore: explorePass,
	widths: widthsPass,
};
/** Each fixture page with the passes it is put through, per viewport. `load` opens the page itself. */
const FIXTURES = [
	{
		file: "static.html",
		runs: [
			{ viewport: "desktop", passes: ["static", "hover", "focus"] },
			{ viewport: "mobile", passes: ["static", "press"] },
		],
	},
	{
		file: "bars.html",
		runs: [
			{ viewport: "desktop", passes: ["static", "focus"] },
			{ viewport: "mobile", passes: ["static"] },
		],
	},
	{
		file: "actions.html",
		runs: [{ viewport: "desktop", passes: ["actions"] }],
	},
	{
		file: "actions.html",
		runs: [{ viewport: "desktop", passes: ["explore"], readOnly: true }],
	},
	{ file: "load.html", runs: [{ viewport: "desktop", passes: ["load"] }] },
	{ file: "fonts.html", runs: [{ viewport: "desktop", passes: ["load"] }] },
	{ file: "errors.html", runs: [{ viewport: "desktop", passes: ["static"] }] },
	{ file: "widths.html", runs: [{ viewport: "desktop", passes: ["widths"] }] },
	{ file: "pushed.html", runs: [{ viewport: "mobile", passes: ["static"] }] },
	{ file: "unhydrated.html", runs: [{ viewport: "desktop", passes: [] }] },
	{
		file: "redirect.html",
		// the page is gone by the time its expectations could be read from it
		expect: ["client-redirect"],
		runs: [{ viewport: "desktop", passes: [] }],
	},
];
/** Findings about the run as a whole rather than one case: three fixtures share a title, sizes are off the fixture's tokens. */
const RUN_LEVEL = ["page-title", "off-token"];
const MIME = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".png": "image/png",
};

const { flags } = parseArgs();
const only = flags.only ? String(flags.only) : null;

fs.rmSync(RUN_DIR, { recursive: true, force: true });
setHydrationTimeout(1500);

let writesReceived = 0;
const server = http.createServer((request, response) => {
	if (request.method !== "GET") {
		writesReceived++;
		response.writeHead(204).end();
		return;
	}
	const name = decodeURIComponent(new URL(request.url, "http://x").pathname);
	if (name === "/late-font.woff2") {
		// the app's own font, held back: a page shows its text in the fallback first
		setTimeout(() => {
			response
				.writeHead(200, { "content-type": "font/woff2" })
				.end(fs.readFileSync(LATE_FONT));
		}, 500);
		return;
	}
	const file = path.join(FIXTURE_DIR, path.basename(name));
	if (!fs.existsSync(file) || !MIME[path.extname(file)]) {
		response.writeHead(404).end("not found");
		return;
	}
	response
		.writeHead(200, { "content-type": MIME[path.extname(file)] })
		.end(fs.readFileSync(file));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const recorder = new Recorder({ runDir: RUN_DIR, selftest: true });
const tested = newTested();
const options = defaultOptions();
const browser = await launchBrowser();

/** case -> the rules it expects */
const expected = new Map();
/** fixture file -> the rules expected of the page as a whole */
const expectedOfPage = new Map();
let blocked = 0;

for (const fixture of FIXTURES) {
	const entry = {
		url: `${origin}/${fixture.file}`,
		route: `/fixtures/${fixture.file}`,
		feature: "selftest",
		viewer: null,
	};
	if (fixture.expect) expectedOfPage.set(fixture.file, fixture.expect);
	for (const run of fixture.runs) {
		const ctx = {
			recorder,
			entry,
			viewportName: run.viewport,
			tested,
			options,
		};
		if (run.passes.includes("load")) {
			const session = await openSession(browser, {
				viewport: run.viewport,
				videoDir: path.join(RUN_DIR, "video-tmp"),
			});
			await readExpectations(session, entry, fixture.file);
			await loadPass(session, ctx);
			await session.close();
			continue;
		}

		const session = await openSession(browser, {
			viewport: run.viewport,
			readOnly: run.readOnly,
		});
		const page = await session.newPage();
		const flush = watchPage(page, ctx);
		if (await open(page, ctx)) {
			await collectExpectations(page, fixture.file);
			for (const pass of run.passes) await PASSES[pass](page, ctx);
		}
		// the errors a fixture throws on a timer
		await page.waitForTimeout(100);
		flush();
		blocked += writesBlocked(session).length;
		await session.close();
	}
}

recorder.finalize();
const findings = recorder.save();
await browser.close();
server.close();
fs.rmSync(path.join(RUN_DIR, "video-tmp"), { recursive: true, force: true });

// --------------------------------------------------------------------- verdict

const failures = [];
const found = new Map([...expected.keys()].map((name) => [name, new Set()]));
const foundOfPage = new Map();

for (const finding of findings) {
	if (finding.rule === "probe-error") {
		failures.push(`a probe threw: ${finding.detail}`);
		continue;
	}
	if (finding.cases.length === 0) {
		const file = finding.route.replace("/fixtures/", "");
		if (RUN_LEVEL.includes(finding.rule)) {
			foundOfPage.set(
				"run",
				(foundOfPage.get("run") ?? new Set()).add(finding.rule),
			);
		} else if (expectedOfPage.get(file)?.includes(finding.rule)) {
			foundOfPage.set(
				file,
				(foundOfPage.get(file) ?? new Set()).add(finding.rule),
			);
		} else {
			failures.push(
				`unexpected on ${file}: ${finding.rule} (${finding.detail.slice(0, 140)})`,
			);
		}
		continue;
	}
	for (const name of finding.cases) {
		if (expected.get(name)?.includes(finding.rule)) {
			found.get(name).add(finding.rule);
		} else {
			failures.push(
				`unexpected in case "${name}": ${finding.rule} at ${finding.selector.split(" > ").at(-1)} (${finding.detail.slice(0, 140)})`,
			);
		}
	}
}
for (const [name, rules] of expected) {
	for (const rule of rules) {
		if (!found.get(name).has(rule))
			failures.push(`missed in case "${name}": ${rule}`);
	}
}
for (const [file, rules] of expectedOfPage) {
	for (const rule of rules) {
		if (!foundOfPage.get(file)?.has(rule))
			failures.push(`missed on ${file}: ${rule}`);
	}
}
for (const rule of RUN_LEVEL) {
	if (!foundOfPage.get("run")?.has(rule)) failures.push(`missed: ${rule}`);
}

// what only the whole finding can show
const between = findings.find((finding) => finding.cases.includes("between"));
if (between && between.widths.join(",") !== "480,600") {
	failures.push(
		`the width sweep saw the "between" case at ${between.widths.join(", ")}px, it overflows at 480 and 600`,
	);
}
const fontSwap = findings.find((finding) =>
	finding.cases.includes("font-swap"),
);
if (fontSwap && !fontSwap.key.includes("font-swap")) {
	failures.push(
		"the shift a late font causes was not told apart from the others (it is one finding for the whole site)",
	);
}
const press = findings.find((finding) => finding.rule === "no-press-feedback");
if (press && !press.components?.length) {
	failures.push("the press feedback finding does not list its components");
}
const loadShift = findings.find(
	(finding) =>
		finding.rule === "shift-on-load" && finding.cases.includes("load-shift"),
);
if (loadShift && !loadShift.media.some((file) => file.endsWith(".gif"))) {
	failures.push("the load shift has no recording");
}
if (writesReceived > 0) {
	failures.push(
		`${writesReceived} write(s) got through to the server from a read-only session`,
	);
}
if (blocked === 0)
	failures.push(
		"the read-only session blocked no write, the fixture makes one",
	);
for (const finding of findings) {
	for (const media of finding.media) {
		if (!fs.existsSync(path.join(RUN_DIR, media)))
			failures.push(`evidence missing: ${media}`);
	}
}

const shown = only
	? failures.filter((failure) => failure.includes(only))
	: failures;
const caseCount = expected.size;
const ruleCount = new Set([
	...[...expected.values()].flat(),
	...[...expectedOfPage.values()].flat(),
	...RUN_LEVEL,
]).size;

if (flags.verbose) {
	for (const finding of findings) {
		console.log(
			`${finding.rule.padEnd(24)} ${(finding.cases.join(",") || finding.route).padEnd(28)} ${finding.detail.slice(0, 110)}`,
		);
	}
	console.log("");
}
if (shown.length > 0) {
	console.log(`${shown.length} problem(s):`);
	for (const failure of shown) console.log(`  - ${failure}`);
	console.log(`\nevidence: ${path.relative(process.cwd(), RUN_DIR)}/media`);
	process.exit(1);
}
console.log(
	`self-test passed: ${ruleCount} rules over ${caseCount} cases, ${findings.length} findings, every one expected (${blocked} write blocked, none received)`,
);

async function collectExpectations(page, file) {
	const declared = await page.evaluate(() => ({
		cases: [...document.querySelectorAll("[data-case]")].map((element) => [
			element.dataset.case,
			(element.dataset.expect ?? "").split(",").filter(Boolean),
		]),
		page: (document.querySelector('meta[name="polish-expect"]')?.content ?? "")
			.split(",")
			.filter(Boolean),
	}));
	for (const [name, rules] of declared.cases) {
		expected.set(name, [...new Set([...(expected.get(name) ?? []), ...rules])]);
	}
	if (declared.page.length > 0 && !expectedOfPage.has(file))
		expectedOfPage.set(file, declared.page);
}

async function readExpectations(session, entry, file) {
	const page = await session.newPage();
	await page.goto(entry.url);
	await collectExpectations(page, file);
	await page.close();
}
