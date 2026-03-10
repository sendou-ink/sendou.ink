import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { SEED_VARIATIONS } from "../app/features/api-private/constants";

const E2E_SEEDS_DIR = "e2e/seeds";
const BASE_TEST_DB = "db-test.sqlite3";

const E2E_WORKER_DB_PATTERN = /^db-test-e2e-\d+\.sqlite3$/;

async function generatePreSeededDatabases() {
	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log("Generating pre-seeded databases for e2e tests...\n");

	for (const file of fs.readdirSync(".")) {
		if (E2E_WORKER_DB_PATTERN.test(file)) {
			fs.unlinkSync(file);
			// biome-ignore lint/suspicious/noConsole: CLI script output
			console.log(`Deleted stale worker db: ${file}`);
		}
	}

	if (!fs.existsSync(E2E_SEEDS_DIR)) {
		fs.mkdirSync(E2E_SEEDS_DIR, { recursive: true });
	}

	const baseDbPath = path.resolve(BASE_TEST_DB);
	if (!fs.existsSync(baseDbPath)) {
		// biome-ignore lint/suspicious/noConsole: CLI script output
		console.error(
			`Base test database not found: ${baseDbPath}. Run migrations first.`,
		);
		process.exit(1);
	}

	for (const variation of SEED_VARIATIONS) {
		const outputPath = path.join(E2E_SEEDS_DIR, `db-seed-${variation}.sqlite3`);
		// biome-ignore lint/suspicious/noConsole: CLI script output
		console.log(`Generating ${variation}...`);

		fs.copyFileSync(baseDbPath, outputPath);

		execSync(
			`npx vite-node scripts/seed-single-variation.ts -- ${variation} ${outputPath}`,
			{ stdio: "inherit" },
		);

		const db = new Database(outputPath);
		db.pragma("wal_checkpoint(TRUNCATE)");
		db.close();

		const stats = fs.statSync(outputPath);
		// biome-ignore lint/suspicious/noConsole: CLI script output
		console.log(
			`  ✓ ${variation}: ${(stats.size / 1024 / 1024).toFixed(2)} MB\n`,
		);
	}

	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log(`Done! Pre-seeded databases saved to ${E2E_SEEDS_DIR}/`);
}

// biome-ignore lint/suspicious/noConsole: CLI script output
generatePreSeededDatabases().catch(console.error);
