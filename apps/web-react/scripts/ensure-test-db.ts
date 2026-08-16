import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, "..");

const MIGRATIONS_DIR = path.join(ROOT_DIR, "migrations");
const TEST_DB_PATH = path.join(ROOT_DIR, "db-test.sqlite3");

export function setup() {
	ensureMigratedDb(TEST_DB_PATH);

	// Test workers only ever read this file, to copy its schema into their own
	// in-memory database. Taking it out of WAL drops the -wal/-shm sidecars, so
	// those concurrent opens need no write access and cannot contend.
	const db = new DatabaseSync(TEST_DB_PATH);
	db.exec("PRAGMA journal_mode = DELETE");
	db.close();
}

/**
 * Ensures the SQLite file at `dbPath` has every migration applied: creates it
 * if missing, applies pending migrations, and rebuilds it from scratch if an
 * already applied migration no longer exists on disk or its contents changed
 * since it was applied.
 *
 * Rebuilding on changed contents matters because a branch edits the migration
 * it added rather than stacking a new one, so the file name kysely tracks stays
 * the same while the schema it produces does not.
 */
export function ensureMigratedDb(dbPath: string) {
	const resolvedPath = path.resolve(ROOT_DIR, dbPath);

	if (!fs.existsSync(resolvedPath)) {
		migrateUp(resolvedPath);
		return;
	}

	const applied = appliedMigrations(resolvedPath);
	const onDisk = migrationFilesOnDisk();

	const hasDrift =
		applied === null ||
		applied.some((name) => !onDisk.has(name)) ||
		readContentsMarker(resolvedPath) !== migrationContentsHash();
	if (hasDrift) {
		deleteDbFiles(resolvedPath);
		migrateUp(resolvedPath);
		return;
	}

	const appliedSet = new Set(applied);
	const hasPending = [...onDisk].some((name) => !appliedSet.has(name));
	if (hasPending) {
		migrateUp(resolvedPath);
	}
}

/** Fingerprint of every migration's name and contents. */
function migrationContentsHash() {
	const hash = createHash("sha256");
	for (const file of fs.readdirSync(MIGRATIONS_DIR).sort()) {
		hash.update(file);
		hash.update(fs.readFileSync(path.join(MIGRATIONS_DIR, file)));
	}
	return hash.digest("hex");
}

/** Sidecar recording the migration contents the database was built from. */
function contentsMarkerPath(dbPath: string) {
	return `${dbPath}.migrations`;
}

function readContentsMarker(dbPath: string) {
	try {
		return fs.readFileSync(contentsMarkerPath(dbPath), "utf8");
	} catch {
		return null;
	}
}

function migrationFilesOnDisk() {
	return new Set(
		fs
			.readdirSync(MIGRATIONS_DIR)
			.filter((file) => file.endsWith(".ts"))
			// kysely tracks migrations by file name without the extension
			.map((file) => file.slice(0, -".ts".length)),
	);
}

function appliedMigrations(dbPath: string) {
	const db = new DatabaseSync(dbPath, { readOnly: true });
	try {
		const hasMigrationsTable = db
			.prepare(
				"select 1 from sqlite_master where type = 'table' and name = 'kysely_migration'",
			)
			.get();
		if (!hasMigrationsTable) return null;

		const rows = db
			.prepare("select name from kysely_migration")
			.all() as Array<{
			name: string;
		}>;
		return rows.map((row) => row.name);
	} catch {
		return null;
	} finally {
		db.close();
	}
}

function deleteDbFiles(dbPath: string) {
	for (const suffix of ["", "-shm", "-wal"]) {
		fs.rmSync(`${dbPath}${suffix}`, { force: true });
	}
	fs.rmSync(contentsMarkerPath(dbPath), { force: true });
}

function migrateUp(dbPath: string) {
	execSync("pnpm run migrate up", {
		cwd: ROOT_DIR,
		stdio: "inherit",
		env: { ...process.env, DB_PATH: dbPath },
	});
	fs.writeFileSync(contentsMarkerPath(dbPath), migrationContentsHash());
}
