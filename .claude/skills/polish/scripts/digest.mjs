/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
// The mechanical findings of a run as compact text, for a reviewer to work through: the sweep's
// (ids m1, m2...) and what the probes saw during an e2e run (e1, e2...).
//
//   node .claude/skills/polish/scripts/digest.mjs [--run=run] [--feature=a,b] [--rule=a,b] [--url=<part>]
//        [--all]      also the findings an earlier run called intentional or a probe mistake
//        [--new]      only the findings no earlier run gave a verdict
//        [--census]   the sizes in use across the site instead (font sizes, weights, radii, gaps)
//
// Each finding says where it was seen:
//   [content stress only]   only on pages seeded with content at the form limits: real, but an extreme
//   [ordinary content]      also (or only) with the dev seed's everyday content: what visitors see now
import fs from "node:fs";
import path from "node:path";
import { loadMechanical, OUTPUT_DIR, parseArgs } from "./lib.mjs";

const QUIET_VERDICTS = ["intentional", "probe-mistake"];

const { flags } = parseArgs();
const runDir = path.join(OUTPUT_DIR, String(flags.run ?? "run"));
const features = flags.feature ? String(flags.feature).split(",") : null;
const rules = flags.rule ? String(flags.rule).split(",") : null;

if (flags.census) {
	printCensus();
	process.exit(0);
}

const all = loadMechanical(runDir).filter(
	(finding) =>
		(!features || features.includes(finding.feature)) &&
		(!rules || rules.includes(finding.rule)) &&
		(!flags.url ||
			finding.pages.some((url) => url.includes(String(flags.url)))),
);
const quiet = all.filter((finding) =>
	QUIET_VERDICTS.includes(finding.known?.verdict),
);
const findings = all.filter((finding) => {
	if (flags.new) return !finding.known;
	return flags.all || !QUIET_VERDICTS.includes(finding.known?.verdict);
});

const byRule = Map.groupBy(findings, (finding) => finding.rule);
for (const [rule, items] of [...byRule].sort(
	(a, b) => b[1].length - a[1].length,
)) {
	console.log(`\n## ${rule} (${items.length})`);
	for (const item of items.sort(byReach)) {
		const where = [
			`${item.viewport}/${item.theme}`,
			item.test ? "e2e" : item.viewer ? `as ${item.viewer}` : "logged out",
			item.lang && item.lang !== "en" ? item.lang : null,
		].filter(Boolean);
		console.log(
			`- ${item.id} [${where.join(" ")}] ${item.url}${item.pages.length > 1 ? ` (+${item.pages.length - 1} more pages, seen ${item.occurrences}x)` : ""} ${reach(item)}`,
		);
		if (item.known) {
			console.log(
				`    known: "${item.known.verdict}" in run ${item.known.run}${item.known.note ? ` (${item.known.note})` : ""}`,
			);
		}
		if (item.state) console.log(`    state: ${item.state}`);
		console.log(`    ${item.detail}`);
		if (item.text) console.log(`    text: "${item.text}"`);
		if (item.selector) console.log(`    at: ${item.selector}`);
		if (item.source?.length)
			console.log(`    source: ${item.source.join(", ")}`);
		if (item.widths?.length > 1)
			console.log(`    widths: ${widthRanges(item.widths)}`);
		if (item.viewers?.length > 1)
			console.log(`    seen by: ${item.viewers.join(", ")}`);
		if (item.steps?.length) console.log(`    steps: ${item.steps.join("  ")}`);
		if (item.stress) console.log(`    stressed: ${item.stress}`);
		if (item.scenario) console.log(`    scenario: ${item.scenario}`);
		for (const media of item.media)
			console.log(`    evidence: ${path.join(runDir, media)}`);
	}
}

const withVerdict = findings.filter((finding) => finding.known).length;
console.log(
	`\n${findings.length} mechanical findings${withVerdict > 0 ? `, ${findings.length - withVerdict} of them new (no verdict from an earlier run)` : ""}`,
);
if (!flags.all && !flags.new && quiet.length > 0) {
	console.log(
		`${quiet.length} more left out: an earlier run called them intentional or a probe mistake (--all shows them)`,
	);
}

/** Everyday content first, then by how many pages. */
function byReach(a, b) {
	return (
		(b.ordinaryPages ?? 0) - (a.ordinaryPages ?? 0) ||
		b.occurrences - a.occurrences
	);
}

function reach(item) {
	if (item.ordinaryPages === undefined) return "";
	if (item.ordinaryPages === 0) return "[content stress only]";
	return item.stressPages > 0
		? "[ordinary content, and content stress]"
		: "[ordinary content]";
}

function widthRanges(widths) {
	return `${widths[0]}-${widths.at(-1)}px (${widths.join(", ")})`;
}

function printCensus() {
	const file = path.join(runDir, "census.json");
	if (!fs.existsSync(file)) {
		console.log("No census.json in this run (the static pass writes it).");
		return;
	}
	const census = JSON.parse(fs.readFileSync(file, "utf8"));
	const units = { fontSize: "px", fontWeight: "", radius: "px", gap: "px" };
	for (const [kind, values] of Object.entries(census.values)) {
		console.log(`\n## ${kind} (${values.length} different values in use)`);
		for (const value of values) {
			console.log(
				`${String(value.value).padStart(7)}${units[kind]}  ${(value.token ?? "-").padEnd(18)} ${String(value.components).padStart(4)} components, ${String(value.pages).padStart(4)} pages${value.token ? "" : `   e.g. ${value.examples.slice(0, 2).join(", ")} on ${value.exampleUrl}`}`,
			);
		}
	}
	console.log(`\ncounters: ${JSON.stringify(census.counters)}`);
}
