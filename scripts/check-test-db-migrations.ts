/** biome-ignore-all lint/suspicious/noConsole: Biome v2 migration */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, "..");

const MIGRATIONS_DIR = path.join(ROOT_DIR, "migrations");
const DB_FILES = [
	path.join(ROOT_DIR, "db-test.sqlite3"),
	...fs
		.readdirSync(path.join(ROOT_DIR, "e2e", "seeds"))
		.filter((f) => f.startsWith("db-seed-") && f.endsWith(".sqlite3"))
		.map((f) => path.join(ROOT_DIR, "e2e", "seeds", f)),
];

const migrationFilesOnDisk = fs
	.readdirSync(MIGRATIONS_DIR)
	.filter((f) => f.endsWith(".js"))
	.sort();

let hasErrors = false;

for (const dbPath of DB_FILES) {
	const relativePath = path.relative(ROOT_DIR, dbPath);

	if (!fs.existsSync(dbPath)) {
		console.warn(`Warning: ${relativePath} does not exist, skipping`);
		continue;
	}

	const db = new Database(dbPath, { readonly: true });
	const rows = db
		.prepare("SELECT name FROM migrations ORDER BY id ASC")
		.all() as Array<{ name: string }>;
	db.close();

	const migrationsInDb = new Set(rows.map((r) => r.name));
	const missingMigrations = migrationFilesOnDisk.filter(
		(name) => !migrationsInDb.has(name),
	);

	if (missingMigrations.length > 0) {
		hasErrors = true;
		console.error(
			`\n${relativePath} is missing ${missingMigrations.length} migration(s):`,
		);
		for (const name of missingMigrations) {
			console.error(`  - ${name}`);
		}
	}
}

if (hasErrors) {
	console.error(
		"\nRun `npm run test:e2e:generate-seeds` to regenerate test databases.",
	);
	process.exit(1);
} else {
	console.log("All test databases have the latest migrations.");
}
