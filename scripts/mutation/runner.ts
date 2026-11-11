import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseSync } from "oxc-parser";
import { setup as ensureTestDb } from "../ensure-test-db.ts";
import { ROOT } from "../living-docs/ast.ts";
import {
	applyMutant,
	MODULE_SCOPE_ID,
	type Mutant,
	type MutationPlan,
} from "./mutants.ts";
import {
	type BaselineRun,
	type MutantRun,
	RUN_DESCRIPTOR_ENV,
} from "./run-descriptor.ts";
import type { TestCandidate } from "./test-selection.ts";

export interface Target {
	/** Repo relative. */
	file: string;
	source: string;
	plan: MutationPlan;
	candidates: TestCandidate[];
}

export type MutantStatus =
	| "caught"
	| "timeout"
	| "survived"
	| "noCoverage"
	| "ignored"
	| "error";

export interface MutantResult {
	mutant: Mutant;
	status: MutantStatus;
	/** The first failing test, when a test failure (not a timeout) caught the mutant. */
	killedBy: { file: string; test: string | null } | null;
	/** How many test files the mutant was run against. */
	testFileCount: number;
	/** How many test files execute the mutated function, more than `testFileCount` when capped. */
	coveringTestFileCount: number;
	durationMs: number;
}

export interface TargetResult {
	target: Target;
	/** Candidate test files that load the target, repo relative. */
	testFiles: string[];
	results: MutantResult[];
}

export interface AuditResult {
	targets: TargetResult[];
	/** Candidate test files failing against the unmutated source, left out of every run. */
	failingTestFiles: string[];
	baselineMs: number;
	mutantsMs: number;
}

interface Baseline {
	/** Test files (repo relative) by target index and scope id. */
	coverage: Map<number, Map<number, Set<string>>>;
	durations: Map<string, number>;
	failingTestFiles: string[];
	wallMs: number;
}

interface VitestJson {
	testResults: Array<{
		name: string;
		status: string;
		startTime: number;
		endTime: number;
		assertionResults: Array<{ fullName: string; status: string }>;
	}>;
}

const VITEST_BIN = path.join(ROOT, "node_modules/vitest/vitest.mjs");
const CONFIG_PATH = path.join(import.meta.dirname, "vitest.config.ts");
const MIN_TIMEOUT_MS = 20_000;
const TIMEOUT_FACTOR = 4;

/**
 * Runs the baseline (the unmutated, instrumented targets against every candidate test file) and
 * then one Vitest process per mutant against the test files that execute the mutated function.
 */
export async function runAudit({
	targets,
	concurrency,
	maxTestFiles,
	onBaselineDone,
	onMutantDone,
}: {
	targets: Target[];
	concurrency: number;
	/** Run a mutant against at most this many of the nearest test files, 0 for all of them. */
	maxTestFiles: number;
	onBaselineDone: (testFileCount: number, wallMs: number) => void;
	onMutantDone: (result: MutantResult) => void;
}): Promise<AuditResult> {
	assertMutantsParse(targets);
	ensureTestDb();

	const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mutation-"));
	const children = new Set<number>();
	const killChildren = () => {
		for (const pid of children) killProcessGroup(pid);
	};
	const onInterrupt = () => {
		killChildren();
		process.exit(130);
	};
	process.on("SIGINT", onInterrupt);

	try {
		const candidateFiles = [
			...new Set(
				targets.flatMap((target) => target.candidates.map((c) => c.file)),
			),
		];
		const baseline = await runBaseline({
			targets,
			testFiles: candidateFiles,
			workDir,
			children,
		});
		onBaselineDone(candidateFiles.length, baseline.wallMs);

		const mutantsStartedAt = performance.now();
		const targetResults: TargetResult[] = targets.map((target, index) => ({
			target,
			testFiles: [
				...(baseline.coverage.get(index)?.get(MODULE_SCOPE_ID) ?? []),
			].sort((a, b) => a.localeCompare(b)),
			results: [],
		}));

		const jobs = targets.flatMap((target, targetIndex) =>
			target.plan.mutants.map((mutant) => ({ target, targetIndex, mutant })),
		);
		let nextJob = 0;

		const work = async () => {
			for (let job = jobs[nextJob++]; job; job = jobs[nextJob++]) {
				const result = await runMutant({
					...job,
					baseline,
					maxTestFiles,
					workDir,
					children,
				});
				targetResults[job.targetIndex].results.push(result);
				onMutantDone(result);
			}
		};
		await Promise.all(Array.from({ length: concurrency }, work));

		for (const targetResult of targetResults) {
			targetResult.results.sort((a, b) => a.mutant.id - b.mutant.id);
		}

		return {
			targets: targetResults,
			failingTestFiles: baseline.failingTestFiles,
			baselineMs: baseline.wallMs,
			mutantsMs: performance.now() - mutantsStartedAt,
		};
	} finally {
		process.off("SIGINT", onInterrupt);
		killChildren();
		fs.rmSync(workDir, { recursive: true, force: true });
	}
}

