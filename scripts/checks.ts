/** biome-ignore-all lint/suspicious/noConsole: CLI script output */

// `pnpm run checks`: runs the steps that write files one by one, then every read-only check at
// once. A check's output is held back and only printed when it fails

import { spawn } from "node:child_process";
import { styleText } from "node:util";

/** Run in order before the checks, they rewrite files the checks read. */
const WRITING_STEPS: Check[] = [
	{ name: "biome", command: "pnpm run biome:fix" },
	{ name: "translation jsons", command: "pnpm run check-translation-jsons" },
	{ name: "route types", command: "react-router typegen" },
];

/** Run in parallel, none of them writes a file another one reads. */
const CHECKS: Check[] = [
	{ name: "unit & browser tests", command: "pnpm run test:unit:browser" },
	{ name: "typecheck", command: "tsc --noEmit" },
	{
		name: "docs site",
		// the build generates the content types the docs type check reads
		command: "pnpm run docs:build && tsc --noEmit -p docs/site",
	},
	{ name: "knip", command: "pnpm run knip" },
	{
		name: "translations & css vars",
		command: [
			"pnpm run check-plural-collapse",
			"pnpm run check-translation-sync",
			"pnpm run check-unused-translations",
			"pnpm run check-css-vars",
		].join(" && "),
	},
];

interface Check {
	name: string;
	command: string;
}

interface CheckResult extends Check {
	ok: boolean;
	output: string;
}

const startedAt = performance.now();

for (const step of WRITING_STEPS) {
	const result = await run(step);
	if (!result.ok) {
		printFailure(result);
		process.exit(1);
	}
}

const results = await Promise.all(CHECKS.map(run));
const failed = results.filter((result) => !result.ok);

for (const result of failed) {
	printFailure(result);
}

console.log(
	failed.length === 0
		? styleText("green", `All checks passed in ${seconds(startedAt)}`)
		: styleText(
				"red",
				`${failed.length} of ${CHECKS.length + WRITING_STEPS.length} checks failed: ${failed.map((result) => result.name).join(", ")}`,
			),
);
process.exit(failed.length === 0 ? 0 : 1);

function run(check: Check): Promise<CheckResult> {
	const checkStartedAt = performance.now();
	const child = spawn(check.command, {
		shell: true,
		env: { ...process.env, FORCE_COLOR: "1" },
		stdio: ["ignore", "pipe", "pipe"],
	});

	let output = "";
	child.stdout.on("data", (chunk) => {
		output += chunk;
	});
	child.stderr.on("data", (chunk) => {
		output += chunk;
	});

	return new Promise((resolve) => {
		child.on("close", (code) => {
			const ok = code === 0;
			console.log(
				`${ok ? styleText("green", "✓") : styleText("red", "✗")} ${check.name} ${styleText("dim", seconds(checkStartedAt))}`,
			);
			resolve({ ...check, ok, output });
		});
	});
}

function printFailure(result: CheckResult) {
	console.log(
		`\n${styleText(["red", "bold"], `── ${result.name} failed (${result.command}) ──`)}\n`,
	);
	console.log(result.output.trimEnd());
	console.log();
}

function seconds(since: number) {
	return `${((performance.now() - since) / 1000).toFixed(1)}s`;
}
