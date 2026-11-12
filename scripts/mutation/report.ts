/** biome-ignore-all lint/suspicious/noConsole: CLI script output */

import fs from "node:fs";
import path from "node:path";
import { styleText } from "node:util";
import { ROOT } from "../living-docs/ast.ts";
import { applyMutant, lineAt, lineStartsOf, type Mutant } from "./mutants.ts";
import type {
	AuditResult,
	MutantResult,
	MutantStatus,
	TargetResult,
} from "./runner.ts";

export interface Totals {
	mutants: number;
	caught: number;
	/** Part of `caught`: a run that took too long counts as noticed. */
	timedOut: number;
	survived: number;
	noCoverage: number;
	ignored: number;
	errors: number;
	/** Share of the mutants that were not ignored and got caught, 0 to 1. */
	score: number | null;
}

interface MutantReport {
	line: number;
	column: number;
	operator: Mutant["operator"];
	change: string;
	status: MutantStatus;
	/** Set for an ignored mutant. */
	ignoredReason?: string;
	/** Set for a caught mutant, the first test that failed. */
	killedBy?: { file: string; test: string | null };
	/** How many test files the mutant was run against. */
	testFiles: number;
	/** How many test files execute the function, more than `testFiles` when `--max-tests` cut the run short. */
	coveringTestFiles: number;
	/** Set unless caught or ignored: the lines around the mutant, before and after the change. */
	code?: { startLine: number; original: string[]; mutated: string[] };
}

interface FunctionReport {
	name: string;
	line: number;
	totals: Totals;
	mutants: MutantReport[];
}

interface TargetReport {
	target: string;
	totals: Totals;
	/** Test files that load the target and so were run against its mutants. */
	testFiles: string[];
	/** Candidate test files that fail without any mutant and were left out. */
	failingTestFiles: string[];
	functions: FunctionReport[];
}

export const REPORT_DIR = "scripts/output/mutation";

const CONTEXT_LINES = 2;
const MAX_PRINTED_LINES = 4;

/** Writes each target's JSON report and prints the survivors grouped by function. */
export function reportAudit(audit: AuditResult) {
	const reports = audit.targets.map((targetResult) =>
		targetReport(targetResult, audit.failingTestFiles),
	);

	fs.mkdirSync(path.join(ROOT, REPORT_DIR), { recursive: true });
	for (const report of reports) {
		printTargetReport(report);
		fs.writeFileSync(
			path.join(ROOT, reportPath(report.target)),
			`${JSON.stringify(report, null, "\t")}\n`,
		);
	}

	if (audit.failingTestFiles.length > 0) {
		console.log(
			styleText(
				"yellow",
				`\nLeft out, failing without any mutant:\n${audit.failingTestFiles.map((file) => `  ${file}`).join("\n")}`,
			),
		);
	}

	if (reports.length > 1) printSummaryTable(reports);

	console.log(
		styleText(
			"dim",
			`\nBaseline ${formatDuration(audit.baselineMs)}, mutants ${formatDuration(audit.mutantsMs)}. JSON ${reports.length > 1 ? "reports" : "report"} in ${reports.length > 1 ? REPORT_DIR : reportPath(reports[0].target)}`,
		),
	);
}

function reportPath(target: string) {
	return `${REPORT_DIR}/${target.replaceAll("/", "__")}.json`;
}

function targetReport(
	{ target, testFiles, results }: TargetResult,
	failingTestFiles: string[],
): TargetReport {
	const lineStarts = lineStartsOf(target.source);
	const sourceLines = target.source.split("\n");

	const mutantReport = (result: MutantResult): MutantReport => {
		const { mutant } = result;
		const report: MutantReport = {
			line: mutant.line,
			column: mutant.column,
			operator: mutant.operator,
			change: mutant.change,
			status: result.status,
			testFiles: result.testFileCount,
			coveringTestFiles: result.coveringTestFileCount,
		};
		if (mutant.ignoredReason !== null) {
			report.ignoredReason = mutant.ignoredReason;
		}
		if (result.killedBy) report.killedBy = result.killedBy;
		if (result.status === "caught" || result.status === "timeout") {
			return report;
		}
		if (result.status === "ignored") return report;

		const lastLine = lineAt(lineStarts, Math.max(mutant.start, mutant.end - 1));
		const mutatedLines = applyMutant(target.source, mutant).split("\n");
		const addedLines =
			mutant.replacement.split("\n").length -
			target.source.slice(mutant.start, mutant.end).split("\n").length;
		const from = Math.max(0, mutant.line - 1 - CONTEXT_LINES);
		report.code = {
			startLine: from + 1,
			original: sourceLines.slice(from, lastLine + CONTEXT_LINES),
			mutated: mutatedLines.slice(from, lastLine + addedLines + CONTEXT_LINES),
		};

		return report;
	};

	const functions = new Map<string, FunctionReport>();
	for (const result of results) {
		const key = `${result.mutant.functionLine}:${result.mutant.functionName}`;
		const fn = functions.get(key) ?? {
			name: result.mutant.functionName,
			line: result.mutant.functionLine,
			totals: totalsOf([]),
			mutants: [],
		};
		fn.mutants.push(mutantReport(result));
		functions.set(key, fn);
	}
	for (const fn of functions.values()) {
		fn.mutants.sort((a, b) => a.line - b.line || a.column - b.column);
	}

	return {
		target: target.file,
		totals: totalsOf(results.map((result) => result.status)),
		testFiles,
		failingTestFiles: failingTestFiles.filter((file) =>
			target.candidates.some((candidate) => candidate.file === file),
		),
		functions: [...functions.values()]
			.map((fn) => ({
				...fn,
				totals: totalsOf(fn.mutants.map((mutant) => mutant.status)),
			}))
			.sort((a, b) => a.line - b.line),
	};
}

