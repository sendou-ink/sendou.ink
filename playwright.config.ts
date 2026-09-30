import os from "node:os";
import type { PlaywrightTestConfig } from "@playwright/test";
import { devices } from "@playwright/test";

// app modules are imported by the test process itself (factories), and they read
// this flag at import time. Workers inherit it from this process.
process.env.VITE_E2E_TEST_RUN = "true";

const WORKER_COUNT =
	Number(process.env.E2E_WORKERS) ||
	Math.min(8, Math.max(4, os.cpus().length - 2));

const config: PlaywrightTestConfig = {
	testDir: "./e2e",
	timeout: 30 * 1000,
	expect: {
		timeout: 5000,
	},
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: 0,
	workers: WORKER_COUNT,
	reporter: "list",
	globalSetup: "./e2e/global-setup.ts",
	globalTeardown: "./e2e/global-teardown.ts",
	use: {
		actionTimeout: 0,
		/* overridden per-worker by the fixture */
		baseURL: "http://localhost:6173",

		// DOM snapshots are the expensive part of tracing (~17% of total test
		// time); failures still retain screenshots, network and action logs
		trace: { mode: "retain-on-failure", snapshots: false },

		// the app registers a push-notification service worker on every load;
		// tests never use it and each fresh context would install it again
		serviceWorkers: "block",

		permissions: ["clipboard-read", "clipboard-write"],
	},

	projects: [
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
			},
		},
	],

	build: {
		external: ["**/*.json"],
	},
};

export default config;
