/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
// Turns the reviewed findings of a run into task notes, one per section ("Polish: Layout shift",
// "Polish: Contrast"...), in the folder the task agent picks its work from. Each note carries the
// findings with their evidence (copied next to the notes, so they don't depend on the run folder)
// and how to reproduce and show a before/after for each.
//
//   node .claude/skills/polish/scripts/tasks.mjs --run=<name> --tasks=<folder of task notes>
//        [--skip=<part of a finding title>[,..]]   findings the user doesn't want fixed
//        [--note=<sentence>]                       added to every note, e.g. a page to leave alone
//        [--commit=<sha>]                          the commit the audit ran at, for the note
//        [--force]                                 overwrite notes that exist (they may hold a task agent's log)
import { execSync } from "node:child_process";
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

/** Gitignored already (`/scripts/output/*`). */
const SHOTS_DIR = "scripts/output/polish/shots";

const { flags } = parseArgs();
if (!flags.run || !flags.tasks) {
	console.error(
		"Usage: tasks.mjs --run=<name> --tasks=<folder of task notes> [--skip=..] [--commit=..] [--force]",
	);
	process.exit(1);
}

const run = String(flags.run);
const runDir = path.join(OUTPUT_DIR, run);
const tasksDir = path.resolve(String(flags.tasks));
const attachmentsDir = path.join(tasksDir, "attachments");
const skips = [flags.skip ?? []]
	.flat()
	.flatMap((value) => String(value).split(","))
	.map((value) => value.trim().toLowerCase())
	.filter(Boolean);
const commit =
	flags.commit ??
	execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();

const all = loadFindings(runDir);
const skipped = all.filter((finding) => isSkipped(finding));
const findings = all.filter((finding) => !isSkipped(finding));

fs.mkdirSync(attachmentsDir, { recursive: true });

for (const section of SECTION_TITLES) {
	const inSection = findings
		.filter((finding) => sectionOf(finding) === section)
		.sort(
			(a, b) =>
				(SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3),
		);
	if (inSection.length === 0) continue;

	const title = `Polish: ${section}`;
	const notePath = path.join(tasksDir, `${title}.md`);
	if (fs.existsSync(notePath) && !flags.force) {
		console.log(`exists, left alone: ${title}.md`);
		continue;
	}
	fs.writeFileSync(notePath, note(title, section, inSection));
	console.log(`${title}.md (${inSection.length} findings)`);
}

if (skipped.length > 0) {
	console.log(`\nLeft out (${skipped.length}):`);
	for (const finding of skipped) console.log(`  ${finding.title}`);
}

function isSkipped(finding) {
	const haystack = `${finding.title} ${finding.url}`.toLowerCase();
	return skips.some((skip) => haystack.includes(skip));
}

