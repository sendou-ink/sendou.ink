/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
// Writes <run>/findings.md, the document a person reviews: every reviewed finding of
// <run>/reviewed/*.json as a heading, a short explanation and its screenshot or GIF, then what the
// run audited and what it did not (from <run>/coverage.json and <run>/reviewed/*.notes.json).
//
//   node .claude/skills/polish/scripts/report.mjs [--run=run]
//
// A reviewed finding (written by the reviewing agents, see SKILL.md):
//   { title, rule, severity: "high"|"medium"|"low", explanation, url, viewport, theme, viewer?,
//     pages?: [urls], media: [paths relative to the run folder or absolute], source?, fix?,
//     mechanical?: ["m12", ..] the mechanical findings it was written from,
//     cause?: a short tag shared by findings with one root cause ("flex child without min-width"),
//     guardrail?: what would stop the whole class from coming back (a lint rule, a shared component) }
// A reviewer's notes, `<reviewer>.notes.json`:
//   { area, lookedAt: [..], notCovered: [..], needsDecision: [..], probeMistakes: [..] }
// Also shown when there: <run>/compare.json (compare.mjs: what changed since an earlier run) and
// <run>/triage.json (verdicts.mjs: the real mechanical findings nobody wrote up).
import fs from "node:fs";
import path from "node:path";
import {
	loadFindings,
	OUTPUT_DIR,
	parseArgs,
	reproduceCommand,
	SECTION_TITLES,
	SEVERITY_ORDER,
	sectionOf,
	markdownText as text,
} from "./lib.mjs";

const PASSES = {
	static:
		"every page at each viewport: text overflow, overlap and spill, wrapping (labels, words broken, lone last words), truncation with room to spare, sideways scroll, scroll boxes, content under fixed bars, alignment near misses, uneven gaps, images (broken, stretched, blurry, squashed), junk text and raw translation keys, console errors and failed requests, contrast of text, fields and icon buttons (dark and light theme, over pictures by sampling pixels), centering (boxes and drawn pixels), touch targets (touch viewports)",
	interactive:
		"every clickable component once (by class signature): hover feedback with a real pointer and the cursor (pointer viewports), what shows under a finger (touch viewports), the keyboard focus ring by comparing pixels, and Tab pressed through each page for stops that can't be seen",
	actions:
		"the tabs (every one), disclosures and in-section links of every page clicked, once per control and route, at each viewport: what moved, did the page scroll",
	explore:
		"every other control clicked with writes blocked (buttons, switches, checkboxes, what opens a dialog, popover or menu), once per control and route: what moved, the opened overlay put through the static probes, and the page looked at again when a click changed it (validation messages, revealed sections)",
	widths:
		"every page resized through the widths between and beyond the viewports without reloading: overflow, sideways scroll, wrapping, squashed controls",
	load: "every page loaded on a throttled connection (6 Mbps, 40 ms, 2x CPU) at each viewport, with nothing cached and again with a warm cache: layout shift while loading and hydrating, while the page sits idle, and while it is scrolled to its end",
};
/** What no sweep varies. Kept in step with the "Never audited" list of the skill's audit-log.md. */
const NOT_VARIED = [
	"light theme beyond contrast, and custom themes",
	"production-like data (`POLISH_DB=db-sandbox.sqlite3`) and the empty states of a brand new user",
	"reduced motion, 200% text size, ad slots",
	"what a page looks like after a write went through (toasts, saved states): the sweep blocks writes, the e2e hook sees those",
];

const { flags } = parseArgs();
const runDir = path.join(OUTPUT_DIR, String(flags.run ?? "run"));
const reviewedDir = path.join(runDir, "reviewed");

const findings = loadFindings(runDir);

const notes = fs
	.readdirSync(reviewedDir)
	.filter((file) => file.endsWith(".notes.json"))
	.map((file) => ({
		reviewer: file.replace(/\.notes\.json$/, ""),
		...JSON.parse(fs.readFileSync(path.join(reviewedDir, file), "utf8")),
	}));
const coverage = readRunJson("coverage.json");
const compare = readRunJson("compare.json");
const triage = readRunJson("triage.json");

const sectionTitles = SECTION_TITLES;

