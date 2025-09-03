import { defineConfig } from 'kysely-ctl';
import { nodeSqliteDialect } from './src/lib/server/db/dialect';
import { DatabaseSync } from 'node:sqlite';

if (!process.env.DB_PATH) {
	throw new Error('DB_PATH environment variable is not set');
}

const db = new DatabaseSync(process.env.DB_PATH);

export default defineConfig({
	dialect: nodeSqliteDialect(db)
});
