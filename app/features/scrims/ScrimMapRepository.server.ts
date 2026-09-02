import type { Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB, TablesInsertable } from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { databaseTimestampNow } from "~/utils/dates";
import * as Scrim from "./core/Scrim";
import * as ScrimMapByMap from "./core/ScrimMapByMap";
import * as ScrimMapListRepository from "./ScrimMapListRepository.server";

interface ReportMapArgs {
	scrimPostId: number;
	mapId: number;
	winnerSide: NonNullable<TablesInsertable["ScrimMap"]["winnerSide"]>;
}

/** Marks a map as reported with the winner side and, atomically, inserts the next map if no unreported one is waiting. */
export async function reportMapAndGenerateNext(
	args: ReportMapArgs,
): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx
			.updateTable("ScrimMap")
			.set({
				winnerSide: args.winnerSide,
				reportedAt: databaseTimestampNow(),
				reportedByUserId: actorId(),
			})
			.where("id", "=", args.mapId)
			.where("reportedAt", "is", null)
			.execute();

		await tryGenerateAndInsertNextMap(args.scrimPostId, trx);
	});
}

/** Reverses the most recent report: deletes the unreported next slot (if any) and clears winner/reportedAt on the last reported map. */
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

interface ReplaceCurrentMapArgs {
	scrimPostId: number;
	mode: ModeShort;
	stageId: StageId;
}

/** Replaces the scrim's unreported map with the given mode/stage, keeping its index ("replay previous map" and "pick a map"). */
export async function replaceCurrentMap(
	args: ReplaceCurrentMapArgs,
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

/** Inserts the next map when a pool derives from the submitted lists and no unreported map waits. Runs in the caller's transaction so two concurrent actions can't insert the same index. */
export async function tryGenerateAndInsertNextMap(
	scrimPostId: number,
	trx: Transaction<DB>,
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