const lines = [
	"# Polish findings",
	"",
	`${findings.length} findings, each looked at by a reviewing agent after the mechanical sweep. Evidence was captured on the production build against \`db-polish.sqlite3\` (dev seed plus user content at the longest the forms accept).`,
	"",
	"What this run covered and what it left out is at the end: [What was audited](#what-was-audited), [Not audited](#not-audited), [Needs a decision](#needs-a-decision).",
	"",
	...sinceSection(),
	...causesSection(),
	"| Section | High | Medium | Low |",
	"| --- | --- | --- | --- |",
];
for (const title of sectionTitles) {
	const inSection = findings.filter((finding) => sectionOf(finding) === title);
	if (inSection.length === 0) continue;
	const count = (severity) =>
		inSection.filter((finding) => finding.severity === severity).length || "";
	lines.push(
		`| [${title}](#${anchor(title)}) | ${count("high")} | ${count("medium")} | ${count("low")} |`,
	);
}
lines.push("");

let number = 0;
for (const title of sectionTitles) {
	const inSection = findings
		.filter((finding) => sectionOf(finding) === title)
		.sort(
			(a, b) =>
				(SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3),
		);
	if (inSection.length === 0) continue;

	lines.push(`## ${title}`, "");
	for (const finding of inSection) {
		number++;
		lines.push(`### ${number}. ${text(finding.title)}`, "");
		lines.push(text(finding.explanation.trim()), "");

		const where = [
			`\`${finding.url}\``,
			finding.viewport,
			finding.theme,
			finding.viewer ? `as user ${finding.viewer}` : null,
			finding.pages?.length > 1
				? `also on ${finding.pages.length - 1} more page(s)`
				: null,
		].filter(Boolean);
		lines.push(
			`- **Severity:** ${finding.severity} · **Rule:** \`${finding.rule}\``,
			`- **Where:** ${where.join(" · ")}`,
		);
		if (finding.source) lines.push(`- **Source:** ${text(finding.source)}`);
		if (finding.cause) lines.push(`- **Cause:** ${text(finding.cause)}`);
		if (finding.fix) lines.push(`- **Likely fix:** ${text(finding.fix)}`);
		lines.push(`- **Reproduce:** \`${reproduceCommand(finding)}\``, "");

		for (const media of finding.media ?? []) {
			const file = path.isAbsolute(media) ? media : path.join(runDir, media);
			if (!fs.existsSync(file)) continue;
			const relative = path.relative(runDir, file);
			lines.push(
				/\.(webm|mp4)$/.test(relative)
					? `<video src="${relative}" controls loop muted width="720"></video>`
					: `![${text(finding.title).replace(/[[\]`]/g, "")}](${relative})`,
				"",
			);
		}
	}
}

lines.push(
	...backlogSection(),
	...auditedSection(),
	...notAuditedSection(),
	...decisionSection(),
);

const outPath = path.join(runDir, "findings.md");
fs.writeFileSync(outPath, lines.join("\n"));
console.log(`${findings.length} findings -> ${outPath}`);

function readRunJson(name) {
	const file = path.join(runDir, name);
	return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

/** What changed since the run this one was compared with (compare.mjs). */
function sinceSection() {
	if (!compare) return [];
	const { totals } = compare;
	const out = [
		`**Since the run \`${compare.against}\`** (mechanical findings, matched by component): ${totals.gone} gone, ${totals.new} new, ${totals.still} still there${totals.notSwept > 0 ? `, ${totals.notSwept} on pages this run did not sweep` : ""}.`,
		"",
	];
	if (compare.gone.length > 0) {
		out.push("<details><summary>Gone</summary>", "");
		for (const finding of compare.gone) {
			out.push(
				`- \`${finding.rule}\` \`${finding.url}\` (${finding.viewport}): ${text(finding.detail)}`,
			);
		}
		out.push("", "</details>", "");
	}
	return out;
}

