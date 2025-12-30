import type { PlaywrightTestConfig } from "@playwright/test";
import { devices } from "@playwright/test";

const WORKER_COUNT = Number(process.env.E2E_WORKERS) || 4;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
const config: PlaywrightTestConfig = {
	testDir: "./e2e",
	/* Maximum time one test can run for. */
	timeout: 30 * 1000,
	expect: {
		/**
		 * Maximum time expect() should wait for the condition to be met.
		 * For example in `await expect(locator).toHaveText();`
		 */
		timeout: 5000,
	},
	/* Run tests in files in parallel */
	fullyParallel: true,
	/* Fail the build on CI if you accidentally left test.only in the source code. */
	forbidOnly: !!process.env.CI,
	retries: 0,
	/* Number of parallel workers */
	workers: WORKER_COUNT,
	/* Reporter to use. See https://playwright.dev/docs/test-reporters */
	reporter: "list",
	/* Global setup and teardown for managing multiple server instances */
	globalSetup: "./e2e/global-setup.ts",
	globalTeardown: "./e2e/global-teardown.ts",
	/* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
	use: {
		/* Maximum time each action such as `click()` can take. Defaults to 0 (no limit). */
		actionTimeout: 0,
		/* Base URL will be set per-worker by the fixture */
		baseURL: "http://localhost:6173",

		trace: "retain-on-failure",

		permissions: ["clipboard-read"],
	},

	/* Configure projects for major browsers */
	projects: [
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
			},
		},

		// {
		//   name: "firefox",
		//   use: {
		//     ...devices["Desktop Firefox"],
		//   },
		// },

		// {
		//   name: "webkit",
		//   use: {
		//     ...devices["Desktop Safari"],
		//   },
		// },

		/* Test against mobile viewports. */
		// {
		//   name: 'Mobile Chrome',
		//   use: {
		//     ...devices['Pixel 5'],
		//   },
		// },
		// {
		//   name: 'Mobile Safari',
		//   use: {
		//     ...devices['iPhone 12'],
		//   },
		// },

		/* Test against branded browsers. */
		// {
		//   name: 'Microsoft Edge',
		//   use: {
		//     channel: 'msedge',
		//   },
		// },
		// {
		//   name: 'Google Chrome',
		//   use: {
		//     channel: 'chrome',
		//   },
		// },
	],

	/* Folder for test artifacts such as screenshots, videos, traces, etc. */
	// outputDir: 'test-results/',

	build: {
		external: ["**/*.json"],
	},
};

export default config;