async function runBaseline({
	targets,
	testFiles,
	workDir,
	children,
}: {
	targets: Target[];
	testFiles: string[];
	workDir: string;
	children: Set<number>;
}): Promise<Baseline> {
	const startedAt = performance.now();
	const coverageFile = path.join(workDir, "coverage.tsv");
	const outputFile = path.join(workDir, "baseline.json");
	fs.writeFileSync(coverageFile, "");

	const descriptor: BaselineRun = {
		mode: "baseline",
		moduleCacheDir: moduleCacheDir(workDir),
		targets: targets.map((target) => path.join(ROOT, target.file)),
		coverageFile,
	};
	const { output } = await runVitest({
		descriptor,
		descriptorPath: path.join(workDir, "baseline-run.json"),
		args: ["--reporter=json", `--outputFile=${outputFile}`, ...testFiles],
		timeoutMs: 30 * 60_000,
		children,
		captureOutput: true,
	});

	const json = readVitestJson(outputFile);
	if (!json) {
		throw new Error(`The baseline run produced no results:\n${output}`);
	}

	const durations = new Map<string, number>();
	const failingTestFiles: string[] = [];
	for (const testResult of json.testResults) {
		const file = path.relative(ROOT, testResult.name);
		durations.set(file, testResult.endTime - testResult.startTime);
		if (testResult.status !== "passed") failingTestFiles.push(file);
	}

	const failing = new Set(failingTestFiles);
	const coverage: Baseline["coverage"] = new Map();
	for (const line of fs.readFileSync(coverageFile, "utf8").split("\n")) {
		if (!line) continue;

		const [testFile, targetIndex, scopeId] = line.split("\t");
		const file = path.relative(ROOT, testFile);
		if (failing.has(file)) continue;

		const scopes = coverage.get(Number(targetIndex)) ?? new Map();
		const files = scopes.get(Number(scopeId)) ?? new Set();
		files.add(file);
		scopes.set(Number(scopeId), files);
		coverage.set(Number(targetIndex), scopes);
	}

	return {
		coverage,
		durations,
		failingTestFiles: failingTestFiles.sort((a, b) => a.localeCompare(b)),
		wallMs: performance.now() - startedAt,
	};
}

