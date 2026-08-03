import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Kysely } from "kysely";
import { FileMigrationProvider, Migrator } from "kysely/migration";
import { NodeSqliteDialect } from "../app/db/node-sqlite-dialect.ts";

const MIGRATION_FOLDER = fileURLToPath(
	new URL("../migrations", import.meta.url),
);

try {
	process.loadEnvFile();
} catch {
	// .env is optional; in production DB_PATH comes from the host environment
}

async function main() {
	const command = process.argv[2] ?? "up";
	if (command !== "up") {
		throw new Error(
			`Unknown command "${command}". Only "up" is supported; migrations are never rolled back.`,
		);
	}

	const dbPath = process.env.DB_PATH;
	if (!dbPath) {
		throw new Error("DB_PATH is not set");
	}

	const database = new DatabaseSync(dbPath);
	database.exec("PRAGMA journal_mode = WAL");
	database.exec("PRAGMA foreign_keys = ON");
	database.exec("PRAGMA busy_timeout = 5000");

	const db = new Kysely<any>({
		dialect: new NodeSqliteDialect({ database }),
	});

	const migrator = new Migrator({
		db,
		provider: new FileMigrationProvider({
			fs,
			path,
			migrationFolder: MIGRATION_FOLDER,
			import: (filePath) => import(pathToFileURL(filePath).href),
		}),
	});

	const { error, results } = await migrator.migrateToLatest();

	for (const result of results ?? []) {
		if (result.status === "Success") {
			log(`↑ ${result.migrationName}`);
		} else if (result.status === "Error") {
			log(`✗ ${result.migrationName}`);
		}
	}

	await db.destroy();

	if (error) throw error;

	if (!results?.length) {
		log(`No pending migrations for ${dbPath}`);
	}
}

function log(message: string) {
	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log(message);
}

main().catch((error) => {
	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.error(error);
	process.exit(1);
});
