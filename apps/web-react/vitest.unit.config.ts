import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		name: "unit",
		include: ["**/*.test.{ts,tsx}"],
		exclude: [
			...configDefaults.exclude,
			"e2e/**",
			"**/*.browser.test.{ts,tsx}",
			// the scanner golden-file suites have their own heavy project
			// (vitest.scanner.config.ts); tests/logic/ stays here because it is
			// pure logic over synthetic events and needs no image fixtures
			"app/features/scanner/tests/*.test.{ts,tsx}",
		],
		setupFiles: ["./app/test-setup.ts"],
		// the scanner-ingest scenario suite exercises the real ingest action,
		// whose gate reads Config.scannerEnabled from this variable
		env: {
			VITE_SCANNER_ENABLED: "true",
		},
	},
	resolve: {
		tsconfigPaths: true,
	},
});
