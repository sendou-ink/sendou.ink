import type { Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB, Tables, TablesInsertable } from "~/db/tables";
import type { TournamentSettings } from "~/db/tables-json";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import * as TeamPick from "~/features/tournament/core/TeamPick";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { databaseTimestampNow } from "~/utils/dates";
import { jsonArrayFrom } from "~/utils/kysely.server";
import * as ScrimMapRepository from "./ScrimMapRepository.server";
import type { ScrimSide } from "./scrims-types";

type SubmitMapListArgs = Omit<TablesInsertable["ScrimMapList"], "updatedAt">;

/** Upserts the side's map list row and, atomically, inserts the scrim's next map if no unreported one is waiting. */
export async function submitMapListAndGenerateIfNeeded(
	args: SubmitMapListArgs,
): Promise<void> {
	const now = databaseTimestampNow();

	await db.transaction().execute(async (trx) => {
		await trx
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

		await ScrimMapRepository.tryGenerateAndInsertNextMap(args.scrimPostId, trx);
	});
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

/** The scrim's submitted map lists with pools resolved to `(mode, stageId)` pairs; tournament-sourced rows carry the tournament's id and name. */
export async function findMapListsByScrimPostId(
	scrimPostId: number,
	trx?: Transaction<DB>,
): Promise<ResolvedScrimMapList[]> {
	const executor = trx ?? db;

	const rows = await executor
		.selectFrom("ScrimMapList")
		.leftJoin(
			"CalendarEvent",
			"ScrimMapList.tournamentId",
			"CalendarEvent.tournamentId",
		)
		.leftJoin("Tournament", "ScrimMapList.tournamentId", "Tournament.id")
		.select((eb) => [
			"ScrimMapList.side",
			"ScrimMapList.source",
			"ScrimMapList.tournamentId",
			"ScrimMapList.serializedPool",
			"ScrimMapList.updatedAt",
			eb.ref("CalendarEvent.name").as("tournamentName"),
			"Tournament.mapPickingStyle",
			eb.ref("Tournament.settings").as("tournamentSettings"),
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
	mapPickingStyle: Tables["Tournament"]["mapPickingStyle"] | null;
	tournamentSettings: TournamentSettings | null;
}): Array<{ mode: ModeShort; stageId: StageId }> {
	if (row.source === "TOURNAMENT") return resolveTournamentMapPool(row);
	if (!row.serializedPool) return [];
	return new MapPool(row.serializedPool).stageModePairs;
}

function resolveTournamentMapPool(row: {
	tournamentMapPool: Array<{ mode: ModeShort; stageId: StageId }>;
	mapPickingStyle: Tables["Tournament"]["mapPickingStyle"] | null;
	tournamentSettings: TournamentSettings | null;
}) {
	if (row.mapPickingStyle !== "AUTO") return row.tournamentMapPool;

	const teamPick =
		row.tournamentSettings?.teamPick ??
		TeamPick.defaultSettings([...rankedModesShort]);

	return TeamPick.effectivePool(teamPick, row.tournamentMapPool).stageModePairs;
}
