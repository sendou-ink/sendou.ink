// based on https://kysely.dev/docs/migrations

import * as path from 'path';
import { nodeSqliteDialect } from '../lib/server/db/dialect.ts';
import { promises as fs } from 'fs';
import { Kysely, Migrator, FileMigrationProvider } from 'kysely';
import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrateToLatest() {
	if (!process.env.DB_PATH) {
		throw new Error('DB_PATH env variable must be set');
	}
	const sql = new DatabaseSync(process.env.DB_PATH);

	const db = new Kysely({
		dialect: nodeSqliteDialect(sql)
	});

	const migrator = new Migrator({
		db,
		provider: new FileMigrationProvider({
			fs,
			path,
			migrationFolder: path.join(__dirname, '..', '..', 'migrations')
		})
	});

	const { error, results } = await migrator.migrateToLatest();

	results?.forEach((it) => {
		if (it.status === 'Success') {
			console.log(`migration "${it.migrationName}" was executed successfully`);
		} else if (it.status === 'Error') {
			console.error(`failed to execute migration "${it.migrationName}"`);
		}
	});

	if (error) {
		console.error('failed to migrate');
		console.error(error);
		process.exit(1);
	}

	if (results?.length === 0) {
		console.log('no migrations were executed, database is up to date');
	}

	await db.destroy();
}

migrateToLatest();
