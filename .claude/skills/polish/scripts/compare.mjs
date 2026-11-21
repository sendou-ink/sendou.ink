/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
// What changed between two runs: the mechanical findings that are new, the ones that are gone
// (fixed, when their pages were swept again) and the ones still there. Writes <run>/compare.json,
// which the report shows.
//
//   node .claude/skills/polish/scripts/compare.mjs --run=<the new run> --against=<the earlier run> [--rule=a,b]
//
// Findings are matched by their stable key (rule + component, class names without their build
// hash), so a rebuild or an edited stylesheet does not make everything look new. A run from before
// a change to how a rule keys its findings does: say so when reading the numbers.
import fs from "node:fs";
import path from "node:path";
import { loadMechanical, OUTPUT_DIR, parseArgs } from "./lib.mjs";

const { flags } = parseArgs();
if (!flags.run || !flags.against) {
	console.error(
		"Usage: compare.mjs --run=<new> --against=<earlier> [--rule=a,b]",
	);
	process.exit(1);
}
const rules = flags.rule ? String(flags.rule).split(",") : null;
const runDir = path.join(OUTPUT_DIR, String(flags.run));
const againstDir = path.join(OUTPUT_DIR, String(flags.against));

const now = load(runDir);
const before = load(againstDir);
const coverage = JSON.parse(
	fs.readFileSync(path.join(runDir, "coverage.json"), "utf8"),
);
const sweptPages = new Set(coverage.pages.map((page) => page.url));

const nowKeys = new Map(
	now.flatMap((finding) => keysOf(finding).map((key) => [key, finding])),
);
const beforeKeys = new Map(
	before.flatMap((finding) => keysOf(finding).map((key) => [key, finding])),
);
const matches = (finding, others) =>
	keysOf(finding).some((key) => others.has(key));

const fresh = now.filter((finding) => !matches(finding, beforeKeys));
const still = now.filter((finding) => matches(finding, beforeKeys));
const missing = before.filter((finding) => !matches(finding, nowKeys));
const gone = missing.filter((finding) =>
	finding.pages.some((page) => sweptPages.has(page)),
);
const notSwept = missing.filter((finding) => !gone.includes(finding));

const summary = { against: String(flags.against), byRule: {} };
const allRules = new Set([...now, ...before].map((finding) => finding.rule));
console.log(`${"rule".padEnd(26)}   new  gone  still  not swept again`);
for (const rule of [...allRules].sort((a, b) => a.localeCompare(b))) {
	const count = (list) =>
		list.filter((finding) => finding.rule === rule).length;
	summary.byRule[rule] = {
		new: count(fresh),
		gone: count(gone),
		still: count(still),
		notSwept: count(notSwept),
	};
	console.log(
		`${rule.padEnd(26)} ${String(count(fresh)).padStart(5)} ${String(count(gone)).padStart(5)} ${String(count(still)).padStart(6)} ${String(count(notSwept)).padStart(16)}`,
	);
}
console.log(
	`\n${fresh.length} new, ${gone.length} gone, ${still.length} still there, ${notSwept.length} on pages this run did not sweep`,
);

const brief = (finding) => ({
	id: finding.id,
	rule: finding.rule,
	url: finding.url,
	viewport: finding.viewport,
	detail: finding.detail.slice(0, 200),
	media: finding.media,
});
summary.new = fresh.map(brief);
summary.gone = gone.map(brief);
summary.totals = {
	new: fresh.length,
	gone: gone.length,
	still: still.length,
	notSwept: notSwept.length,
};
fs.writeFileSync(
	path.join(runDir, "compare.json"),
	JSON.stringify(summary, null, "\t"),
);

console.log("\nNew:");
for (const finding of fresh.slice(0, 60)) {
	console.log(
		`  ${finding.id} ${finding.rule} [${finding.viewport}] ${finding.url}: ${finding.detail.slice(0, 110)}`,
	);
}
if (fresh.length > 60)
	console.log(
		`  ... and ${fresh.length - 60} more (digest.mjs --run=${flags.run})`,
	);
console.log("\nGone:");
for (const finding of gone.slice(0, 60)) {
	console.log(
		`  ${finding.rule} [${finding.viewport}] ${finding.url}: ${finding.detail.slice(0, 110)}`,
	);
}

function load(dir) {
	return loadMechanical(dir).filter(
		(finding) => !rules || rules.includes(finding.rule),
	);
}

/** The exact stable key, and one without the source files: an earlier build's class names can't always be traced to one. */
function keysOf(finding) {
	return [finding.stableKey, finding.stableKey.replace(/@[\w/.-]+/g, "")];
}
