// `vite build` with the environment SvelteKit's post-build analysis needs: it imports the server
// modules, which validate the server config and open the database as they load. Nothing of it is
// baked into the output; the real values are read from the environment when the server starts.
import { execFileSync } from "node:child_process";
import path from "node:path";

const SVELTE_DIR = path.resolve(import.meta.dirname, "..");

const BUILD_TIME_PLACEHOLDERS = {
	SESSION_SECRET: "build-time-placeholder",
	LOHI_TOKEN: "build-time-placeholder",
	DISCORD_CLIENT_ID: "build-time-placeholder",
	DISCORD_CLIENT_SECRET: "build-time-placeholder",
};

try {
	process.loadEnvFile(path.join(SVELTE_DIR, "../.env"));
} catch {
	// .env is optional, in CI the variables come from the host
}

execFileSync(
	process.execPath,
	[path.join(SVELTE_DIR, "node_modules/vite/bin/vite.js"), "build"],
	{
		cwd: SVELTE_DIR,
		stdio: "inherit",
		env: {
			...process.env,
			...BUILD_TIME_PLACEHOLDERS,
			// the analysis only needs a migrated database to open, relative to this directory
			DB_PATH: process.env.SVELTE_BUILD_DB_PATH ?? "../db.sqlite3",
		},
	},
);
