import { type ChildProcess, execSync, spawn } from "node:child_process";
import type { RunConfig } from "./types.ts";

export interface AppServer {
	name: "left" | "right";
	baseURL: string;
	process: ChildProcess;
}

/**
 * Starts one production server per side against its own copy of the seeded
 * database. Both get the same `VITE_SITE_DOMAIN` (the baked one) so any
 * absolute URL they render is identical and diffs stay clean.
 */
export async function startServers(
	config: RunConfig,
	dbFiles: { left: string; right: string },
): Promise<AppServer[]> {
	killPortListeners(config.leftPort, config.rightPort);

	const servers = (
		[
			{ name: "left", port: config.leftPort, dbFile: dbFiles.left },
			{ name: "right", port: config.rightPort, dbFile: dbFiles.right },
		] as const
	).map(({ name, port, dbFile }): AppServer => {
		const serverProcess = spawn(
			process.execPath,
			["./node_modules/@react-router/serve/bin.cjs", "./build/server/index.js"],
			{
				cwd: config.webReactDir,
				env: {
					...process.env,
					NODE_ENV: "production",
					// bounded heap so two servers plus the browser cannot push the
					// machine into memory-pressure kills
					NODE_OPTIONS: "--max-old-space-size=1024",
					DB_PATH: dbFile,
					PORT: String(port),
					DISCORD_CLIENT_ID: "123",
					DISCORD_CLIENT_SECRET: "secret",
					SESSION_SECRET: "secret",
					VITE_SITE_DOMAIN: config.bakedSiteDomain,
					VITE_E2E_TEST_RUN: "true",
					STORAGE_END_POINT: "http://127.0.0.1:9000",
					STORAGE_ACCESS_KEY: "minio-user",
					STORAGE_SECRET: "minio-password",
					STORAGE_REGION: "us-east-1",
					STORAGE_BUCKET: "sendou",
					SKALOP_SYSTEM_MESSAGE_URL: "",
					SKALOP_TOKEN: "",
					// real creds must not reach the differ servers: SyncLiveStreams
					// would hit the Twitch API and overwrite seeded streams
					TWITCH_CLIENT_ID: "",
					TWITCH_CLIENT_SECRET: "",
					SQ_CANCEL_DISCORD_WEBHOOK_URL: "",
				},
			},
		);

		if (process.env.DIFFER_DEBUG === "true") {
			serverProcess.stdout?.on("data", (data: Buffer) => {
				// biome-ignore lint/suspicious/noConsole: CLI script output
				console.log(`[${name}] ${data.toString()}`);
			});
			serverProcess.stderr?.on("data", (data: Buffer) => {
				// biome-ignore lint/suspicious/noConsole: CLI script output
				console.error(`[${name}] ${data.toString()}`);
			});
		}

		return {
			name,
			baseURL: `http://localhost:${port}`,
			process: serverProcess,
		};
	});

	await Promise.all(servers.map((server) => waitForServer(server.baseURL)));

	return servers;
}

export function stopServers(servers: AppServer[]) {
	for (const server of servers) {
		server.process.kill("SIGTERM");
	}
}

async function waitForServer(baseURL: string, timeout = 60000) {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(baseURL);
			if (response.ok || response.status === 404) return;
		} catch {
			// not up yet
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(`Server at ${baseURL} did not start within ${timeout}ms`);
}

function killPortListeners(...ports: number[]) {
	try {
		const pids = execSync(
			`lsof -ti ${ports.map((p) => `-i :${p}`).join(" ")} || true`,
			{
				stdio: "pipe",
			},
		)
			.toString()
			.trim();
		if (pids === "") return;

		execSync(`kill -9 ${pids.split("\n").join(" ")} 2>/dev/null || true`, {
			stdio: "pipe",
		});
	} catch {
		// nothing was listening
	}
}
