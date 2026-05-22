import { db } from "~/db/sql";
import type { TablesInsertable } from "~/db/tables";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { databaseTimestampNow } from "~/utils/dates";

interface InsertMapArgs {
	scrimPostId: number;
	index: number;
	mode: ModeShort;
	stageId: StageId;
}

/**
 * Inserts a new map row representing the next unreported slot. Returns the
 * inserted map's id.
 */
export async function insertMap(args: InsertMapArgs): Promise<number> {
	const inserted = await db
		.insertInto("ScrimMap")
		.values({
			scrimPostId: args.scrimPostId,
			index: args.index,
			mode: args.mode,
			stageId: args.stageId,
		})
		.returning("id")
		.executeTakeFirstOrThrow();

	return inserted.id;
}

interface ReportMapWinnerArgs {
	mapId: number;
	winnerSide: NonNullable<TablesInsertable["ScrimMap"]["winnerSide"]>;
	reportedByUserId: NonNullable<
		TablesInsertable["ScrimMap"]["reportedByUserId"]
	>;
}

/** Marks an existing map as reported with the given winner side. */
export async function reportMapWinner(
	args: ReportMapWinnerArgs,
): Promise<void> {
	await db
		.updateTable("ScrimMap")
		.set({
			winnerSide: args.winnerSide,
			reportedAt: databaseTimestampNow(),
			reportedByUserId: args.reportedByUserId,
		})
		.where("id", "=", args.mapId)
		.where("reportedAt", "is", null)
		.execute();
}

/**
 * Reverses the most recent report: deletes the currently unreported map (the
 * auto-generated next slot, if any) and clears the winner/reportedAt fields on
 * the most recently reported map so it can be played again.
 */
export async function undoMostRecentMap(scrimPostId: number): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("ScrimMap")
			.where("scrimPostId", "=", scrimPostId)
			.where("reportedAt", "is", null)
			.execute();

		const latestReported = await trx
			.selectFrom("ScrimMap")
			.select("id")
			.where("scrimPostId", "=", scrimPostId)
			.where("reportedAt", "is not", null)
			.orderBy("index", "desc")
			.limit(1)
			.executeTakeFirst();

		if (!latestReported) return;

		await trx
			.updateTable("ScrimMap")
			.set({
				reportedAt: null,
				winnerSide: null,
				reportedByUserId: null,
			})
			.where("id", "=", latestReported.id)
			.execute();
	});
}

interface ReplaceCurrentMapAsReplayArgs {
	scrimPostId: number;
	mode: ModeShort;
	stageId: StageId;
}

/**
 * Replaces the currently unreported map for the scrim with a replay of the
 * given source map (same mode/stage). The current map's index is preserved.
 */
export async function replaceCurrentMapAsReplay(
	args: ReplaceCurrentMapAsReplayArgs,
): Promise<void> {
	await db
		.updateTable("ScrimMap")
		.set({
			mode: args.mode,
			stageId: args.stageId,
		})
		.where("scrimPostId", "=", args.scrimPostId)
		.where("reportedAt", "is", null)
		.execute();
}

/** Returns the scrim's maps ordered by index ascending. */
export function findMapsByScrimPostId(scrimPostId: number) {
	return db
		.selectFrom("ScrimMap")
		.select(["id", "index", "mode", "stageId", "winnerSide", "reportedAt"])
		.where("scrimPostId", "=", scrimPostId)
		.orderBy("index", "asc")
		.execute();
}
