import { configDefaults, defineConfig } from "vitest/config";

// Scanner golden-file suite: Node-side (OpenCV.js WASM + @napi-rs/canvas image
// IO), sweeping every fixture under app/features/scanner/tests/fixtures. Kept
// out of the unit project so `--project unit` stays fast.
export default defineConfig({
	test: {
		name: "scanner",
		include: ["app/features/scanner/**/*.test.{ts,tsx}"],
		exclude: [...configDefaults.exclude, "**/*.browser.test.{ts,tsx}"],
		// OpenCV WASM init takes seconds and the fixture sweeps are heavy
		testTimeout: 120_000,
		hookTimeout: 120_000,
	},
	resolve: {
		tsconfigPaths: true,
	},
});