function note(title, section, inSection) {
	const slug = section.toLowerCase().replace(/[^a-z0-9]+/g, "-");
	const counts = ["high", "medium", "low"]
		.map((severity) => {
			const count = inSection.filter(
				(finding) => finding.severity === severity,
			).length;
			return count > 0 ? `${count} ${severity}` : null;
		})
		.filter(Boolean)
		.join(", ");

	const lines = [
		"---",
		"tags:",
		"  - sendou-ink",
		"  - design",
		"  - polish",
		"status: open",
		"---",
		"",
		`# ${title}`,
		"",
		`The polish audit reported these on ${run} at \`${commit}\` (${inSection.length} finding${inSection.length === 1 ? "" : "s"}: ${counts}), and the user wants them fixed. One task for the whole section: the findings share causes, fix a shared one once.`,
		"",
		...(flags.note ? [`> [!warning] ${flags.note}`, ""] : []),
		"## How to work on this",
		"",
		'The findings come from the polish skill (`.claude/skills/polish/`). Read its `SKILL.md` first, "Fixing findings" above all. In short:',
		"",
		"1. **Set up the audit's environment in your checkout.** `pnpm run polish:db` builds `db-polish.sqlite3` (the dev seed plus content at the form limits; the ids and URLs below are the same on every build). Then run `node .claude/skills/polish/scripts/server.mjs` in the background: the production build on that database, on its own port. Docker has to be up for the images.",
		`2. **Before touching code, take the "before" of every finding** with its reproduce line, into \`${SHOTS_DIR}/\` (gitignored). Add what makes the picture show the defect the way the audit's evidence below does: \`--crop=<selector>\` or \`--mark=<selector>\`, \`--do=hover:<selector>\`, \`--do=scroll:<y> --do=click:<selector> --layout-diff --gif\` for something that moves on a click, \`--throttle --video --shifts\` for a load shift. Look at the picture: the defect has to be visible in it. A finding that no longer reproduces gets reported as such, not fixed blind.`,
		"3. **Fix the cause**, in the component the finding names (verify it, the audit's \"likely fix\" is a lead, not the spec). CSS conventions of `AGENTS.md` apply: no `!important`, a shared component's variant lives in its own module.",
		'4. **Take the "after" with the exact same command** (only `-before` becomes `-after`). The server serves a build: restart it after changing code and it rebuilds. While iterating on overflow, contrast or hover the dev server is quicker, but the pair you show comes from the polish server, and layout shift only shows there. `--probe=overflow,horizontal-scroll,contrast` on the same line prints what the mechanical probes still see.',
		"5. **Show the user the before/after pair of every finding you fixed** when you report: the finding's number and title, then the two pictures. Also list every finding you did not fix and why. A fix without its pair is not done.",
		"6. **No changelog entries** for these (the user said so, this overrides `AGENTS.md`). `pnpm run checks` has to pass.",
		"",
		"Check each fix at the other viewport and with ordinary content too (`/u/sendou`, a seeded tournament): a fix for a 64 character name must not change how a normal one looks.",
		"",
		"## Problem / Context",
		"",
	];

	for (const [index, finding] of inSection.entries()) {
		const number = index + 1;
		const shot = `${SHOTS_DIR}/${slug}-${String(number).padStart(2, "0")}-before.png`;
		const where = [
			`\`${finding.url}\``,
			finding.viewport,
			finding.theme,
			finding.viewer ? `as user ${finding.viewer}` : null,
		].filter(Boolean);
		const otherPages = (finding.pages ?? []).filter(
			(page) =>
				page !== finding.url &&
				!skips.some((skip) => page.toLowerCase().includes(skip)),
		);

		lines.push(
			`### ${number}. ${text(finding.title)}`,
			"",
			`**${finding.severity}** · \`${finding.rule}\` · ${where.join(" · ")}`,
			"",
			text(finding.explanation.trim()),
			"",
		);
		if (otherPages.length > 0) {
			lines.push(
				`- **Also on:** ${otherPages.map((page) => `\`${page}\``).join(", ")}`,
			);
		}
		if (finding.source) lines.push(`- **Source:** ${text(finding.source)}`);
		if (finding.fix) lines.push(`- **Likely fix:** ${text(finding.fix)}`);
		lines.push(`- **Reproduce:** \`${reproduceCommand(finding, shot)}\``, "");

		for (const media of finding.media ?? []) {
			const file = path.isAbsolute(media) ? media : path.join(runDir, media);
			if (!fs.existsSync(file)) continue;
			const name = `polish-${run}-${path.basename(file)}`;
			fs.copyFileSync(file, path.join(attachmentsDir, name));
			lines.push(`![[${name}]]`, "");
		}
	}

	lines.push("## Fix direction", "");
	for (const [index, finding] of inSection.entries()) {
		lines.push(`- [ ] ${index + 1}. ${text(finding.title)}`);
	}
	lines.push(
		"- [ ] A before/after pair shown to the user for every finding fixed, taken with the same command",
		"- [ ] Findings not fixed are listed with the reason",
		"- [ ] No changelog entry; `pnpm run checks` passes",
		"",
		"## Original request",
		"",
		`Fix the "${section}" findings of the polish audit of ${run}. Show a before and after screenshot for each fixed finding. No changelog entries.`,
		"",
	);
	return lines.join("\n");
}