function totalsOf(statuses: MutantStatus[]): Totals {
	const count = (status: MutantStatus) =>
		statuses.filter((candidate) => candidate === status).length;

	const timedOut = count("timeout");
	const caught = count("caught") + timedOut;
	const scored = caught + count("survived") + count("noCoverage");

	return {
		mutants: statuses.length,
		caught,
		timedOut,
		survived: count("survived"),
		noCoverage: count("noCoverage"),
		ignored: count("ignored"),
		errors: count("error"),
		score: scored === 0 ? null : caught / scored,
	};
}

function printTargetReport(report: TargetReport) {
	console.log(`\n${styleText("bold", report.target)}`);
	console.log(`  ${formatTotals(report.totals)}`);
	console.log(
		styleText(
			"dim",
			`  ${report.testFiles.length} test ${report.testFiles.length === 1 ? "file loads" : "files load"} it`,
		),
	);

	const cutShort = report.functions
		.flatMap((fn) => fn.mutants)
		.filter(
			(mutant) =>
				mutant.status === "survived" &&
				mutant.testFiles < mutant.coveringTestFiles,
		).length;
	if (cutShort > 0) {
		console.log(
			styleText(
				"dim",
				`  ${cutShort} of the survivors met only the nearest test files executing them, --max-tests 0 runs all`,
			),
		);
	}

	for (const fn of report.functions) {
		const open = fn.mutants.filter(
			(mutant) =>
				mutant.status === "survived" ||
				mutant.status === "noCoverage" ||
				mutant.status === "error",
		);
		if (open.length === 0) continue;

		console.log(
			`\n  ${styleText("cyan", fn.name)} ${styleText("dim", `line ${fn.line}, ${open.length} of ${fn.totals.mutants - fn.totals.ignored} not caught`)}`,
		);
		for (const mutant of open) printMutant(mutant);
	}
}

function printMutant(mutant: MutantReport) {
	const label =
		mutant.status === "noCoverage"
			? styleText("yellow", " (no test runs this function)")
			: mutant.status === "error"
				? styleText("red", " (Vitest failed to run)")
				: mutant.testFiles < mutant.coveringTestFiles
					? styleText(
							"dim",
							` (run against the nearest ${mutant.testFiles} of ${mutant.coveringTestFiles} test files)`,
						)
					: "";
	console.log(`    ${mutant.line}:${mutant.column}  ${mutant.change}${label}`);
	if (!mutant.code) return;

	const { original, mutated } = changedLines(mutant.code);
	for (const line of original) console.log(styleText("red", `      - ${line}`));
	for (const line of mutated) {
		console.log(styleText("green", `      + ${line}`));
	}
}

/** The lines a mutant changes, without the shared context and indentation around them. */
function changedLines(code: NonNullable<MutantReport["code"]>) {
	let shared = 0;
	while (
		shared < Math.min(code.original.length, code.mutated.length) &&
		code.original[shared] === code.mutated[shared]
	) {
		shared++;
	}
	let sharedEnd = 0;
	while (
		sharedEnd < Math.min(code.original.length, code.mutated.length) - shared &&
		code.original.at(-1 - sharedEnd) === code.mutated.at(-1 - sharedEnd)
	) {
		sharedEnd++;
	}

	const clip = (lines: string[]) => {
		const changed = lines
			.slice(shared, lines.length - sharedEnd)
			.map((line) => line.trim());

		return changed.length > MAX_PRINTED_LINES
			? [...changed.slice(0, MAX_PRINTED_LINES), "…"]
			: changed;
	};

	return { original: clip(code.original), mutated: clip(code.mutated) };
}

function printSummaryTable(reports: TargetReport[]) {
	const rows = reports.map((report) => [
		report.target,
		String(report.totals.mutants),
		String(report.totals.caught),
		String(report.totals.survived),
		String(report.totals.noCoverage),
		String(report.totals.ignored),
		formatScore(report.totals.score),
	]);
	const header = [
		"target",
		"mutants",
		"caught",
		"survived",
		"no coverage",
		"ignored",
		"score",
	];
	const widths = header.map((title, column) =>
		Math.max(title.length, ...rows.map((row) => row[column].length)),
	);
	const format = (row: string[]) =>
		row
			.map((cell, column) =>
				column === 0
					? cell.padEnd(widths[column])
					: cell.padStart(widths[column]),
			)
			.join("  ");

	console.log(`\n${styleText("bold", format(header))}`);
	for (const row of rows) console.log(format(row));
}

function formatTotals(totals: Totals) {
	const parts = [
		`${totals.mutants} mutants`,
		`${totals.caught} caught${totals.timedOut > 0 ? ` (${totals.timedOut} by timeout)` : ""}`,
		styleText(
			totals.survived > 0 ? "red" : "green",
			`${totals.survived} survived`,
		),
		styleText(
			totals.noCoverage > 0 ? "yellow" : "green",
			`${totals.noCoverage} without coverage`,
		),
	];
	if (totals.ignored > 0) parts.push(`${totals.ignored} ignored`);
	if (totals.errors > 0) {
		parts.push(styleText("red", `${totals.errors} failed to run`));
	}
	parts.push(`score ${formatScore(totals.score)}`);

	return parts.join(" · ");
}

function formatScore(score: number | null) {
	return score === null ? "-" : `${(score * 100).toFixed(1)}%`;
}

export function formatDuration(ms: number) {
	const seconds = Math.round(ms / 1000);

	return seconds < 60
		? `${seconds}s`
		: `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
