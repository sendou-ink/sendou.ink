import fs from "node:fs";

/** Path of the JSON file describing what a Vitest process started by the runner should do. */
export const RUN_DESCRIPTOR_ENV = "MUTATION_RUN";

interface SharedRun {
	/** Where Vitest keeps the transformed modules, so only the first process of a run pays for them. */
	moduleCacheDir: string;
}

export interface BaselineRun extends SharedRun {
	mode: "baseline";
	/** Absolute paths, a target's index is what its instrumented source reports hits with. */
	targets: string[];
	/** Appended to by `coverage-setup.ts`: `test file\ttarget index\tscope id` per line. */
	coverageFile: string;
}

export interface MutantRun extends SharedRun {
	mode: "mutant";
	/** Absolute path. */
	target: string;
	start: number;
	end: number;
	replacement: string;
	/** Absolute paths in the order to run them: the likeliest to fail first. */
	testFiles: string[];
}

export type RunDescriptor = BaselineRun | MutantRun;

export function readRunDescriptor(): RunDescriptor {
	const descriptorPath = process.env[RUN_DESCRIPTOR_ENV];
	if (!descriptorPath) {
		throw new Error(
			`${RUN_DESCRIPTOR_ENV} is not set, this config is only for \`pnpm mutate\``,
		);
	}

	return JSON.parse(fs.readFileSync(descriptorPath, "utf8"));
}
