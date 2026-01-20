import { execSync } from "node:child_process";
import fs from "node:fs";
import type { FullConfig } from "@playwright/test";

const MINIO_MARKER_FILE = ".e2e-minio-started";

declare global {
	var __E2E_SERVERS__: import("node:child_process").ChildProcess[];
}

async function globalTeardown(_config: FullConfig) {
	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log("\nStopping e2e test servers...");

	const servers = global.__E2E_SERVERS__ || [];

	for (const server of servers) {
		if (server && !server.killed) {
			server.kill("SIGTERM");
		}
	}

	// Give processes a moment to clean up
	await new Promise((resolve) => setTimeout(resolve, 1000));

	// Stop MinIO if we started it (check for marker file)
	if (fs.existsSync(MINIO_MARKER_FILE)) {
		// biome-ignore lint/suspicious/noConsole: CLI script output
		console.log("Stopping MinIO...");
		try {
			execSync("docker compose stop minio", { stdio: "inherit" });
		} catch {
			// Ignore errors - MinIO might already be stopped
		}
		fs.unlinkSync(MINIO_MARKER_FILE);
	}

	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log("All servers stopped.\n");
}

export default globalTeardown;