/** Findings that share a cause, and what would keep the class from coming back. */
function causesSection() {
	const byCause = Map.groupBy(
		findings.filter((finding) => finding.cause),
		(finding) => finding.cause.trim().toLowerCase(),
	);
	const shared = [...byCause]
		.filter(([, group]) => group.length > 1)
		.sort((a, b) => b[1].length - a[1].length);
	if (shared.length === 0) return [];
	const out = [
		"## Shared causes",
		"",
		"Findings with one root cause: fixed once where they share a component, and worth a guardrail where they don't.",
		"",
		"| Cause | Findings | Worst | Guardrail |",
		"| --- | --- | --- | --- |",
	];
	for (const [, group] of shared) {
		const worst = group.toSorted(
			(a, b) =>
				(SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3),
		)[0];
		const guardrail = group.find((finding) => finding.guardrail)?.guardrail;
		out.push(
			`| ${text(group[0].cause)} | ${group.length} | ${worst.severity} | ${guardrail ? text(guardrail) : ""} |`,
		);
	}
	out.push("");
	return out;
}

/** Mechanical findings a reviewer called real without writing them up (verdicts.mjs). */
function backlogSection() {
	if (!triage) return [];
	const unwritten = Object.entries(triage).filter(
		([, entry]) => entry.verdict === "real" && !entry.writtenUp,
	);
	if (unwritten.length === 0) return [];
	const out = [
		"## Real, not written up",
		"",
		"Mechanical findings a reviewer confirmed and left out of the findings above (the smaller ones of a long list). `digest.mjs` shows each by its id.",
		"",
	];
	for (const [id, entry] of unwritten) {
		out.push(
			`- \`${id}\` \`${entry.rule}\`${entry.note ? `: ${text(entry.note)}` : ""}`,
		);
	}
	out.push("");
	return out;
}

function auditedSection() {
	const out = ["## What was audited", ""];
	if (!coverage) {
		out.push(
			"No `coverage.json` in this run folder (it is written by `sweep.mjs`).",
			"",
		);
		return out;
	}

	const routes = new Set(coverage.pages.map((page) => page.route));
	const stressCount = coverage.pages.filter((page) => page.stress).length;
	const viewers = [
		...new Set(coverage.pages.map((page) => page.viewer ?? "logged out")),
	];
	out.push(
		`- **Run:** \`${coverage.run}\` on ${coverage.date}, scope: ${coverage.scope}`,
		`- **Build and data:** production build (e2e flavour) on \`${coverage.database}\`: the dev seed plus ${stressCount} content stress pages (user content at the longest the forms accept)`,
		`- **Pages:** ${coverage.pages.length} pages over ${routes.size}${coverage.routesTotal ? ` of ${coverage.routesTotal}` : ""} page routes`,
		`- **Viewports:** ${coverage.viewports.join(", ")}${coverage.widths?.length ? `; widths ${coverage.widths.join(", ")}px` : ""}`,
		"- **Themes:** dark for everything, light for contrast",
		`- **Viewed as:** ${viewers.length} viewer${viewers.length === 1 ? "" : "s"} (${viewers.join(", ")}): 274 is the admin, a participant where a content stress page needs one`,
		`- **Language:** ${coverage.lang && coverage.lang !== "en" ? coverage.lang : "English"}`,
		...(coverage.counters
			? [`- **Counted along the way:** ${counterText(coverage.counters)}`]
			: []),
		"",
		"### Mechanical passes",
		"",
	);
	for (const pass of coverage.passes) {
		out.push(`- **${pass}:** ${PASSES[pass] ?? "(no description)"}`);
	}

	out.push("", "### Pages per feature", "");
	out.push(
		"| Feature | Pages | Content stress | Routes |",
		"| --- | --- | --- | --- |",
	);
	const byFeature = Map.groupBy(coverage.pages, (page) => page.feature);
	for (const [feature, pages] of [...byFeature].sort(
		(a, b) => b[1].length - a[1].length,
	)) {
		out.push(
			`| ${feature} | ${pages.length} | ${pages.filter((page) => page.stress).length || ""} | ${[...new Set(pages.map((page) => `\`${page.route}\``))].join(", ")} |`,
		);
	}

	out.push("", "### Looked at by hand", "");
	for (const note of notes) {
		if (!note.lookedAt?.length) continue;
		out.push(`**${text(note.area)}** (\`${note.reviewer}\`)`, "");
		for (const item of note.lookedAt) out.push(`- ${text(item)}`);
		out.push("");
	}

	out.push("### Every page", "");
	for (const [feature, pages] of [...byFeature].sort((a, b) =>
		a[0].localeCompare(b[0]),
	)) {
		out.push(`**${feature}**`, "");
		for (const page of pages) {
			out.push(
				`- \`${page.url}\`${page.viewer ? ` as ${page.viewer}` : ""}${page.stress ? `: ${text(page.stress)}` : ""}${page.scenario ? `: ${text(page.scenario)}` : ""}`,
			);
		}
		out.push("");
	}
	return out;
}

