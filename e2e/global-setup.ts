import { type ChildProcess, execSync, spawn } from "node:child_process";
import fs from "node:fs";
import type { FullConfig } from "@playwright/test";
import { ensureMigratedDb } from "../scripts/ensure-test-db";
import { E2E_BASE_PORT, e2eWorkerPort } from "./helpers/playwright";

const DEBUG = process.env.E2E_DEBUG === "true";
const SERVER_PROCESSES: ChildProcess[] = [];
const MINIO_MARKER_FILE = ".e2e-minio-started";
const BUILD_MARKER_FILE = ".e2e-build-marker";
const BUILD_INPUTS = [
	"app",
	"public",
	"package.json",
	"pnpm-lock.yaml",
	"vite.config.ts",
	"react-router.config.ts",
];

declare global {
	var __E2E_SERVERS__: ChildProcess[];
}

async function waitForMinio(timeout = 60000): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		try {
			const response = await fetch("http://127.0.0.1:9000/minio/health/live");
			if (response.ok) {
				return true;
			}
		} catch {
			// MinIO not ready yet
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	return false;
}

async function ensureMinioRunning(): Promise<boolean> {
	// Check if MinIO is already running
	try {
		const response = await fetch("http://127.0.0.1:9000/minio/health/live");
		if (response.ok) {
			// biome-ignore lint/suspicious/noConsole: CLI script output
			console.log("MinIO is already running");
			return false;
		}
	} catch {
		// MinIO not running, we need to start it
	}

	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log("Starting MinIO...");
	execSync("docker compose up -d minio", { stdio: "inherit" });

	const isReady = await waitForMinio();
	if (!isReady) {
		throw new Error("MinIO failed to start within timeout");
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

/**
 * The last e2e build can be reused when no build input changed since its marker
 * was written. Directory mtimes catch deletes and renames; a build made outside
 * the e2e flow (no marker, or output newer than the marker) forces a rebuild, as
 * does a marker from a different port setup. E2E_FORCE_BUILD=true overrides.
 */
function isBuildFresh(): boolean {
	if (process.env.E2E_FORCE_BUILD === "true") return false;
	if (!fs.existsSync(BUILD_MARKER_FILE)) return false;
	if (!fs.existsSync("build/server/index.js")) return false;

	try {
		const marker = JSON.parse(fs.readFileSync(BUILD_MARKER_FILE, "utf8"));
		if (marker.siteDomain !== `http://localhost:${E2E_BASE_PORT}`) return false;
		if (marker.skalopWsUrl !== "") return false;
	} catch {
		return false;
	}

	const markerMtime = fs.statSync(BUILD_MARKER_FILE).mtimeMs;
	if (fs.statSync("build/server/index.js").mtimeMs > markerMtime) return false;

	try {
		const changedInput = execSync(
			`find ${BUILD_INPUTS.join(" ")} -newer ${BUILD_MARKER_FILE} -print -quit`,
		)
			.toString()
			.trim();
		return changedInput === "";
	} catch {
		return false;
	}
}

async function globalSetup(config: FullConfig) {
	const workerCount = config.workers;

	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log(`\nStarting e2e test setup with ${workerCount} workers...`);

	// Start MinIO if not already running
	await ensureMinioRunning();

	// Build the app once with E2E test flag so VITE_E2E_TEST_RUN is embedded
	// Use port 6173 as the base - tests will rewrite URLs as needed
	if (isBuildFresh()) {
		// biome-ignore lint/suspicious/noConsole: CLI script output
		console.log(
			"Reusing existing build (no source changes since last e2e build)",
		);
	} else {
		// biome-ignore lint/suspicious/noConsole: CLI script output
		console.log("Building the application...");
		fs.rmSync(BUILD_MARKER_FILE, { force: true });
		execSync("pnpm run build", {
			stdio: "inherit",
			env: {
				...process.env,
				VITE_E2E_TEST_RUN: "true",
				VITE_SITE_DOMAIN: `http://localhost:${E2E_BASE_PORT}`,
				// Skalop is disconnected in e2e: all workers sharing one instance
				// cross-talk (identical seeded row ids -> colliding room names ->
				// spurious revalidations). When e2e tests for chat etc. are added
				// this needs an actual solution: one skalop (or stub) per worker
				// with a runtime-derived ws URL, since this build is shared.
				VITE_SKALOP_WS_URL: "",
			},
		});
		fs.writeFileSync(
			BUILD_MARKER_FILE,
			JSON.stringify({
				siteDomain: `http://localhost:${E2E_BASE_PORT}`,
				skalopWsUrl: "",
			}),
		);
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
		// above already migrated (the script's `migrate up` step is redundant) and
		// the Sentry instrument import only adds request overhead with no DSN set
		const serverProcess = spawn(
			process.execPath,
			["./node_modules/@react-router/serve/bin.cjs", "./build/server/index.js"],
			{
				env: {
					...process.env,
					NODE_ENV: "production",
					DB_PATH: dbPath,
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
					STORAGE_BUCKET: "sendou",
					// no system messages to a shared skalop instance (see build env above)
					SKALOP_SYSTEM_MESSAGE_URL: "",
					SKALOP_TOKEN: "",
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
