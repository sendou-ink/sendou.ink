import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Census, RunConfig } from "./types.ts";

export const SEED_DB = "db-differ-seed.sqlite3";
export const LEFT_DB = "db-differ-left.sqlite3";
export const RIGHT_DB = "db-differ-right.sqlite3";

const MINIO_BUCKET_URL = "http://127.0.0.1:9000/sendou/";

/**
 * Produces everything the diff run consumes: the shared e2e build, a database
 * seeded at `SEED_NOW`, one copy of it per server, and the route census
 * generated from that database.
 */
export function prepare(config: RunConfig): Census {
	if (!config.skipPrepare) {
		log("Ensuring e2e build...");
		run(config, "node", ["scripts/ensure-e2e-build.ts"], {
			E2E_BUILD_SITE_DOMAIN: config.bakedSiteDomain,
		});

		log(`Seeding ${SEED_DB} at ${new Date(config.seedNow).toISOString()}...`);
		for (const dbFile of [SEED_DB, LEFT_DB, RIGHT_DB]) {
			deleteDbFiles(path.join(config.webReactDir, dbFile));
		}
		run(config, "node", ["scripts/migrate.ts", "up"], { DB_PATH: SEED_DB });
		run(config, "./node_modules/.bin/vite-node", ["./scripts/seed.ts"], {
			DB_PATH: SEED_DB,
			SEED_NOW: String(config.seedNow),
		});

		// one checkpointed file copies cleanly; the servers re-enable WAL themselves
		const seedDb = new DatabaseSync(path.join(config.webReactDir, SEED_DB));
		seedDb.exec("PRAGMA wal_checkpoint(TRUNCATE)");
		seedDb.exec("PRAGMA journal_mode = DELETE");
		seedDb.close();

		for (const dbFile of [LEFT_DB, RIGHT_DB]) {
			fs.copyFileSync(
				path.join(config.webReactDir, SEED_DB),
				path.join(config.webReactDir, dbFile),
			);
		}
	}

	log("Generating route census...");
	const censusPath = path.join(config.outDir, "census.json");
	run(
		config,
		"./node_modules/.bin/vite-node",
		["./scripts/route-census.ts", "--out", censusPath],
		{ DB_PATH: SEED_DB, SEED_NOW: String(config.seedNow) },
	);

	return JSON.parse(fs.readFileSync(censusPath, "utf8")) as Census;
}

/**
 * Seeded user-submitted images live in MinIO; without it those requests 404 on
 * both sides equally, so a missing Docker daemon degrades the run instead of
 * failing it.
 */
export async function ensureMinio(): Promise<boolean> {
	if (await isMinioReady()) return true;

	try {
		execSync("docker compose up -d minio", { stdio: "pipe" });
	} catch {
		log("MinIO unavailable (is Docker running?) — image requests will 404");
		return false;
	}

	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline) {
		if (await isMinioReady()) return true;
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	log("MinIO never became ready — image requests will 404");
	return false;
}

async function isMinioReady(): Promise<boolean> {
	try {
		const response = await fetch(MINIO_BUCKET_URL);
		return response.ok;
	} catch {
		return false;
	}
}

function run(
	config: RunConfig,
	command: string,
	args: string[],
	env: Record<string, string>,
) {
	const result = spawnSync(command, args, {
		cwd: config.webReactDir,
		stdio: "inherit",
		env: { ...process.env, ...env },
	});
	if (result.status !== 0) {
		throw new Error(
			`${command} ${args.join(" ")} exited with status ${result.status}`,
		);
	}
}

function deleteDbFiles(dbPath: string) {
	for (const suffix of ["", "-wal", "-shm"]) {
		fs.rmSync(`${dbPath}${suffix}`, { force: true });
	}
}

function log(message: string) {
	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log(message);
}
