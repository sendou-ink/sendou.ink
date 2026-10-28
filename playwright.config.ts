import os from "node:os";
import type { PlaywrightTestConfig } from "@playwright/test";
import { devices } from "@playwright/test";

// app modules are imported by the test process itself (factories), and they read
// this flag at import time. Workers inherit it from this process.
process.env.VITE_E2E_TEST_RUN = "true";

const WORKER_COUNT =
	Number(process.env.E2E_WORKERS) ||
	Math.min(8, Math.max(4, os.cpus().length - 2));

const BLOCKED_HOSTS = [
	"fonts.googleapis.com",
	"fonts.gstatic.com",
	"youtube.com",
	"*.youtube.com",
];

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
		// `pnpm run docs:capture` keeps every trace for the living docs' storyboards
		trace: {
			mode: process.env.LIVING_DOCS_CAPTURE ? "on" : "retain-on-failure",
			snapshots: false,
		},

		// the app registers a push-notification service worker on every load;
		// tests never use it and each fresh context would install it again
		serviceWorkers: "block",

		permissions: ["clipboard-read", "clipboard-write"],

		launchOptions: {
			args: [
				// Google Fonts load with display=swap, so a font arriving mid-test
				// reflowed the page (e.g. re-collapsing the tournament nav between a
				// visibility check and a click), and a YouTube embed arriving closed
				// the select being filled in. Cut off at DNS rather than with routes,
				// which would turn off the browser's HTTP cache.
				`--host-resolver-rules=${BLOCKED_HOSTS.map((host) => `MAP ${host} ~NOTFOUND`).join(", ")}`,
			],
		},
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
