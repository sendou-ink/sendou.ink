import { sql, type Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { commonUserJsonObject } from "~/utils/kysely.server";

export function upsertMapResults(
	results: Pick<
		Tables["MapResult"],
		"losses" | "wins" | "userId" | "mode" | "stageId" | "season"
	>[],
	trx?: Transaction<DB>,
) {
	if (results.length === 0) return;

	const executor = trx ?? db;

	return executor
		.insertInto("MapResult")
		.values(results)
		.onConflict((oc) =>
			oc.columns(["userId", "stageId", "mode", "season"]).doUpdateSet((eb) => ({
				wins: eb("MapResult.wins", "+", eb.ref("excluded.wins")),
				losses: eb("MapResult.losses", "+", eb.ref("excluded.losses")),
			})),
		)
		.execute();
}

/** Aggregated map win/loss record for a user in a given season. */
export async function seasonMapWinrateByUserId({
	userId,
	season,
}: {
	userId: number;
	season: number;
}): Promise<{ wins: number; losses: number }> {
	const row = await db
		.selectFrom("MapResult")
		.select(({ fn }) => [
			fn.sum<number>("wins").as("wins"),
			fn.sum<number>("losses").as("losses"),
		])
		.where("userId", "=", userId)
		.where("season", "=", season)
		.groupBy("userId")
		.executeTakeFirst();

	return row ?? { wins: 0, losses: 0 };
}

/** Aggregated set win/loss record for a user in a given season. */
export async function seasonSetWinrateByUserId({
	userId,
	season,
}: {
	userId: number;
	season: number;
}): Promise<{ wins: number; losses: number }> {
	const row = await db
		.selectFrom("PlayerResult")
		.select([
			sql<number>`sum("setWins") / 4`.as("wins"),
			sql<number>`sum("setLosses") / 4`.as("losses"),
		])
		.where("ownerUserId", "=", userId)
		.where("season", "=", season)
		.where("type", "=", "ENEMY")
		.groupBy("ownerUserId")
		.executeTakeFirst();

	return row ?? { wins: 0, losses: 0 };
}

/** Per-stage per-mode win/loss breakdown for a user in a given season. */
export async function seasonStagesByUserId({
	userId,
	season,
}: {
	userId: number;
	season: number;
}) {
	const rows = await db
		.selectFrom("MapResult")
		.select(["wins", "losses", "stageId", "mode"])
		.where("userId", "=", userId)
		.where("season", "=", season)
		.execute();

	return rows.reduce(
		(acc, cur) => {
			if (!acc[cur.stageId]) acc[cur.stageId] = {};

			acc[cur.stageId]![cur.mode] = {
				wins: cur.wins,
				losses: cur.losses,
			};

			return acc;
		},
		{} as Partial<
			Record<
				StageId,
				Partial<Record<ModeShort, { wins: number; losses: number }>>
			>
		>,
	);
}

/** Mates or enemies for a user in a given season, ordered by most maps played together. */
export async function seasonMatesEnemiesByUserId({
	userId,
	season,
	type,
}: {
	userId: number;
	season: number;
	type: Tables["PlayerResult"]["type"];
}) {
	return db
		.selectFrom("PlayerResult")
		.leftJoin("User", "User.id", "PlayerResult.otherUserId")
		.select((eb) => [
			"mapWins",
			"mapLosses",
			"setWins",
			"setLosses",
			commonUserJsonObject(eb).as("user"),
		])
		.where("ownerUserId", "=", userId)
		.where("season", "=", season)
		.where("type", "=", type)
		.orderBy(({ eb }) => eb("mapWins", "+", eb.ref("mapLosses")), "desc")
		.execute();
}

export function upsertPlayerResults(
	results: Tables["PlayerResult"][],
	trx?: Transaction<DB>,
) {
	if (results.length === 0) return;

	const executor = trx ?? db;

	return executor
		.insertInto("PlayerResult")
		.values(results)
		.onConflict((oc) =>
			oc
				.columns(["ownerUserId", "otherUserId", "type", "season"])
				.doUpdateSet((eb) => ({
					mapWins: eb("PlayerResult.mapWins", "+", eb.ref("excluded.mapWins")),
					mapLosses: eb(
						"PlayerResult.mapLosses",
						"+",
						eb.ref("excluded.mapLosses"),
					),
					setWins: eb("PlayerResult.setWins", "+", eb.ref("excluded.setWins")),
					setLosses: eb(
						"PlayerResult.setLosses",
						"+",
						eb.ref("excluded.setLosses"),
					),
				})),
		)
		.execute();
}
