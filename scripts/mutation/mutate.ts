/** biome-ignore-all lint/suspicious/noConsole: CLI script output */

// Mutation testing on demand: breaks a source file one small change at a time and lists the
// changes no unit test notices. See docs/site/src/content/docs/dev/mutation-testing.mdx

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs, styleText } from "node:util";
import { ROOT } from "../living-docs/ast.ts";
import { planMutations } from "./mutants.ts";
import { formatDuration, reportAudit } from "./report.ts";
import { type MutantResult, runAudit, type Target } from "./runner.ts";
import { RECOMMENDED_TARGETS } from "./targets.ts";
import {
	importerGraph,
	isUnitTestFile,
	testCandidatesOf,
} from "./test-selection.ts";

const DEFAULT_MAX_TEST_FILES = 20;

const USAGE = `Usage: pnpm mutate <source file or directory...> [test files...]
       pnpm mutate --recommended

Changes the source one small step at a time (a mutant) and runs the unit tests that execute the
changed function. A mutant no test notices is a gap. Nothing is written to the working tree.

Without test files the ones importing the source, directly or through other modules, are used.

Options:
  --recommended      mutate every recommended target
  --list             print the recommended targets
  --lines <ranges>   only the mutants on these lines, e.g. --lines 120-180,231
  --max-tests <n>    run a mutant against at most the n nearest test files executing its
                     function, 0 for all of them (default: ${DEFAULT_MAX_TEST_FILES})
  --concurrency <n>  Vitest processes at a time (default: cores - 2)`;

const { values: options, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		recommended: { type: "boolean", default: false },
		list: { type: "boolean", default: false },
		lines: { type: "string" },
		"max-tests": { type: "string" },
		concurrency: { type: "string" },
		help: { type: "boolean", short: "h", default: false },
	},
});

if (options.list) {
	console.log(RECOMMENDED_TARGETS.join("\n"));
	process.exit(0);
}

const paths = positionals.map((positional) =>
	path.relative(ROOT, path.resolve(positional)),
);
const explicitTestFiles = paths.filter(isUnitTestFile);
const sourcePaths = [
	...(options.recommended ? RECOMMENDED_TARGETS : []),
	...paths.filter((file) => !isUnitTestFile(file)),
];

if (options.help || sourcePaths.length === 0) {
	console.log(USAGE);
	process.exit(options.help ? 0 : 1);
}

const lineRanges = parseLineRanges(options.lines);
const concurrency = options.concurrency
	? Number(options.concurrency)
	: Math.max(1, os.availableParallelism() - 2);
if (!Number.isInteger(concurrency) || concurrency < 1) {
	fail(`--concurrency takes a positive integer, got "${options.concurrency}"`);
}
const maxTestFiles = options["max-tests"]
	? Number(options["max-tests"])
	: DEFAULT_MAX_TEST_FILES;
if (!Number.isInteger(maxTestFiles) || maxTestFiles < 0) {
	fail(
		`--max-tests takes 0 or a positive integer, got "${options["max-tests"]}"`,
	);
}

const targets = planTargets();
const mutantCount = targets.reduce(
	(sum, target) => sum + target.plan.mutants.length,
	0,
);
if (mutantCount === 0) fail("Nothing to mutate in the given sources");

console.log(
	`${mutantCount} mutants in ${targets.length} ${targets.length === 1 ? "file" : "files"}, running the baseline…`,
);

const progress = { done: 0, caught: 0, survived: 0, noCoverage: 0 };
const audit = await runAudit({
	targets,
	concurrency,
	maxTestFiles,
	onBaselineDone: (testFileCount, wallMs) => {
		console.log(
			`Baseline of ${testFileCount} test files took ${formatDuration(wallMs)}, running mutants ${concurrency} at a time…`,
		);
	},
	onMutantDone: printProgress,
});
if (process.stdout.isTTY) process.stdout.write("\n");

reportAudit(audit);

function planTargets(): Target[] {
	const graph = explicitTestFiles.length > 0 ? null : importerGraph();

	return sourceFilesOf(sourcePaths)
		.map((file) => {
			const source = fs.readFileSync(path.join(ROOT, file), "utf8");
			const plan = planMutations(file, source);

			return {
				file,
				source,
				plan: {
					...plan,
					mutants: plan.mutants.filter(
						(mutant) =>
							!lineRanges ||
							lineRanges.some(
								(range) => mutant.line >= range.from && mutant.line <= range.to,
							),
					),
				},
				candidates: graph
					? testCandidatesOf(file, graph)
					: explicitTestFiles.map((testFile) => ({
							file: testFile,
							distance: 1,
						})),
			};
		})
		.filter((target) => target.plan.mutants.length > 0);
}

/** The given files plus every non-test source file of the given directories. */
function sourceFilesOf(sources: string[]) {
	const files = new Set<string>();

	for (const source of sources) {
		const absolute = path.join(ROOT, source);
		if (!fs.existsSync(absolute)) fail(`${source} does not exist`);

		if (!fs.statSync(absolute).isDirectory()) {
			files.add(source);
			continue;
		}

		const entries = fs.readdirSync(absolute, {
			recursive: true,
			withFileTypes: true,
		});
		for (const entry of entries) {
			const file = path.relative(ROOT, path.join(entry.parentPath, entry.name));
			if (entry.isFile() && isMutableSource(file)) files.add(file);
		}
	}

	return [...files].sort((a, b) => a.localeCompare(b));
}

function isMutableSource(file: string) {
	return (
		/\.tsx?$/.test(file) &&
		!file.endsWith(".d.ts") &&
		!/\.test\.tsx?$/.test(file) &&
		!file.split("/").includes("tests") &&
		!file.endsWith("test-utils.ts")
	);
}

function parseLineRanges(lines: string | undefined) {
	if (lines === undefined) return null;

	return lines.split(",").map((range) => {
		const match = range.match(/^(\d+)(?:-(\d+))?$/);
		if (!match) {
			fail(`--lines takes lines and ranges like 120-180,231, got "${lines}"`);
		}

		return { from: Number(match[1]), to: Number(match[2] ?? match[1]) };
	});
}

function printProgress(result: MutantResult) {
	progress.done++;
	if (result.status === "caught" || result.status === "timeout") {
		progress.caught++;
	} else if (result.status === "survived") progress.survived++;
	else if (result.status === "noCoverage") progress.noCoverage++;

	const line = `${progress.done}/${mutantCount} · ${progress.caught} caught · ${progress.survived} survived · ${progress.noCoverage} without coverage`;
	if (process.stdout.isTTY) process.stdout.write(`\r${line}`);
	else if (progress.done % 100 === 0 || progress.done === mutantCount) {
		console.log(line);
	}
}

function fail(message: string): never {
	console.error(styleText("red", message));
	process.exit(1);
}