function notAuditedSection() {
	const out = ["## Not audited", ""];
	if (coverage) {
		if (coverage.unreached.length > 0) {
			out.push(
				`**Routes no page was found for** (${coverage.unreached.length}): ${coverage.unreached.map((route) => `\`${route}\``).join(", ")}`,
				"",
			);
		}
		if (coverage.skipped.length > 0) {
			out.push(
				`**Left out on purpose:** everything under ${coverage.skipped.map((prefix) => `\`${prefix}\``).join(", ")}`,
				"",
			);
		}
		if (coverage.broken.length > 0) {
			out.push(
				"**Linked pages that answered with an error** (so they were not audited either):",
				"",
			);
			for (const link of coverage.broken) {
				out.push(
					`- \`${link.url}\` answered ${link.status}${link.linkedFrom ? `, linked from \`${link.linkedFrom}\`` : ""}`,
				);
			}
			out.push("");
		}
		out.push("**Not varied in this run:**", "");
		if (coverage.viewportsNotRun.length > 0) {
			out.push(
				`- viewports ${coverage.viewportsNotRun.join(", ")}, and anything narrower than the mobile one`,
			);
		}
		const passesNotRun = Object.keys(PASSES).filter(
			(pass) => !coverage.passes.includes(pass),
		);
		if (passesNotRun.length > 0) {
			out.push(`- the passes ${passesNotRun.join(", ")}`);
		}
		if (!viewersOf(coverage).includes("logged out")) {
			out.push(
				"- logged out visitors (`crawl.mjs --as=anon`, `sweep.mjs --as=admin,anon`)",
			);
		}
		if (!coverage.lang || coverage.lang === "en") {
			out.push(
				"- languages other than English (`sweep.mjs --lang=longest` for the longest translations, `--lang=he` for right-to-left)",
			);
		}
		if (coverage.counters?.contrastNotMeasured > 0) {
			out.push(
				`- the contrast of ${coverage.counters.contrastNotMeasured} texts over pictures or gradients (more per page than the sweep samples)`,
			);
		}
		for (const item of NOT_VARIED) out.push(`- ${item}`);
		out.push("");
	}

	const withGaps = notes.filter((note) => note.notCovered?.length);
	if (withGaps.length > 0) {
		out.push("**What the reviewers could not check:**", "");
		for (const note of withGaps) {
			for (const item of note.notCovered) {
				out.push(`- ${text(item)} (\`${note.reviewer}\`)`);
			}
		}
		out.push("");
	}
	return out;
}

function decisionSection() {
	const withDecisions = notes.filter((note) => note.needsDecision?.length);
	if (withDecisions.length === 0) return [];
	const out = [
		"## Needs a decision",
		"",
		"Seen by a reviewer and left out of the findings because it may be on purpose.",
		"",
	];
	for (const note of withDecisions) {
		out.push(`**${text(note.area)}**`, "");
		for (const item of note.needsDecision) out.push(`- ${text(item)}`);
		out.push("");
	}
	return out;
}

function viewersOf(run) {
	return [...new Set(run.pages.map((page) => page.viewer ?? "logged out"))];
}

function counterText(counters) {
	const labels = {
		explored: "controls clicked in the explore pass",
		overlaysOpened: "overlays opened and probed",
		statesChanged: "clicks that changed the page and had it looked at again",
		writesBlocked: "clicks cut off because they would have written",
		exploredAway: "clicks that led to another page",
		contrastSampled: "texts over pictures measured by sampling pixels",
		contrastNotMeasured: "texts over pictures not measured",
		pageErrors: "pages a pass gave up on",
		loadErrors: "pages the load pass gave up on",
	};
	return Object.entries(counters)
		.filter(([name]) => labels[name])
		.map(([name, count]) => `${count} ${labels[name]}`)
		.join(", ");
}

function anchor(title) {
	return title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
