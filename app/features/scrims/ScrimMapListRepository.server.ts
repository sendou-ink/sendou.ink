import { jsonArrayFrom } from "kysely/helpers/sqlite";
import { db } from "~/db/sql";
import type { TablesInsertable } from "~/db/tables";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { databaseTimestampNow } from "~/utils/dates";
import type { ScrimSide } from "./scrims-types";

type UpsertMapListArgs = Omit<TablesInsertable["ScrimMapList"], "updatedAt">;

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

export type ResolvedScrimMapList = {
	side: ScrimSide;
	mapList: Array<{ mode: ModeShort; stageId: StageId }>;
	tournament?: { id: number; name: string };
	updatedAt: number;
};

/**
 * Returns all submitted map lists for the scrim with the pool resolved into
 * concrete `(mode, stageId)` pairs. Tournament-sourced rows additionally carry
 * the tournament's id and name for display.
 */
export async function findMapListsByScrimPostId(
	scrimPostId: number,
): Promise<ResolvedScrimMapList[]> {
	const rows = await db
		.selectFrom("ScrimMapList")
		.leftJoin(
			"CalendarEvent",
			"ScrimMapList.tournamentId",
			"CalendarEvent.tournamentId",
		)
		.select((eb) => [
			"ScrimMapList.side",
			"ScrimMapList.source",
			"ScrimMapList.tournamentId",
			"ScrimMapList.serializedPool",
			"ScrimMapList.updatedAt",
			eb.ref("CalendarEvent.name").as("tournamentName"),
			jsonArrayFrom(
				eb
					.selectFrom("MapPoolMap")
					.select(["MapPoolMap.mode", "MapPoolMap.stageId"])
					.whereRef("MapPoolMap.calendarEventId", "=", "CalendarEvent.id"),
			).as("tournamentMapPool"),
		])
		.where("ScrimMapList.scrimPostId", "=", scrimPostId)
		.execute();

	return rows.map((row) => ({
		side: row.side,
		mapList: resolveMapList(row),
		tournament:
			row.source === "TOURNAMENT" && row.tournamentId !== null
				? { id: row.tournamentId, name: row.tournamentName ?? "" }
				: undefined,
		updatedAt: row.updatedAt,
	}));
}

function resolveMapList(row: {
	source: "TOURNAMENT" | "POOL";
	serializedPool: string | null;
	tournamentMapPool: Array<{ mode: ModeShort; stageId: StageId }>;
}): Array<{ mode: ModeShort; stageId: StageId }> {
	if (row.source === "TOURNAMENT") return row.tournamentMapPool;
	if (!row.serializedPool) return [];
	return new MapPool(row.serializedPool).stageModePairs;
}
