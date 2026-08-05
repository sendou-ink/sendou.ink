import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		name: "unit",
		include: ["**/*.test.{ts,tsx}"],
		exclude: [
			...configDefaults.exclude,
			"e2e/**",
			"**/*.browser.test.{ts,tsx}",
			// the scanner golden-file suite has its own heavy project (vitest.scanner.config.ts)
			"app/features/scanner/**",
		],
		setupFiles: ["./app/test-setup.ts"],
	},
	resolve: {
		tsconfigPaths: true,
	},
});
