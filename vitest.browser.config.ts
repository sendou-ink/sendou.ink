import { playwright } from "@vitest/browser-playwright";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

const headless = process.env.BROWSER_HEADLESS === "true";

export default defineConfig({
	plugins: [tsconfigPaths()],
	define: {
		"process.env.NODE_ENV": JSON.stringify("test"),
	},
	optimizeDeps: {
		include: [
			"react",
			"react/jsx-runtime",
			"react/jsx-dev-runtime",
			"react-dom",
			"react-dom/client",
			"react-router",
			"react-use-draggable-scroll",
		],
	},
	test: {
		name: "browser",
		include: ["**/*.browser.test.{ts,tsx}"],
		browser: {
			provider: playwright(),
			enabled: true,
			headless,
			instances: [{ browser: "chromium" }],
			expect: {
				toMatchScreenshot: {
					comparatorOptions: {
						threshold: 0.2,
						allowedMismatchedPixelRatio: 0.01,
					},
				},
			},
		},
		css: {
			include: /.+/,
		},
		setupFiles: ["./app/browser-test-setup.ts"],
	},
});
