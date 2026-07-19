import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		name: "unit",
		include: ["**/*.test.{ts,tsx}"],
		exclude: [
			...configDefaults.exclude,
			"e2e/**",
			"**/*.browser.test.{ts,tsx}",
			// the CV golden-file suite has its own heavy project (vitest.cv.config.ts)
			"app/features/cv/**",
		],
		setupFiles: ["./app/test-setup.ts"],
	},
	resolve: {
		tsconfigPaths: true,
	},
});
