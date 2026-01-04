import type { FullConfig } from "@playwright/test";

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

	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log("All servers stopped.\n");
}

export default globalTeardown;
