import { db } from '$lib/server/db/sql';
import type { TablesInsertable } from '$lib/server/db/tables';

export function insert(args: TablesInsertable['UnvalidatedUserSubmittedImage']) {
	return db
		.insertInto('UnvalidatedUserSubmittedImage')
		.values(args)
		.returning('id')
		.executeTakeFirstOrThrow();
}
