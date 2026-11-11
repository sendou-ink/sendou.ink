import fs from "node:fs";
import { configDefaults, defineConfig } from "vitest/config";

export const UNIT_TEST_GLOB = "**/*.test.{ts,tsx}";

const UNIT_TEST_EXCLUDE = [
	...configDefaults.exclude,
	"e2e/**",
	"**/*.browser.test.{ts,tsx}",
	// golden-file suites live in vitest.scanner.config.ts; tests/logic/ needs no fixtures so stays here
	"app/features/scanner/tests/*.test.{ts,tsx}",
];

/**
 * Test files that replace modules with `vi.mock`. With the module cache shared across files
 * a mock would leak into (or miss) other files, so these run in the isolated project of
 * `vitest.unit-isolated.config.ts` instead.
 */
export const MODULE_MOCKING_TEST_FILES = fs
	.globSync(UNIT_TEST_GLOB, {
		exclude: (file) =>
			file === "node_modules" || file === ".git" || file === "build",
	})
	.filter((file) => !file.includes(".browser.test."))
	.filter((file) =>
		/\bvi\.(mock|doMock)\(/.test(fs.readFileSync(file, "utf8")),
	);

/** Config shared by the unit and unit-isolated projects. */
export function unitProjectConfig({
	name,
	include,
	exclude,
	isolate,
}: {
	name: string;
	include: string[];
	exclude: string[];
	isolate: boolean;
}) {
	return defineConfig({
		define: {
			__GIT_COMMIT__: JSON.stringify(""),
		},
		test: {
			name,
			include,
			exclude: [...UNIT_TEST_EXCLUDE, ...exclude],
			setupFiles: ["./app/test-setup.ts"],
			// re-evaluating every file's module graph took ~85% of the run, so files share the cache
			isolate,
			restoreMocks: true,
			unstubEnvs: true,
			unstubGlobals: true,
		},
		resolve: {
			tsconfigPaths: true,
		},
	});
}

export default unitProjectConfig({
	name: "unit",
	include: [UNIT_TEST_GLOB],
	exclude: MODULE_MOCKING_TEST_FILES,
	isolate: false,
});
