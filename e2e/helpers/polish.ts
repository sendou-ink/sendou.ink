import fs from "node:fs";
import path from "node:path";
import type { BrowserContext, Page, TestInfo } from "@playwright/test";

/**
 * The polish skill's probes riding along with the e2e suite: with `POLISH_RUN=<run name>` set, every
 * page a test opens is put through the static probes each time it comes to rest, so the states only a
 * test reaches (a submitted form, an open dialog, a toast, a tournament mid-match) are looked at too.
 * Findings land in `scripts/output/polish/<run>/e2e/` and show up in the skill's `digest.mjs` with
 * ids `e1`, `e2`... See `.claude/skills/polish/SKILL.md`.
 */

const RUN = process.env.POLISH_RUN;
const RUN_DIR = path.resolve("scripts", "output", "polish", RUN ?? "");
const PROBES_PATH = path.resolve(".claude/skills/polish/scripts/probes.mjs");
/** The probes that only read the page: nothing here scrolls, focuses or clicks under a running test. */
const PROBES = [
	"overflow",
	"overlap",
	"horizontal-scroll",
	"images",
	"raw-keys",
	"junk",
	"contrast",
	"wrapping",
	"truncation",
	"squashed",
];
const QUIET_MS = 400;
const EVIDENCE_PER_TEST = 6;
const PAGES_PER_FINDING = 12;

/** Runs in the page: probes it whenever it has stopped changing for a moment and hands over what is new. */
const SAMPLER = `(() => {
	const seen = new Set();
	let timer;
	let busy = false;
	const sample = async () => {
		if (busy || !window.__polish || !window.__polishReport || !document.body) return;
		busy = true;
		try {
			const found = (await window.__polish.run(${JSON.stringify(PROBES)})).filter((item) => {
				const key = item.rule + "|" + item.sig;
				if (seen.has(key) || item.rule === "probe-error") return false;
				seen.add(key);
				return true;
			});
			if (found.length > 0) {
				await window.__polishReport({
					found,
					state: window.__polish.stateLabel(),
					theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
					width: innerWidth,
					height: innerHeight,
				});
			}
		} catch {
			// a page going away mid-probe
		} finally {
			busy = false;
		}
	};
	const schedule = () => {
		clearTimeout(timer);
		timer = setTimeout(sample, ${QUIET_MS});
	};
	new MutationObserver(schedule).observe(document, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ["open", "hidden", "aria-expanded", "aria-selected", "data-state"],
	});
	addEventListener("load", schedule);
})();`;

interface ProbeFinding {
	rule: string;
	sig: string;
	selector: string;
	text: string;
	detail: string;
	rect: { x: number; y: number; width: number; height: number };
	colors?: string;
}

interface ProbeReport {
	found: ProbeFinding[];
	state: string | null;
	theme: string;
	width: number;
	height: number;
}

interface RecordedFinding {
	key: string;
	rule: string;
	detail: string;
	text: string;
	selector: string;
	sig: string;
	url: string;
	route: string;
	feature: string;
	viewer: null;
	viewport: string;
	theme: string;
	state: string;
	test: string;
	occurrences: number;
	pages: string[];
	media: string[];
}

/**
 * Installs the probes on the context when a polish run is asked for. Resolves to what to call once
 * the test is over (it writes the findings out), or to nothing when there is no run.
 */
export async function startPolishProbes(
	context: BrowserContext,
	testInfo: TestInfo,
) {
	if (!RUN) return null;

	const findings = new Map<string, RecordedFinding>();
	const test = `${path.basename(testInfo.file)} › ${testInfo.titlePath.slice(1).join(" › ")}`;
	let evidenceTaken = 0;
	let mediaIndex = 0;

	await context.exposeBinding(
		"__polishReport",
		async ({ page }, report: ProbeReport) => {
			const url = pathOf(page.url());
			for (const item of report.found) {
				const layout = report.width < 700 ? "mobile" : "desktop";
				const key =
					item.rule === "low-contrast"
						? `${item.rule}|${item.colors}|${report.theme}`
						: `${item.rule}|${item.sig}|${layout}`;
				const existing = findings.get(key);
				if (existing) {
					existing.occurrences++;
					if (
						!existing.pages.includes(url) &&
						existing.pages.length < PAGES_PER_FINDING
					) {
						existing.pages.push(url);
					}
					continue;
				}

				const media: string[] = [];
				if (evidenceTaken < EVIDENCE_PER_TEST) {
					const file = await shoot(
						page,
						item,
						report,
						`e2e-${testInfo.parallelIndex}-${slug(testInfo.testId)}-${++mediaIndex}-${item.rule}.png`,
					);
					if (file) {
						evidenceTaken++;
						media.push(file);
					}
				}
				findings.set(key, {
					key,
					rule: item.rule,
					detail: item.detail,
					text: item.text,
					selector: item.selector,
					sig: item.sig,
					url,
					route: url.split("?")[0],
					feature: "e2e",
					viewer: null,
					viewport: `${report.width}x${report.height}`,
					theme: report.theme,
					state: [report.state, `during the e2e test "${test}"`]
						.filter(Boolean)
						.join(", "),
					test,
					occurrences: 1,
					pages: [url],
					media,
				});
			}
		},
	);
	await context.addInitScript({ path: PROBES_PATH });
	await context.addInitScript(SAMPLER);

	return () => {
		if (findings.size === 0) return;
		const dir = path.join(RUN_DIR, "e2e");
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(
			path.join(dir, `${slug(testInfo.testId)}-${testInfo.retry}.json`),
			JSON.stringify([...findings.values()], null, "\t"),
		);
	};
}

/** A screenshot of the finding's surroundings when it is on screen (the test is not to be scrolled under). */
async function shoot(
	page: Page,
	item: ProbeFinding,
	report: ProbeReport,
	name: string,
) {
	const { rect } = item;
	const isOnScreen =
		rect.width > 0 &&
		rect.x >= 0 &&
		rect.y >= 0 &&
		rect.x + rect.width <= report.width &&
		rect.y + rect.height <= report.height;
	if (!isOnScreen) return null;

	const pad = 120;
	const x = Math.max(0, rect.x - pad);
	const y = Math.max(0, rect.y - pad);
	const file = path.join(RUN_DIR, "media", name);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	try {
		await page.evaluate(
			`window.__polish.drawMarks(${JSON.stringify([{ rect, label: item.rule }])})`,
		);
		await page.screenshot({
			path: file,
			clip: {
				x,
				y,
				width: Math.min(report.width, rect.x + rect.width + pad) - x,
				height: Math.min(report.height, rect.y + rect.height + pad) - y,
			},
		});
		return path.join("media", name);
	} catch {
		return null;
	} finally {
		await page.evaluate("window.__polish?.clearMarks()").catch(() => {});
	}
}

function pathOf(url: string) {
	try {
		const parsed = new URL(url);
		return parsed.pathname + parsed.search;
	} catch {
		return url;
	}
}

function slug(text: string) {
	return text.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 60);
}
