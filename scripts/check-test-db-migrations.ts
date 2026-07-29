/** biome-ignore-all lint/suspicious/noConsole: Biome v2 migration */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "kysely";
import { createDatabaseConnection } from "~/db/sql";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, "..");

const MIGRATIONS_DIR = path.join(ROOT_DIR, "migrations");
const DB_FILES = [
	// xxx: how can we get rid of having to remember to keep db-test.sqlite3 up to date?
	path.join(ROOT_DIR, "db-test.sqlite3"),
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

	await using db = createDatabaseConnection(dbPath, { readonly: true });
	const { rows } = await sql<{
		name: string;
	}>`SELECT name FROM migrations ORDER BY id ASC`.execute(db);

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
		"\nRun `pnpm run test:e2e:generate-seeds` to regenerate test databases.",
	);
	process.exit(1);
} else {
	console.log("All test databases have the latest migrations.");
}
