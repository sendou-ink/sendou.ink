import { brotliCompressSync, constants } from "node:zlib";
import type { Kysely } from "kysely";

const BATCH_SIZE = 500;

/** Moves scanner matches' objective and player status timelines out of the JSON into a Brotli-compressed column, see `StoredMatches.toStored` */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.alterTable("IngestedMatch")
			.addColumn("timelines", "blob")
			.execute();

		let lastId = 0;
		while (true) {
			const rows: Array<{ id: number; data: string }> = await trx
				.selectFrom("IngestedMatch")
				.select(["id", "data"])
				.where("id", ">", lastId)
				.orderBy("id", "asc")
				.limit(BATCH_SIZE)
				.execute();
			if (rows.length === 0) break;

			for (const row of rows) {
				const { objective, playerStatus, ...data } = JSON.parse(row.data);
				const hasTimelines = Boolean(objective) || Boolean(playerStatus);
				const timelinesJson = JSON.stringify({
					objective: objective ?? null,
					playerStatus: playerStatus ?? null,
				});

				await trx
					.updateTable("IngestedMatch")
					.set({
						data: JSON.stringify(data),
						timelines: hasTimelines
							? brotliCompressSync(timelinesJson, {
									params: {
										[constants.BROTLI_PARAM_QUALITY]: 9,
										[constants.BROTLI_PARAM_SIZE_HINT]: timelinesJson.length,
									},
								})
							: null,
					})
					.where("id", "=", row.id)
					.execute();
			}

			lastId = rows.at(-1)!.id;
		}
	});
}
