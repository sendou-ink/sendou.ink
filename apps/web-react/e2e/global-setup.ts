import { type ChildProcess, execSync, spawn } from "node:child_process";
import fs from "node:fs";
import type { FullConfig } from "@playwright/test";
import { ensureE2eBuild } from "../scripts/ensure-e2e-build";
import { ensureMigratedDb } from "../scripts/ensure-test-db";
import {
	E2E_BASE_PORT,
	e2eWebhookPort,
	e2eWorkerPort,
} from "./helpers/playwright";

const DEBUG = process.env.E2E_DEBUG === "true";
/** `E2E_TARGET_APP=web` serves `apps/web` (the SvelteKit app) instead of this
 * React app, for running migrated specs against the other side of the
 * migration (`svelte-big-bang.md`). Factories keep writing through this app's
 * code either way — the database files are shared. */
const TARGET_APP = process.env.E2E_TARGET_APP === "web" ? "web" : "web-react";
const WEB_APP_DIR = new URL("../../web", import.meta.url).pathname;
const SERVER_PROCESSES: ChildProcess[] = [];
const MINIO_MARKER_FILE = ".e2e-minio-started";
const STORAGE_BUCKET = "sendou";
/** Anonymously listable only once the bucket exists and its public policy is set. */
const MINIO_BUCKET_URL = `http://127.0.0.1:9000/${STORAGE_BUCKET}/`;

declare global {
	var __E2E_SERVERS__: ChildProcess[];
}

/**
 * Whether the image storage is usable, which takes more than MinIO answering its health check:
 * the container bootstraps the bucket only after startup, and a run whose bucket never got created
 * would otherwise fail deep inside the one test that uploads an image (`art.spec.ts`) with an
 * opaque 500.
 */
async function isMinioBucketReady(): Promise<boolean> {
	try {
		const response = await fetch(MINIO_BUCKET_URL);
		return response.ok;
	} catch {
		return false;
	}
}

async function waitForMinio(timeout = 60000): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		if (await isMinioBucketReady()) {
			return true;
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	return false;
}

async function ensureMinioRunning(): Promise<boolean> {
	// Check if MinIO is already running
	if (await isMinioBucketReady()) {
		// biome-ignore lint/suspicious/noConsole: CLI script output
		console.log("MinIO is already running");
		return false;
	}

	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log("Starting MinIO...");
	execSync("docker compose up -d minio", { stdio: "inherit" });

	const isReady = await waitForMinio();
	if (!isReady) {
		throw new Error(
			`MinIO did not become usable within timeout (${MINIO_BUCKET_URL} never answered OK). If MinIO is running, its "${STORAGE_BUCKET}" bucket is missing or not public — recreate the container with "docker compose up -d --force-recreate minio".`,
		);
	}

	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log("MinIO is ready");

	fs.writeFileSync(MINIO_MARKER_FILE, "");
	return true;
}

/** Kills anything listening on the port range, returning whether something was killed. */
function killProcessesOnPorts(firstPort: number, lastPort: number): boolean {
	try {
		const pids = execSync(`lsof -ti :${firstPort}-${lastPort} || true`, {
			stdio: "pipe",
		})
			.toString()
			.trim();
		if (pids === "") return false;

		execSync(`kill -9 ${pids.split("\n").join(" ")} 2>/dev/null || true`, {
			stdio: "pipe",
		});
		return true;
	} catch {
		return false;
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
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(`Server on port ${port} did not start within ${timeout}ms`);
}

async function globalSetup(config: FullConfig) {
	const workerCount = config.workers;

	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log(`\nStarting e2e test setup with ${workerCount} workers...`);

	// Start MinIO if not already running
	await ensureMinioRunning();

	// Build the app once with E2E test flag so VITE_E2E_TEST_RUN is embedded
	// Use port 6173 as the base - tests will rewrite URLs as needed
	const { reused } = ensureE2eBuild(`http://localhost:${E2E_BASE_PORT}`);
	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log(
		reused
			? "Reusing existing build (no source changes since last e2e build)"
			: "Built the application",
	);

	if (TARGET_APP === "web") {
		// biome-ignore lint/suspicious/noConsole: CLI script output
		console.log("Building apps/web (E2E_TARGET_APP=web)...");
		execSync("pnpm run build", {
			stdio: "inherit",
			cwd: WEB_APP_DIR,
			env: {
				...process.env,
				NODE_ENV: "production",
				VITE_E2E_TEST_RUN: "true",
				VITE_SITE_DOMAIN: `http://localhost:${E2E_BASE_PORT}`,
			},
		});
	}

	// Prepare databases and start servers for each worker
	const serverPromises: Promise<void>[] = [];

	// Kill any existing processes on our ports before starting; sweep beyond the
	// current worker count so leftovers from a run with more workers also die
	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log("Cleaning up any existing processes on e2e ports...");
	const killedSomething = killProcessesOnPorts(
		E2E_BASE_PORT,
		e2eWorkerPort(Math.max(workerCount, 8) - 1),
	);
	if (killedSomething) {
		// Wait briefly for ports to be released
		await new Promise((resolve) => setTimeout(resolve, 500));
	}

	for (let i = 0; i < workerCount; i++) {
		const port = e2eWorkerPort(i);
		const dbPath = `db-test-e2e-${i}.sqlite3`;

		ensureMigratedDb(dbPath);

		// Start server
		// biome-ignore lint/suspicious/noConsole: CLI script output
		console.log(`Starting server for worker ${i} on port ${port}...`);
		// react-router-serve directly instead of `pnpm start`: ensureMigratedDb
		// above already migrated, making the script's `migrate up` step redundant
		const serverProcess = spawn(
			process.execPath,
			TARGET_APP === "web"
				? [`${WEB_APP_DIR}/build/index.js`]
				: [
						"./node_modules/@react-router/serve/bin.cjs",
						"./build/server/index.js",
					],
			{
				env: {
					...process.env,
					NODE_ENV: "production",
					// the db files live in this app's directory either way (the
					// factories and migrations run through this app's code)
					DB_PATH: TARGET_APP === "web" ? `${process.cwd()}/${dbPath}` : dbPath,
					PORT: String(port),
					DISCORD_CLIENT_ID: "123",
					DISCORD_CLIENT_SECRET: "secret",
					SESSION_SECRET: "secret",
					VITE_SITE_DOMAIN: `http://localhost:${port}`,
					VITE_E2E_TEST_RUN: "true",
					STORAGE_END_POINT: "http://127.0.0.1:9000",
					STORAGE_ACCESS_KEY: "minio-user",
					STORAGE_SECRET: "minio-password",
					STORAGE_REGION: "us-east-1",
					STORAGE_BUCKET,
					// no system messages to a shared skalop instance (see build env above)
					SKALOP_SYSTEM_MESSAGE_URL: "",
					SKALOP_TOKEN: "",
					// creds from .env must not reach test servers (SyncLiveStreams would
					// hit the real Twitch API and overwrite factory-seeded streams)
					TWITCH_CLIENT_ID: "",
					TWITCH_CLIENT_SECRET: "",
					// tests assert webhook payloads by listening on the worker's webhook port
					SQ_CANCEL_DISCORD_WEBHOOK_URL: `http://localhost:${e2eWebhookPort(i)}/sq-cancel`,
				},
				detached: false,
			},
		);

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

	// Store server processes globally for teardown before awaiting readiness so
	// a failed startup still gets every already-spawned server cleaned up
	global.__E2E_SERVERS__ = SERVER_PROCESSES;

	// Wait for all servers to be ready
	await Promise.all(serverPromises);

	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log("\nAll servers started successfully!\n");
}

export default globalSetup;
