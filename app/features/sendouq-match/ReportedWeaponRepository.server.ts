import type { NotNull, Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB, TablesInsertable } from "~/db/tables";
import * as Seasons from "~/features/mmr/core/Seasons";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { dateToDatabaseTimestamp } from "~/utils/dates";

export function createMany(
	weapons: TablesInsertable["ReportedWeapon"][],
	trx?: Transaction<DB>,
) {
	if (weapons.length === 0) return;

	return (trx ?? db).insertInto("ReportedWeapon").values(weapons).execute();
}

export async function upsertOne({
	groupMatchId,
	mapIndex,
	userId,
	weaponSplId,
}: TablesInsertable["ReportedWeapon"] & {
	groupMatchId: number;
	mapIndex: number;
}) {
	await db
		.deleteFrom("ReportedWeapon")
		.where("groupMatchId", "=", groupMatchId)
		.where("mapIndex", "=", mapIndex)
		.where("userId", "=", userId)
		.execute();

	await db
		.insertInto("ReportedWeapon")
		.values({ groupMatchId, mapIndex, userId, weaponSplId })
		.execute();
}

export async function replaceByMatchId(
	matchId: number,
	weapons: TablesInsertable["ReportedWeapon"][],
	trx?: Transaction<DB>,
) {
	const executor = trx ?? db;

	await executor
		.deleteFrom("ReportedWeapon")
		.where("groupMatchId", "=", matchId)
		.execute();

	if (weapons.length > 0) {
		await executor.insertInto("ReportedWeapon").values(weapons).execute();
	}
}

export async function deleteByUserMapIndex({
	matchId,
	userId,
	mapIndex,
}: {
	matchId: number;
	userId: number;
	mapIndex: number;
}) {
	await db
		.deleteFrom("ReportedWeapon")
		.where("groupMatchId", "=", matchId)
		.where("mapIndex", "=", mapIndex)
		.where("userId", "=", userId)
		.execute();
}

export async function findByMatchId(matchId: number) {
	const rows = await db
		.selectFrom("ReportedWeapon")
		.select([
			"ReportedWeapon.groupMatchId",
			"ReportedWeapon.mapIndex",
			"ReportedWeapon.weaponSplId",
			"ReportedWeapon.userId",
		])
		.where("ReportedWeapon.groupMatchId", "=", matchId)
		.orderBy("ReportedWeapon.mapIndex", "asc")
		.orderBy("ReportedWeapon.userId", "asc")
		.$narrowType<{ groupMatchId: NotNull }>()
		.execute();

	if (rows.length === 0) return null;

	return rows;
}

export async function upsertOneTournament({
	tournamentMatchId,
	mapIndex,
	userId,
	weaponSplId,
}: TablesInsertable["ReportedWeapon"] & {
	tournamentMatchId: number;
	mapIndex: number;
}) {
	await db
		.deleteFrom("ReportedWeapon")
		.where("tournamentMatchId", "=", tournamentMatchId)
		.where("mapIndex", "=", mapIndex)
		.where("userId", "=", userId)
		.execute();

	await db
		.insertInto("ReportedWeapon")
		.values({ tournamentMatchId, mapIndex, userId, weaponSplId })
		.execute();
}

export async function deleteByUserMapIndexTournament({
	tournamentMatchId,
	userId,
	mapIndex,
}: {
	tournamentMatchId: number;
	userId: number;
	mapIndex: number;
}) {
	await db
		.deleteFrom("ReportedWeapon")
		.where("tournamentMatchId", "=", tournamentMatchId)
		.where("mapIndex", "=", mapIndex)
		.where("userId", "=", userId)
		.execute();
}

export async function findByTournamentMatchId(matchId: number) {
	const rows = await db
		.selectFrom("ReportedWeapon")
		.select([
			"ReportedWeapon.tournamentMatchId",
			"ReportedWeapon.mapIndex",
			"ReportedWeapon.weaponSplId",
			"ReportedWeapon.userId",
		])
		.where("ReportedWeapon.tournamentMatchId", "=", matchId)
		.orderBy("ReportedWeapon.mapIndex", "asc")
		.orderBy("ReportedWeapon.userId", "asc")
		.$narrowType<{ tournamentMatchId: NotNull; mapIndex: NotNull }>()
		.execute();

	if (rows.length === 0) return null;

	return rows;
}

/**
 * Aggregates a user's reported weapons across both SendouQ matches and
 * finalized tournaments that fall within the given season's date range.
 */
export async function seasonReportedWeaponsByUserId({
	userId,
	season,
}: {
	userId: number;
	season: number;
}): Promise<Array<{ weaponSplId: MainWeaponId; count: number }>> {
	const { starts, ends } = Seasons.nthToDateRange(season);
	const startsTs = dateToDatabaseTimestamp(starts);
	const endsTs = dateToDatabaseTimestamp(ends);

	const sendouqWeapons = db
		.selectFrom("ReportedWeapon")
		.innerJoin("GroupMatch", "GroupMatch.id", "ReportedWeapon.groupMatchId")
		.select(({ fn }) => [
			"ReportedWeapon.weaponSplId",
			fn.countAll<number>().as("count"),
		])
		.where("ReportedWeapon.userId", "=", userId)
		.where("GroupMatch.createdAt", ">=", startsTs)
		.where("GroupMatch.createdAt", "<=", endsTs)
		.groupBy("ReportedWeapon.weaponSplId");

	const tournamentWeapons = db
		.selectFrom("ReportedWeapon")
		.innerJoin(
			"TournamentMatch",
			"TournamentMatch.id",
			"ReportedWeapon.tournamentMatchId",
		)
		.innerJoin(
			"TournamentStage",
			"TournamentStage.id",
			"TournamentMatch.stageId",
		)
		.innerJoin("Tournament", "Tournament.id", "TournamentStage.tournamentId")
		.innerJoin("CalendarEvent", "CalendarEvent.tournamentId", "Tournament.id")
		.innerJoin(
			(eb) =>
				eb
					.selectFrom("CalendarEventDate")
					.select(({ fn }) => [
						"CalendarEventDate.eventId",
						fn.min("CalendarEventDate.startTime").as("startTime"),
					])
					.groupBy("CalendarEventDate.eventId")
					.as("EventStartTime"),
			(join) => join.onRef("EventStartTime.eventId", "=", "CalendarEvent.id"),
		)
		.select(({ fn }) => [
			"ReportedWeapon.weaponSplId",
			fn.countAll<number>().as("count"),
		])
		.where("ReportedWeapon.userId", "=", userId)
		.where("Tournament.isFinalized", "=", 1)
		.where("EventStartTime.startTime", ">=", startsTs)
		.where("EventStartTime.startTime", "<=", endsTs)
		.groupBy("ReportedWeapon.weaponSplId");

	const rows = await db
		.selectFrom(sendouqWeapons.unionAll(tournamentWeapons).as("merged"))
		.select(({ fn }) => [
			"merged.weaponSplId",
			fn.sum<number>("merged.count").as("count"),
		])
		.groupBy("merged.weaponSplId")
		.orderBy("count", "desc")
		.execute();

	return rows;
}
