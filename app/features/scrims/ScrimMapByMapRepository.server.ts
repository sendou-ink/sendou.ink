import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { databaseTimestampNow } from "~/utils/dates";
import type { ScrimSide } from "./scrims-types";

// xxx: rename to ScrimMapRepository?

/**
 * Enables map-by-map tracking on a scrim post. Idempotent: existing
 * `trackingEnabledAt` is preserved when called multiple times.
 */
export async function enableTracking(scrimPostId: number): Promise<void> {
	await db
		.updateTable("ScrimPost")
		.set({ trackingEnabledAt: databaseTimestampNow() })
		.where("id", "=", scrimPostId)
		.where("trackingEnabledAt", "is", null)
		.execute();
}

// xxx: this functionality not needed
/** Marks tracking as explicitly locked. Sets `trackingLockedAt` if null. */
export async function lockTracking(scrimPostId: number): Promise<void> {
	await db
		.updateTable("ScrimPost")
		.set({ trackingLockedAt: databaseTimestampNow() })
		.where("id", "=", scrimPostId)
		.where("trackingLockedAt", "is", null)
		.execute();
}

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

// xxx: to avoid double undo, should also have index submitted
/**
 * Deletes the most recently reported map row for the scrim. Caller is
 * responsible for verifying the `canUndo` invariant; this method only enforces
 * "highest index that has been reported".
 */
export async function undoMostRecentMap(scrimPostId: number): Promise<void> {
	await db.transaction().execute(async (trx) => {
		const latest = await trx
			.selectFrom("ScrimMap")
			.select("id")
			.where("scrimPostId", "=", scrimPostId)
			.where("reportedAt", "is not", null)
			.orderBy("index", "desc")
			.limit(1)
			.executeTakeFirst();

		if (!latest) return;

		await trx.deleteFrom("ScrimMap").where("id", "=", latest.id).execute();
	});
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
