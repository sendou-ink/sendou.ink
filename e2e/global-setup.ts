import { type ChildProcess, execSync, spawn } from "node:child_process";
import fs from "node:fs";
import type { FullConfig } from "@playwright/test";
import { E2E_BASE_PORT } from "~/utils/playwright";

const WORKER_COUNT = Number(process.env.E2E_WORKERS) || 4;
const DEBUG = process.env.E2E_DEBUG === "true";
const SERVER_PROCESSES: ChildProcess[] = [];

declare global {
	var __E2E_SERVERS__: ChildProcess[];
}

function killProcessOnPort(port: number): void {
	try {
		// Try to find and kill any process on this port (macOS/Linux)
		execSync(`lsof -ti :${port} | xargs -r kill -9 2>/dev/null || true`, {
			stdio: "pipe",
		});
	} catch {
		// Ignore errors - port might already be free
	}
}

async function waitForServer(port: number, timeout = 120000): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		try {
			const response = await fetch(`http://localhost:${port}/`);
			if (response.ok || response.status === 404) {
				// 404 is fine - server is up, just no route at /
				return;
			}
		} catch {
			// Server not ready yet
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	throw new Error(`Server on port ${port} did not start within ${timeout}ms`);
}

async function globalSetup(_config: FullConfig) {
	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log(`\nStarting e2e test setup with ${WORKER_COUNT} workers...`);

	// Build the app once with E2E test flag so VITE_E2E_TEST_RUN is embedded
	// Use port 6173 as the base - tests will rewrite URLs as needed
	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log("Building the application...");
	execSync("npm run build", {
		stdio: "inherit",
		env: {
			...process.env,
			VITE_E2E_TEST_RUN: "true",
			VITE_SITE_DOMAIN: `http://localhost:${E2E_BASE_PORT}`,
		},
	});

	// Prepare databases and start servers for each worker
	const serverPromises: Promise<void>[] = [];

	// Kill any existing processes on our ports before starting
	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log("Cleaning up any existing processes on e2e ports...");
	for (let i = 0; i < WORKER_COUNT; i++) {
		killProcessOnPort(E2E_BASE_PORT + i);
	}
	// Wait briefly for ports to be released
	await new Promise((resolve) => setTimeout(resolve, 500));

	for (let i = 0; i < WORKER_COUNT; i++) {
		const port = E2E_BASE_PORT + i;
		const dbPath = `db-test-e2e-${i}.sqlite3`;

		// Ensure database exists with migrations
		if (!fs.existsSync(dbPath)) {
			// biome-ignore lint/suspicious/noConsole: CLI script output
			console.log(`Setting up database for worker ${i}: ${dbPath}`);
			execSync(`DB_PATH=${dbPath} npm run migrate up`, { stdio: "inherit" });
		}

		// Start server
		// biome-ignore lint/suspicious/noConsole: CLI script output
		console.log(`Starting server for worker ${i} on port ${port}...`);
		const serverProcess = spawn("npm", ["start"], {
			env: {
				...process.env,
				DB_PATH: dbPath,
				PORT: String(port),
				DISCORD_CLIENT_ID: "123",
				DISCORD_CLIENT_SECRET: "secret",
				SESSION_SECRET: "secret",
				VITE_SITE_DOMAIN: `http://localhost:${port}`,
				VITE_E2E_TEST_RUN: "true",
			},
			detached: false,
		});

		SERVER_PROCESSES.push(serverProcess);

		if (DEBUG) {
			serverProcess.stdout?.on("data", (data) => {
				// biome-ignore lint/suspicious/noConsole: CLI script output
				console.log(`[Worker ${i}] ${data.toString()}`);
			});

			serverProcess.stderr?.on("data", (data) => {
				// biome-ignore lint/suspicious/noConsole: CLI script output
				console.error(`[Worker ${i} ERROR] ${data.toString()}`);
			});
		}

		serverPromises.push(
			waitForServer(port).then(() => {
				// biome-ignore lint/suspicious/noConsole: CLI script output
				console.log(`Server for worker ${i} is ready on port ${port}`);
			}),
		);
	}

	// Wait for all servers to be ready
	await Promise.all(serverPromises);

	// Store server processes globally for teardown
	global.__E2E_SERVERS__ = SERVER_PROCESSES;

	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log("\nAll servers started successfully!\n");
}

export default globalSetup;
