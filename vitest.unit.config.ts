import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		name: "unit",
		include: ["**/*.test.{ts,tsx}"],
		exclude: [
			...configDefaults.exclude,
			"e2e/**",
			"**/*.browser.test.{ts,tsx}",
			// golden-file suites live in vitest.scanner.config.ts; tests/logic/ needs no fixtures so stays here
			"app/features/scanner/tests/*.test.{ts,tsx}",
		],
		setupFiles: ["./app/test-setup.ts"],
		// the scanner-ingest scenario suite's real ingest action is gated on Config.scannerEnabled
		env: {
			VITE_SCANNER_ENABLED: "true",
		},
	},
	resolve: {
		tsconfigPaths: true,
	},
});