async function runMutant({
	target,
	targetIndex,
	mutant,
	baseline,
	maxTestFiles,
	workDir,
	children,
}: {
	target: Target;
	targetIndex: number;
	mutant: Mutant;
	baseline: Baseline;
	maxTestFiles: number;
	workDir: string;
	children: Set<number>;
}): Promise<MutantResult> {
	const base = {
		mutant,
		killedBy: null,
		testFileCount: 0,
		coveringTestFileCount: 0,
		durationMs: 0,
	};
	if (mutant.ignoredReason !== null) return { ...base, status: "ignored" };

	const distances = new Map(
		target.candidates.map((candidate) => [candidate.file, candidate.distance]),
	);
	const coveringTestFiles = [
		...(baseline.coverage.get(targetIndex)?.get(mutant.scopeId) ?? []),
	].sort(
		(a, b) =>
			distances.get(a)! - distances.get(b)! ||
			baseline.durations.get(a)! - baseline.durations.get(b)! ||
			a.localeCompare(b),
	);
	if (coveringTestFiles.length === 0) return { ...base, status: "noCoverage" };

	const testFiles =
		maxTestFiles > 0
			? coveringTestFiles.slice(0, maxTestFiles)
			: coveringTestFiles;

	const startedAt = performance.now();
	const runName = `${targetIndex}-${mutant.id}`;
	const outputFile = path.join(workDir, `${runName}.json`);
	const descriptor: MutantRun = {
		mode: "mutant",
		moduleCacheDir: moduleCacheDir(workDir),
		target: path.join(ROOT, target.file),
		start: mutant.start,
		end: mutant.end,
		replacement: mutant.replacement,
		testFiles: testFiles.map((file) => path.join(ROOT, file)),
	};
	const baselineMs = testFiles.reduce(
		(sum, file) => sum + (baseline.durations.get(file) ?? 0),
		0,
	);
	const { exitCode, timedOut } = await runVitest({
		descriptor,
		descriptorPath: path.join(workDir, `${runName}-run.json`),
		args: [
			"--bail=1",
			"--maxWorkers=1",
			"--reporter=json",
			`--outputFile=${outputFile}`,
			...testFiles,
		],
		timeoutMs: MIN_TIMEOUT_MS + TIMEOUT_FACTOR * baselineMs,
		children,
		captureOutput: false,
	});

	const json = readVitestJson(outputFile);
	fs.rmSync(outputFile, { force: true });
	const result = {
		...base,
		testFileCount: testFiles.length,
		coveringTestFileCount: coveringTestFiles.length,
		durationMs: performance.now() - startedAt,
	};

	if (timedOut) return { ...result, status: "timeout" };
	if (exitCode === 0) return { ...result, status: "survived" };
	// without results Vitest itself failed, which says nothing about the mutant
	if (!json) return { ...result, status: "error" };

	return { ...result, status: "caught", killedBy: firstFailure(json) };
}

function firstFailure(json: VitestJson) {
	const failedFile = json.testResults.find(
		(testResult) => testResult.status === "failed",
	);
	if (!failedFile) return null;

	return {
		file: path.relative(ROOT, failedFile.name),
		test:
			failedFile.assertionResults.find(
				(assertion) => assertion.status === "failed",
			)?.fullName ?? null,
	};
}

function runVitest({
	descriptor,
	descriptorPath,
	args,
	timeoutMs,
	children,
	captureOutput,
}: {
	descriptor: BaselineRun | MutantRun;
	descriptorPath: string;
	args: string[];
	timeoutMs: number;
	children: Set<number>;
	captureOutput: boolean;
}) {
	fs.writeFileSync(descriptorPath, JSON.stringify(descriptor));

	return new Promise<{
		exitCode: number | null;
		timedOut: boolean;
		output: string;
	}>((resolve, reject) => {
		const child = spawn(
			process.execPath,
			[VITEST_BIN, "run", "--config", CONFIG_PATH, ...args],
			{
				cwd: ROOT,
				// its own process group, so a timeout can take the test workers down with it
				detached: true,
				stdio: ["ignore", "ignore", captureOutput ? "pipe" : "ignore"],
				env: {
					...process.env,
					VITE_SITE_DOMAIN: "http://localhost:5173",
					[RUN_DESCRIPTOR_ENV]: descriptorPath,
				},
			},
		);
		const pid = child.pid;
		if (pid === undefined) {
			reject(new Error("Could not start Vitest"));
			return;
		}
		children.add(pid);

		let output = "";
		child.stderr?.on("data", (chunk) => {
			output += chunk;
		});

		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			killProcessGroup(pid);
		}, timeoutMs);

		child.on("error", reject);
		child.on("close", (exitCode) => {
			clearTimeout(timer);
			children.delete(pid);
			fs.rmSync(descriptorPath, { force: true });
			resolve({ exitCode, timedOut, output });
		});
	});
}

function moduleCacheDir(workDir: string) {
	return path.join(workDir, "module-cache");
}

function killProcessGroup(pid: number) {
	try {
		process.kill(-pid, "SIGKILL");
	} catch {
		// already gone
	}
}

function readVitestJson(file: string): VitestJson | null {
	try {
		return JSON.parse(fs.readFileSync(file, "utf8"));
	} catch {
		return null;
	}
}

/** A mutant that does not parse would fail every test and count as caught. */
function assertMutantsParse(targets: Target[]) {
	for (const target of targets) {
		for (const mutant of target.plan.mutants) {
			const { errors } = parseSync(
				target.file,
				applyMutant(target.source, mutant),
			);
			if (errors.length > 0) {
				throw new Error(
					`${target.file}:${mutant.line} mutant "${mutant.change}" does not parse: ${errors[0].message}`,
				);
			}
		}
	}
}
