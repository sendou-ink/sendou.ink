import { db } from "~/db/sql";
import type { TablesInsertable } from "~/db/tables";

export function replaceAll(
	streams: Omit<TablesInsertable["LiveStream"], "id">[],
) {
	return db.transaction().execute(async (trx) => {
		await trx.deleteFrom("LiveStream").execute();

		if (streams.length > 0) {
			await trx.insertInto("LiveStream").values(streams).execute();
		}
	});
}
