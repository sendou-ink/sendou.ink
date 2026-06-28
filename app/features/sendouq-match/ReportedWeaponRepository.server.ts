import type { NotNull, Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB, TablesInsertable } from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { assertUnreachable } from "~/utils/types";

export function createMany(
	weapons: TablesInsertable["ReportedWeapon"][],
	trx?: Transaction<DB>,
) {
	if (weapons.length === 0) return;

	return (trx ?? db).insertInto("ReportedWeapon").values(weapons).execute();
}

export async function upsertOwn({
	groupMatchId,
	mapIndex,
	weaponSplId,
}: Omit<TablesInsertable["ReportedWeapon"], "userId"> & {
	groupMatchId: number;
	mapIndex: number;
}) {
	const userId = actorId();
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

export async function deleteOwnByMapIndex({
	matchId,
	mapIndex,
}: {
	matchId: number;
	mapIndex: number;
}) {
	await db
		.deleteFrom("ReportedWeapon")
		.where("groupMatchId", "=", matchId)
		.where("mapIndex", "=", mapIndex)
		.where("userId", "=", actorId())
		.execute();
}

export async function deleteByMapIndex(
	{
		matchId,
		mapIndex,
	}: {
		matchId: number;
		mapIndex: number;
	},
	trx?: Transaction<DB>,
) {
	await (trx ?? db)
		.deleteFrom("ReportedWeapon")
		.where("groupMatchId", "=", matchId)
		.where("mapIndex", "=", mapIndex)
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

export async function upsertOwnTournament({
	tournamentMatchId,
	mapIndex,
	weaponSplId,
	createdAt,
}: Omit<TablesInsertable["ReportedWeapon"], "userId"> & {
	tournamentMatchId: number;
	mapIndex: number;
	createdAt: number;
}) {
	const userId = actorId();
	await db
		.deleteFrom("ReportedWeapon")
		.where("tournamentMatchId", "=", tournamentMatchId)
		.where("mapIndex", "=", mapIndex)
		.where("userId", "=", userId)
		.execute();

	await db
		.insertInto("ReportedWeapon")
		.values({ tournamentMatchId, mapIndex, userId, weaponSplId, createdAt })
		.execute();
}

export async function deleteOwnByMapIndexTournament({
	tournamentMatchId,
	mapIndex,
}: {
	tournamentMatchId: number;
	mapIndex: number;
}) {
	await db
		.deleteFrom("ReportedWeapon")
		.where("tournamentMatchId", "=", tournamentMatchId)
		.where("mapIndex", "=", mapIndex)
		.where("userId", "=", actorId())
		.execute();
}

/**
 * Deletes reported weapons that no longer correspond to a played game, i.e.
 * those reported "in advance" for map indexes beyond the games that ended up
 * being played. Called when a set ends to trim leftover weapons that earlier
 * score undos intentionally left dangling.
 */
export async function deleteExtraByTournamentMatchId(
	{
		tournamentMatchId,
		gameCount,
	}: {
		tournamentMatchId: number;
		gameCount: number;
	},
	trx?: Transaction<DB>,
) {
	await (trx ?? db)
		.deleteFrom("ReportedWeapon")
		.where("tournamentMatchId", "=", tournamentMatchId)
		.where("mapIndex", ">=", gameCount)
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
		.select(({ fn }) => [
			"ReportedWeapon.weaponSplId",
			fn.countAll<number>().as("count"),
		])
		.where("ReportedWeapon.userId", "=", userId)
		.where("ReportedWeapon.groupMatchId", "is not", null)
		.where("ReportedWeapon.createdAt", ">=", startsTs)
		.where("ReportedWeapon.createdAt", "<=", endsTs)
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
		.select(({ fn }) => [
			"ReportedWeapon.weaponSplId",
			fn.countAll<number>().as("count"),
		])
		.where("ReportedWeapon.userId", "=", userId)
		.where("Tournament.isFinalized", "=", 1)
		.where("ReportedWeapon.createdAt", ">=", startsTs)
		.where("ReportedWeapon.createdAt", "<=", endsTs)
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

export interface WeaponUsageStat {
	type: "SELF" | "MATE" | "ENEMY";
	weaponSplId: MainWeaponId;
	count: number;
	wins: number;
	losses: number;
}

/**
 * Reports how often a user and the mates/enemies they played against used each
 * weapon on a given stage and mode during a season, along with win/loss counts.
 */
export async function weaponUsageStats({
	userId,
	mode,
	stageId,
	season,
}: {
	userId: number;
	mode: ModeShort;
	stageId: StageId;
	season: number;
}): Promise<WeaponUsageStat[]> {
	const { starts, ends } = Seasons.nthToDateRange(season);

	const rows = await db
		.selectFrom("GroupMember")
		// cross join pins the join order so SQLite starts from the user's own
		// groups instead of scanning every GroupMatch in the season's date range
		.crossJoin("GroupMatch")
		.leftJoin("GroupMatchMap", "GroupMatchMap.matchId", "GroupMatch.id")
		.innerJoin("ReportedWeapon", (join) =>
			join
				.onRef("ReportedWeapon.groupMatchId", "=", "GroupMatch.id")
				.onRef("ReportedWeapon.mapIndex", "=", "GroupMatchMap.index"),
		)
		.select((eb) => [
			"ReportedWeapon.weaponSplId",
			"ReportedWeapon.userId as weaponUserId",
			"GroupMatchMap.winnerGroupId",
			"GroupMember.groupId as ownerGroupId",
			eb
				.selectFrom("GroupMember as weaponGroupMember")
				.select("weaponGroupMember.groupId")
				.where((weaponEb) =>
					weaponEb.or([
						weaponEb.and([
							weaponEb(
								"weaponGroupMember.userId",
								"=",
								eb.ref("ReportedWeapon.userId"),
							),
							weaponEb(
								"weaponGroupMember.groupId",
								"=",
								eb.ref("GroupMatch.alphaGroupId"),
							),
						]),
						weaponEb(
							"weaponGroupMember.groupId",
							"=",
							eb.ref("GroupMatch.bravoGroupId"),
						),
					]),
				)
				.as("weaponUserGroupId"),
		])
		.where("GroupMember.userId", "=", userId)
		.where((eb) =>
			eb.or([
				eb("GroupMatch.alphaGroupId", "=", eb.ref("GroupMember.groupId")),
				eb("GroupMatch.bravoGroupId", "=", eb.ref("GroupMember.groupId")),
			]),
		)
		.where("GroupMatch.createdAt", ">=", dateToDatabaseTimestamp(starts))
		.where("GroupMatch.createdAt", "<=", dateToDatabaseTimestamp(ends))
		.where("GroupMatchMap.mode", "=", mode)
		.where("GroupMatchMap.stageId", "=", stageId)
		.where("GroupMatchMap.winnerGroupId", "is not", null)
		.execute();

	const result: WeaponUsageStat[] = [];

	const addDelta = (
		stat: Omit<WeaponUsageStat, "count" | "wins" | "losses"> & { won: boolean },
	) => {
		const existing = result.find(
			(s) => s.weaponSplId === stat.weaponSplId && s.type === stat.type,
		);

		if (existing) {
			existing.count += 1;
			if (stat.won) {
				existing.wins += 1;
			} else {
				existing.losses += 1;
			}
		} else {
			result.push({
				...stat,
				count: 1,
				wins: stat.won ? 1 : 0,
				losses: stat.won ? 0 : 1,
			});
		}
	};

	for (const row of rows) {
		const type =
			row.weaponUserId === userId
				? "SELF"
				: row.weaponUserGroupId === row.ownerGroupId
					? "MATE"
					: "ENEMY";

		const won = () => {
			const targetWon = row.winnerGroupId === row.ownerGroupId;

			if (type === "SELF") return targetWon;
			if (type === "MATE") return targetWon;
			if (type === "ENEMY") return !targetWon;

			assertUnreachable(type);
		};

		addDelta({
			type,
			weaponSplId: row.weaponSplId,
			won: won(),
		});
	}

	return result.sort((a, b) => b.count - a.count);
}
