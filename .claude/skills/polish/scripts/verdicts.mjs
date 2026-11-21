/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
// What the reviewers said about every mechanical finding of a run, put together: how often each rule
// was right, which real ones nobody wrote up, and (with --save) the verdicts kept for the next run,
// which then only asks about what is new.
//
//   node .claude/skills/polish/scripts/verdicts.mjs --run=<name> [--save]
//
// Reads <run>/reviewed/<reviewer>.triage.json, a list of
//   { "id": "m12", "verdict": "real" | "intentional" | "probe-mistake" | "not-reproduced", "note": "why, in a few words" }
// and the `mechanical: ["m12", ..]` of the reviewed findings (a finding written up from a mechanical
// one makes it "real"). Writes <run>/triage.json. --save merges them into the skill's verdicts.json
// (checked in), keyed by the finding's stable key.
import fs from "node:fs";
import path from "node:path";
import {
	loadFindings,
	loadMechanical,
	loadVerdicts,
	OUTPUT_DIR,
	parseArgs,
	saveVerdicts,
	VERDICTS,
} from "./lib.mjs";

const { flags } = parseArgs();
if (!flags.run) {
	console.error("Usage: verdicts.mjs --run=<name> [--save]");
	process.exit(1);
}
const run = String(flags.run);
const runDir = path.join(OUTPUT_DIR, run);
const reviewedDir = path.join(runDir, "reviewed");

const mechanical = loadMechanical(runDir);
const byId = new Map(mechanical.map((finding) => [finding.id, finding]));

/** id -> { verdict, note, reviewer, writtenUp } */
const triage = new Map();
const problems = [];

for (const file of fs.existsSync(reviewedDir)
	? fs.readdirSync(reviewedDir)
	: []) {
	if (!file.endsWith(".triage.json")) continue;
	const reviewer = file.replace(/\.triage\.json$/, "");
	for (const entry of JSON.parse(
		fs.readFileSync(path.join(reviewedDir, file), "utf8"),
	)) {
		if (!byId.has(entry.id)) {
			problems.push(`${reviewer}: no mechanical finding ${entry.id}`);
			continue;
		}
		if (!VERDICTS.includes(entry.verdict)) {
			problems.push(
				`${reviewer}: ${entry.id} has the verdict "${entry.verdict}", not one of ${VERDICTS.join(", ")}`,
			);
			continue;
		}
		const earlier = triage.get(entry.id);
		if (earlier && earlier.verdict !== entry.verdict) {
			problems.push(
				`${entry.id}: "${earlier.verdict}" by ${earlier.reviewer}, "${entry.verdict}" by ${reviewer} (kept the first)`,
			);
			continue;
		}
		triage.set(entry.id, {
			verdict: entry.verdict,
			note: entry.note ?? "",
			reviewer,
			writtenUp: false,
		});
	}
}

for (const finding of fs.existsSync(reviewedDir) ? loadFindings(runDir) : []) {
	for (const id of finding.mechanical ?? []) {
		if (!byId.has(id)) {
			problems.push(
				`${finding.reviewer}: "${finding.title}" names ${id}, which is not a mechanical finding`,
			);
			continue;
		}
		const entry = triage.get(id);
		if (entry && entry.verdict !== "real") {
			problems.push(
				`${id} was written up as "${finding.title}" and called "${entry.verdict}" in a triage file (kept "real")`,
			);
		}
		triage.set(id, {
			verdict: "real",
			note: entry?.note || finding.title,
			reviewer: entry?.reviewer ?? finding.reviewer,
			writtenUp: true,
		});
	}
}

fs.writeFileSync(
	path.join(runDir, "triage.json"),
	JSON.stringify(
		Object.fromEntries(
			[...triage].map(([id, entry]) => [
				id,
				{
					...entry,
					rule: byId.get(id).rule,
					stableKey: byId.get(id).stableKey,
				},
			]),
		),
		null,
		"\t",
	),
);

console.log(
	`${triage.size} of ${mechanical.length} mechanical findings have a verdict\n`,
);
console.log(
	`${"rule".padEnd(26)} total  real  intentional  probe mistake  not reproduced  open  right`,
);
const byRule = Map.groupBy(mechanical, (finding) => finding.rule);
for (const [rule, items] of [...byRule].sort(
	(a, b) => b[1].length - a[1].length,
)) {
	const count = (verdict) =>
		items.filter((item) => triage.get(item.id)?.verdict === verdict).length;
	const judged = items.filter((item) => triage.has(item.id)).length;
	const real = count("real");
	// a probe is right when what it reports is there, whether or not it was meant to be
	const right = real + count("intentional");
	console.log(
		`${rule.padEnd(26)} ${String(items.length).padStart(5)} ${String(real).padStart(5)} ${String(count("intentional")).padStart(12)} ${String(count("probe-mistake")).padStart(14)} ${String(count("not-reproduced")).padStart(15)} ${String(items.length - judged).padStart(5)}  ${judged > 0 ? `${Math.round((right / judged) * 100)}%` : "-"}`,
	);
}

const unwritten = [...triage]
	.filter(([, entry]) => entry.verdict === "real" && !entry.writtenUp)
	.map(([id]) => byId.get(id));
if (unwritten.length > 0) {
	console.log(
		`\nReal, and in no reviewed finding (${unwritten.length}): the backlog a findings cap leaves behind`,
	);
	for (const finding of unwritten) {
		console.log(
			`  ${finding.id} ${finding.rule} ${finding.url}: ${finding.detail.slice(0, 120)}`,
		);
	}
}
if (problems.length > 0) {
	console.log(`\nTo sort out (${problems.length}):`);
	for (const problem of problems) console.log(`  ${problem}`);
}

if (flags.save) {
	const verdicts = loadVerdicts();
	for (const [id, entry] of triage) {
		const finding = byId.get(id);
		verdicts[finding.stableKey] = {
			verdict: entry.verdict,
			note: entry.note,
			run,
			rule: finding.rule,
			detail: finding.detail.slice(0, 140),
		};
	}
	saveVerdicts(verdicts);
	console.log(
		`\n${triage.size} verdicts saved to .claude/skills/polish/verdicts.json (${Object.keys(verdicts).length} in all)`,
	);
} else {
	console.log("\n--save keeps these verdicts for the next run.");
}
