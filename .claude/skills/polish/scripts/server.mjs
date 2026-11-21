/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
// Serves the production (e2e flavoured) build on db-polish.sqlite3 until killed.
// A production build because the dev server fakes the very things a polish pass looks for:
// styles injected by JS (a flash and a shift on every load), the dev toolbar taking space,
// unbundled modules making hydration slow. The e2e flavour keeps impersonation and the
// `data-testid="hydrated"` marker (with its router idle flag) the harness waits on.
//
//   node .claude/skills/polish/scripts/server.mjs           build if stale, then serve
//   node .claude/skills/polish/scripts/server.mjs --url     print the server's URL and exit
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import {
	SERVER_URL as BASE_URL,
	POLISH_DB,
	POLISH_PORT,
	ROOT,
} from "./lib.mjs";

const BUILD_MARKER_FILE = ".e2e-build-marker";
const BUILD_INPUTS = [
	"app",
	"public",
	"package.json",
	"pnpm-lock.yaml",
	"vite.config.ts",
];
const E2E_SITE_DOMAIN = `http://localhost:${POLISH_PORT - 400}`;

process.chdir(ROOT);

if (process.argv.includes("--url")) {
	console.log(BASE_URL);
	process.exit(0);
}

if (!fs.existsSync(POLISH_DB)) {
	console.error(`${POLISH_DB} is missing, run: pnpm run polish:db`);
	process.exit(1);
}

if (await isUp()) {
	console.error(
		`Something already answers at ${BASE_URL}. If it is an old polish server: lsof -ti :${POLISH_PORT} | xargs kill`,
	);
	process.exit(1);
}

if (!isBuildFresh()) {
	console.log("Building the app (e2e flavour)...");
	fs.rmSync(BUILD_MARKER_FILE, { force: true });
	execSync("pnpm run build", {
		stdio: "inherit",
		env: {
			...process.env,
			VITE_E2E_TEST_RUN: "true",
			VITE_SITE_DOMAIN: E2E_SITE_DOMAIN,
		},
	});
	// same marker the e2e global setup writes, so the suite reuses this build
	fs.writeFileSync(
		BUILD_MARKER_FILE,
		JSON.stringify({ siteDomain: E2E_SITE_DOMAIN }),
	);
}

const server = spawn(
	process.execPath,
	["./node_modules/@react-router/serve/bin.cjs", "./build/server/index.js"],
	{
		stdio: "inherit",
		env: {
			...process.env,
			NODE_ENV: "production",
			DB_PATH: POLISH_DB,
			PORT: String(POLISH_PORT),
			DISCORD_CLIENT_ID: "123",
			DISCORD_CLIENT_SECRET: "secret",
			SESSION_SECRET: "secret",
			VITE_SITE_DOMAIN: BASE_URL,
			VITE_E2E_TEST_RUN: "true",
			STORAGE_END_POINT: "http://127.0.0.1:9000",
			STORAGE_ACCESS_KEY: "seaweedfs-user",
			STORAGE_SECRET: "seaweedfs-password",
			STORAGE_REGION: "us-east-1",
			STORAGE_BUCKET: "sendou",
			// no real third party calls from a sweep
			TWITCH_CLIENT_ID: "",
			TWITCH_CLIENT_SECRET: "",
			DAILY_API_KEY: "e2e",
			DAILY_DOMAIN: "e2e",
			DAILY_WEBHOOK_SECRET: "",
		},
	},
);

for (const signal of ["SIGINT", "SIGTERM"]) {
	process.on(signal, () => {
		server.kill();
		process.exit(0);
	});
}
server.on("exit", (code) => process.exit(code ?? 0));

const startedAt = Date.now();
while (!(await isUp())) {
	if (Date.now() - startedAt > 120_000) {
		console.error("Server did not start within 2 minutes");
		server.kill();
		process.exit(1);
	}
	await new Promise((resolve) => setTimeout(resolve, 250));
}
console.log(`POLISH SERVER READY ${BASE_URL}`);

async function isUp() {
	try {
		const response = await fetch(BASE_URL);
		return response.ok || response.status === 404;
	} catch {
		return false;
	}
}

function isBuildFresh() {
	if (!fs.existsSync(BUILD_MARKER_FILE)) return false;
	if (!fs.existsSync("build/server/index.js")) return false;

	const markerMtime = fs.statSync(BUILD_MARKER_FILE).mtimeMs;
	if (fs.statSync("build/server/index.js").mtimeMs > markerMtime) return false;

	const changedInput = execSync(
		`find ${BUILD_INPUTS.join(" ")} -newer ${BUILD_MARKER_FILE} -print -quit`,
	)
		.toString()
		.trim();
	return changedInput === "";
}
