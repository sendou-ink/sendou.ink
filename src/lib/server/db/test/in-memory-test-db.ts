import { DatabaseSync } from 'node:sqlite';

export function createTestDatabase(): DatabaseSync {
	const testDb = new DatabaseSync(':memory:');
	const sourceDb = new DatabaseSync('db-test.sqlite3');

	// Get all table schemas from source database
	const tables = sourceDb
		.prepare(
			`
    SELECT sql 
    FROM sqlite_master 
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
  `
		)
		.all() as { sql: string }[];

	// Get all view schemas from source database
	const views = sourceDb
		.prepare(
			`
    SELECT sql 
    FROM sqlite_master 
    WHERE type='view' AND name NOT LIKE 'sqlite_%'
  `
		)
		.all() as { sql: string }[];

	// Get all index schemas from source database
	const indexes = sourceDb
		.prepare(
			`
    SELECT sql 
    FROM sqlite_master 
    WHERE type='index' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL
  `
		)
		.all() as { sql: string }[];

	// Create tables in test database
	for (const table of tables) {
		testDb.exec(table.sql);
	}

	// Create views in test database
	for (const view of views) {
		testDb.exec(view.sql);
	}

	// Create indexes in test database
	for (const index of indexes) {
		try {
			testDb.exec(index.sql);
		} catch (_error) {
			// Skip indexes that fail to create (silent in tests)
		}
	}

	// Copy data from all tables
	const tableNames = sourceDb
		.prepare(
			`
    SELECT name 
    FROM sqlite_master 
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
  `
		)
		.all() as { name: string }[];

	for (const table of tableNames) {
		const data = sourceDb.prepare(`SELECT * FROM "${table.name}"`).all();
		if (data.length > 0) {
			const columns = Object.keys(data[0] as Record<string, unknown>);
			const placeholders = columns.map(() => '?').join(', ');
			const insertSql = `INSERT INTO "${table.name}" (${columns.join(', ')}) VALUES (${placeholders})`;
			const insertStmt = testDb.prepare(insertSql);

			for (const row of data) {
				try {
					insertStmt.run(...columns.map((col) => (row as any)[col]));
				} catch (_error) {
					// Skip rows that fail to insert (silent in tests)
				}
			}
		}
	}

	sourceDb.close();
	return testDb;
}
