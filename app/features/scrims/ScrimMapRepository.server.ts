import type { Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB, TablesInsertable } from "~/db/tables";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { databaseTimestampNow } from "~/utils/dates";
import * as Scrim from "./core/Scrim";
import * as ScrimMapByMap from "./core/ScrimMapByMap";
import * as ScrimMapListRepository from "./ScrimMapListRepository.server";

interface ReportMapArgs {
	scrimPostId: number;
	mapId: number;
	winnerSide: NonNullable<TablesInsertable["ScrimMap"]["winnerSide"]>;
	reportedByUserId: NonNullable<
		TablesInsertable["ScrimMap"]["reportedByUserId"]
	>;
}

/**
 * Marks an existing map as reported with the given winner side, and
 * (atomically) generates and inserts the next map for the scrim if no
 * unreported map is currently waiting.
 */
export async function reportMapAndGenerateNext(args: ReportMapArgs): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx
			.updateTable("ScrimMap")
			.set({
				winnerSide: args.winnerSide,
				reportedAt: databaseTimestampNow(),
				reportedByUserId: args.reportedByUserId,
			})
			.where("id", "=", args.mapId)
			.where("reportedAt", "is", null)
			.execute();

		await tryGenerateAndInsertNextMapInTrx(trx, args.scrimPostId);
	});
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

/**
 * If a pool can be derived from the submitted map lists and no unreported map
 * is currently waiting, generates and inserts the next map. Runs entirely
 * within the caller's transaction so the read of the existing maps and the
 * insert see a consistent snapshot and no two concurrent report/submit actions
 * can insert a "next" map at the same index.
 */
export async function tryGenerateAndInsertNextMapInTrx(
	trx: Transaction<DB>,
	scrimPostId: number,
): Promise<void> {
	const mapLists = await ScrimMapListRepository.findMapListsByScrimPostId(
		scrimPostId,
		trx,
	);
	if (mapLists.length === 0) return;

	const pool = ScrimMapByMap.unionPool(mapLists);
	if (pool.isEmpty()) return;

	const maps = await trx
		.selectFrom("ScrimMap")
		.select(["index", "mode", "stageId", "reportedAt"])
		.where("scrimPostId", "=", scrimPostId)
		.execute();

	if (maps.some((m) => m.reportedAt === null)) return;

	const next = ScrimMapByMap.generateNextMap({
		pool,
		history: maps.map((m) => ({ mode: m.mode, stageId: m.stageId })),
	});

	await trx
		.insertInto("ScrimMap")
		.values({
			scrimPostId,
			index: Scrim.nextMapIndex(maps),
			mode: next.mode,
			stageId: next.stageId,
		})
		.execute();
}
