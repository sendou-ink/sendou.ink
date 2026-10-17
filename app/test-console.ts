/** biome-ignore-all lint/suspicious/noConsole: holding back console output is the point */
/**
 * Preload for `bun test` keeping passing tests quiet, like Vitest's `--silent=passed-only`: console output is
 * held back and printed only for a test that failed (setup output of its file included). Test files get the
 * `test`/`it` of ./test-runner, which report how their test went. `TEST_LOGS=all` prints everything as it comes.
 */
import { afterAll, afterEach, beforeEach } from "bun:test";
import { plugin } from "bun";

const TEST_RUNNER_PATH = new URL("./test-runner.ts", import.meta.url).pathname;
const HELD_METHODS = ["log", "info", "warn", "error", "debug"] as const;

type HeldMethod = (typeof HELD_METHODS)[number];

const write = Object.fromEntries(
	HELD_METHODS.map((method) => [method, console[method].bind(console)]),
) as Record<HeldMethod, (...args: unknown[]) => void>;

let fileOutput: Array<[HeldMethod, unknown[]]> = [];
let testOutput: Array<[HeldMethod, unknown[]]> | null = null;
let testOutcome: "running" | "passed" | "failed" = "running";
let fileHasFailed = false;

plugin({
	name: "test-runner",
	setup(build) {
		build.onLoad({ filter: /\.test\.tsx?$/ }, async ({ path }) => ({
			contents: (await Bun.file(path).text()).replaceAll(
				'from "bun:test"',
				`from ${JSON.stringify(TEST_RUNNER_PATH)}`,
			),
			loader: path.endsWith("x") ? "tsx" : "ts",
		}));
	},
});

if (process.env.TEST_LOGS !== "all") {
	for (const method of HELD_METHODS) {
		console[method] = (...args: unknown[]) => {
			(testOutput ?? fileOutput).push([method, args]);
		};
	}
}

beforeEach(() => {
	testOutput = [];
	testOutcome = "running";
});

afterEach(() => {
	// still running means it timed out or a hook before it threw
	if (testOutcome === "running") printFailedTestOutput();
	testOutput = null;
});

afterAll(() => {
	if (fileHasFailed) print(fileOutput);
	fileOutput = [];
	fileHasFailed = false;
});

/** Records how the running test's body went, called by ./test-runner. A failure prints its output right away, ahead of the error. */
export function reportTestOutcome(outcome: "passed" | "failed") {
	testOutcome = outcome;
	if (outcome === "failed") printFailedTestOutput();
}

function printFailedTestOutput() {
	fileHasFailed = true;
	print(fileOutput);
	print(testOutput ?? []);
	fileOutput = [];
	testOutput = [];
}

function print(output: Array<[HeldMethod, unknown[]]>) {
	for (const [method, args] of output) {
		write[method](...args);
	}
}
