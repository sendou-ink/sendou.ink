import { configDefaults, defineConfig } from "vitest/config";

// Scanner golden-file suite (OpenCV.js WASM + @napi-rs/canvas) over app/features/scanner/tests/fixtures.
// Out of the unit project to keep it fast and out of CI because the game icons come from a
// sibling sendou-ink/assets checkout; run locally with `pnpm test:scanner`. The fixture-free
// logic tests in app/features/scanner/tests/logic run in the unit project.
export default defineConfig({
	test: {
		name: "scanner",
		include: ["app/features/scanner/tests/*.test.{ts,tsx}"],
		exclude: [...configDefaults.exclude, "**/*.browser.test.{ts,tsx}"],
		// OpenCV WASM init takes seconds and the fixture sweeps are heavy
		testTimeout: 120_000,
		hookTimeout: 120_000,
	},
	resolve: {
		tsconfigPaths: true,
	},
});
