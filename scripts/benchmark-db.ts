import { userAsyncLocalStorage } from "~/features/auth/core/user-context.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { logger } from "~/utils/logger";
import { roundToNDecimalPlaces } from "~/utils/number";
import { type BenchmarkCase, buildCases } from "./benchmark-db/cases";
import { resolveFixtures } from "./benchmark-db/fixtures";

const DEFAULT_ITERATIONS = 10;

interface CaseResult {
	name: string;
	min: number;
	mean: number;
	p95: number;
	error?: string;
}

async function main() {
	const { filter, iterations } = parseArgs(process.argv.slice(2));

	if (process.env.SQL_LOG && process.env.SQL_LOG !== "none") {
		logger.warn(
			"SQL_LOG is set which adds per-query logging overhead, consider unsetting it for accurate results",
		);
	}

	logger.info(`Resolving fixtures... (DB_PATH=${process.env.DB_PATH})`);
	const fixturesStart = performance.now();
	const fixtures = await resolveFixtures();
	logger.info(
		`Fixtures resolved in ${formatMs(performance.now() - fixturesStart)}`,
	);

	const { cases, skipped } = buildCases(fixtures);
	const filteredCases = filter
		? cases.filter((benchmarkCase) =>
				benchmarkCase.name.toLowerCase().includes(filter.toLowerCase()),
			)
		: cases;
	if (filteredCases.length === 0) {
		logger.error(`No benchmark cases match the filter "${filter}"`);
		process.exit(1);
	}

	logger.info(
		`Running ${filteredCases.length} cases with ${iterations} iterations each (1 warmup)`,
	);

	const actor = fixtures.heavyUser
		? await UserRepository.findLeanById(fixtures.heavyUser.id)
		: undefined;
	const results = await userAsyncLocalStorage.run(
		{ user: actor ?? undefined },
		() => runAll(filteredCases, iterations),
	);

	printResults(results, skipped);
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		logger.error("Benchmark failed", error);
		process.exit(1);
	});

function parseArgs(argv: string[]) {
	let filter: string | null = null;
	let iterations = DEFAULT_ITERATIONS;

	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--filter") {
			filter = argv[i + 1] ?? null;
		}
		if (argv[i] === "--iterations") {
			iterations = Number(argv[i + 1]);
		}
	}

	if (!Number.isInteger(iterations) || iterations < 1) {
		throw new Error("--iterations must be a positive integer");
	}

	return { filter, iterations };
}

async function runAll(cases: BenchmarkCase[], iterations: number) {
	const results: CaseResult[] = [];

	for (const [index, benchmarkCase] of cases.entries()) {
		const result = await benchmarkCase.run().then(
			() => timeCase(benchmarkCase, iterations),
			(error) => erroredResult(benchmarkCase.name, error),
		);
		results.push(result);

		const progress = `[${index + 1}/${cases.length}]`;
		if (result.error) {
			logger.warn(`${progress} ${result.name} ERRORED: ${result.error}`);
		} else {
			logger.info(`${progress} ${result.name} mean ${formatMs(result.mean)}`);
		}
	}

	return results;
}

async function timeCase(
	benchmarkCase: BenchmarkCase,
	iterations: number,
): Promise<CaseResult> {
	const durations: number[] = [];

	for (let i = 0; i < iterations; i++) {
		const start = performance.now();
		try {
			await benchmarkCase.run();
		} catch (error) {
			return erroredResult(benchmarkCase.name, error);
		}
		durations.push(performance.now() - start);
	}

	return { name: benchmarkCase.name, ...stats(durations) };
}

function erroredResult(name: string, error: unknown): CaseResult {
	return { name, min: 0, mean: 0, p95: 0, error: String(error) };
}

function stats(durations: number[]) {
	const sorted = [...durations].sort((a, b) => a - b);
	const mean = sorted.reduce((acc, cur) => acc + cur, 0) / sorted.length;
	const p95 =
		sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];

	return { min: sorted[0], mean, p95 };
}

function printResults(results: CaseResult[], skipped: string[]) {
	const rows = results
		.filter((result) => !result.error)
		.sort((a, b) => b.mean - a.mean);
	const errored = results.filter((result) => result.error);

	const nameWidth = Math.max(
		...rows.map((row) => row.name.length),
		"case".length,
	);

	logger.info("");
	logger.info("Results (sorted by mean, slowest first)");
	logger.info(
		`${"case".padEnd(nameWidth)}  ${"min".padStart(10)}  ${"mean".padStart(10)}  ${"p95".padStart(10)}`,
	);
	for (const row of rows) {
		logger.info(
			`${row.name.padEnd(nameWidth)}  ${formatMs(row.min).padStart(10)}  ${formatMs(row.mean).padStart(10)}  ${formatMs(row.p95).padStart(10)}`,
		);
	}

	if (skipped.length > 0) {
		logger.warn("");
		logger.warn(`Skipped ${skipped.length} cases (missing fixture):`);
		for (const name of skipped) {
			logger.warn(`  ${name}`);
		}
	}

	if (errored.length > 0) {
		logger.warn("");
		logger.warn(`${errored.length} cases errored:`);
		for (const result of errored) {
			logger.warn(`  ${result.name}: ${result.error}`);
		}
	}
}

function formatMs(ms: number) {
	return `${roundToNDecimalPlaces(ms)}ms`;
}
