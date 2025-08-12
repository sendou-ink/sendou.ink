import type { DatabaseSync } from 'node:sqlite';
import { buildQueryFn, GenericSqliteDialect } from 'kysely-generic-sqlite';
import type { IGenericSqlite } from 'kysely-generic-sqlite';

// based on https://github.com/kysely-org/kysely/issues/1292#issuecomment-2670341588
function createSqliteExecutor(db: DatabaseSync): IGenericSqlite<DatabaseSync> {
	return {
		db,
		query: buildQueryFn({
			all: (sql, parameters = []) => db.prepare(sql).all(...parameters),
			// @ts-expect-error - We could parse as bigint here but not needed in our project
			run: (sql, parameters = []) => {
				const { changes, lastInsertRowid } = db.prepare(sql).run(...parameters);
				return {
					insertId: lastInsertRowid,
					numAffectedRows: changes
				};
			}
		}),
		close: () => db.close(),
		iterator: (isSelect, sql, parameters = []) => {
			if (!isSelect) {
				throw new Error('Only select supported in streams');
			}
			return db.prepare(sql).iterate(...parameters) as any;
		}
	};
}

export function nodeSqliteDialect(db: DatabaseSync) {
	return new GenericSqliteDialect(() => createSqliteExecutor(db));
}
