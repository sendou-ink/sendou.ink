import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vitest/config";
import { defineConfig, mergeConfig } from "vitest/config";
import { BaseSequencer, type TestSpecification } from "vitest/node";
import {
	MODULE_MOCKING_TEST_FILES,
	UNIT_TEST_GLOB,
	unitProjectConfig,
} from "../../vitest.unit.config.ts";
import { applyMutant, instrumentScopes, planMutations } from "./mutants.ts";
import { readRunDescriptor } from "./run-descriptor.ts";

// The config `pnpm mutate` runs Vitest with. The target file is never changed on disk: a plugin
// serves its instrumented (baseline) or mutated source instead. Leaving the root config out
// also skips its globalSetup, the runner ensures the test database once itself.

const ROOT = path.resolve(import.meta.dirname, "../..");
const run = readRunDescriptor();
const servedFiles = new Set(run.mode === "mutant" ? [run.target] : run.targets);
const experimental = {
	fsModuleCache: true,
	fsModuleCachePath: run.moduleCacheDir,
};

/** Runs the test files in the order the runner listed them. */
class ListedOrderSequencer extends BaseSequencer {
	override async sort(files: TestSpecification[]) {
		if (run.mode !== "mutant") return files;

		const order = new Map(run.testFiles.map((file, index) => [file, index]));
		const position = (file: TestSpecification) =>
			order.get(file.moduleId) ?? Number.POSITIVE_INFINITY;

		return [...files].sort((a, b) => position(a) - position(b));
	}
}

export default run.mode === "baseline"
	? withSourcePlugin(
			// isolated, so every test file loads the targets itself and gets its own coverage
			unitProjectConfig({
				name: "mutation-baseline",
				include: [UNIT_TEST_GLOB],
				exclude: [],
				isolate: true,
			}),
			[path.join(import.meta.dirname, "coverage-setup.ts")],
		)
	: defineConfig({
			test: {
				cache: false,
				experimental,
				sequence: { sequencer: ListedOrderSequencer },
				// the same split as the real suite
				projects: [
					withSourcePlugin(
						unitProjectConfig({
							name: "unit",
							include: [UNIT_TEST_GLOB],
							exclude: MODULE_MOCKING_TEST_FILES,
							isolate: false,
						}),
					),
					withSourcePlugin(
						unitProjectConfig({
							name: "unit-isolated",
							include: MODULE_MOCKING_TEST_FILES,
							exclude: [],
							isolate: true,
						}),
					),
				],
			},
		});

function withSourcePlugin(
	config: ReturnType<typeof unitProjectConfig>,
	extraSetupFiles: string[] = [],
) {
	return mergeConfig(
		{
			root: ROOT,
			plugins: [sourcePlugin()],
			test: {
				cache: false as const,
				experimental,
				setupFiles: extraSetupFiles,
			},
		},
		config,
	);
}

function sourcePlugin(): Plugin {
	return {
		name: "mutation-source",
		enforce: "pre",
		configureVitest({ experimental_defineCacheKeyGenerator }) {
			// the module cache is keyed by the file on disk, which is not what `load` serves
			experimental_defineCacheKeyGenerator(({ id }) =>
				servedFiles.has(id.split("?")[0]) ? false : undefined,
			);
		},
		load(id) {
			const file = id.split("?")[0];

			if (run.mode === "mutant") {
				if (file !== run.target) return null;

				return applyMutant(fs.readFileSync(file, "utf8"), run);
			}

			const targetIndex = run.targets.indexOf(file);
			if (targetIndex === -1) return null;

			const source = fs.readFileSync(file, "utf8");
			return instrumentScopes(source, planMutations(file, source), targetIndex);
		},
	};
}
