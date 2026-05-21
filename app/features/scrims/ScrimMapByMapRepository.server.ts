import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { databaseTimestampNow } from "~/utils/dates";
import type { ScrimSide } from "./scrims-types";

// xxx: rename to ScrimMapRepository?

// xxx: TablesInsertable
interface UpsertMapListArgs {
	scrimPostId: number;
	side: ScrimSide;
	source: "TOURNAMENT" | "POOL";
	tournamentId?: number | null;
	serializedPool?: string | null;
}

/**
 * Inserts a map list row for the given side, replacing any existing row for
 * the same `(scrimPostId, side)` pair.
 */
export async function upsertMapList(args: UpsertMapListArgs): Promise<void> {
	const now = databaseTimestampNow();

	await db
		.insertInto("ScrimMapList")
		.values({
			scrimPostId: args.scrimPostId,
			side: args.side,
			source: args.source,
			tournamentId: args.tournamentId ?? null,
			serializedPool: args.serializedPool ?? null,
			updatedAt: now,
		})
		.onConflict((oc) =>
			oc.columns(["scrimPostId", "side"]).doUpdateSet({
				source: args.source,
				tournamentId: args.tournamentId ?? null,
				serializedPool: args.serializedPool ?? null,
				updatedAt: now,
			}),
		)
		.execute();
}

/** Deletes a side's map list, if one exists. */
export async function deleteMapList(
	scrimPostId: number,
	side: ScrimSide,
): Promise<void> {
	await db
		.deleteFrom("ScrimMapList")
		.where("scrimPostId", "=", scrimPostId)
		.where("side", "=", side)
		.execute();
}

/** Returns all submitted map lists for the scrim. */
export function findMapListsByScrimPostId(
	scrimPostId: number,
): Promise<Tables["ScrimMapList"][]> {
	return db
		.selectFrom("ScrimMapList")
		.selectAll()
		.where("scrimPostId", "=", scrimPostId)
		.execute();
}

interface InsertMapArgs {
	scrimPostId: number;
	index: number;
	mode: ModeShort;
	stageId: StageId;
	replayOfIndex?: number | null;
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
			replayOfIndex: args.replayOfIndex ?? null,
		})
		.returning("id")
		.executeTakeFirstOrThrow();

	return inserted.id;
}

// xxx: TablesInsertable
interface ReportMapWinnerArgs {
	mapId: number;
	winnerSide: ScrimSide;
	reportedByUserId: number;
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
	replayOfIndex: number;
}

/**
 * Replaces the currently unreported map for the scrim with a replay of the
 * given source map (same mode/stage, marked as `replayOfIndex`). The current
 * map's index is preserved.
 */
export async function replaceCurrentMapAsReplay(
	args: ReplaceCurrentMapAsReplayArgs,
): Promise<void> {
	await db
		.updateTable("ScrimMap")
		.set({
			mode: args.mode,
			stageId: args.stageId,
			replayOfIndex: args.replayOfIndex,
		})
		.where("scrimPostId", "=", args.scrimPostId)
		.where("reportedAt", "is", null)
		.execute();
}

/** Returns the scrim's maps ordered by index ascending. */
export function findMapsByScrimPostId(
	scrimPostId: number,
): Promise<Tables["ScrimMap"][]> {
	return db
		.selectFrom("ScrimMap")
		.selectAll()
		.where("scrimPostId", "=", scrimPostId)
		.orderBy("index", "asc")
		.execute();
}
