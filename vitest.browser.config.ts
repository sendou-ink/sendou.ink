import { playwright } from "@vitest/browser-playwright";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

const headless = process.env.BROWSER_HEADLESS === "true";

export default defineConfig({
	plugins: [tsconfigPaths()],
	test: {
		name: "browser",
		include: ["**/*.browser.test.{ts,tsx}"],
		browser: {
			provider: playwright(),
			enabled: true,
			headless,
			instances: [{ browser: "chromium" }],
		},
		css: {
			include: /.+/,
		},
		setupFiles: ["./app/browser-test-setup.ts"],
	},
});
