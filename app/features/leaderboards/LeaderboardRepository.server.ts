import { add } from "date-fns";
import type { InferResult } from "kysely";
import { sql } from "kysely";
import { jsonArrayFrom } from "kysely/helpers/sqlite";
import * as R from "remeda";
import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import type {
	MainWeaponId,
	RankedModeShort,
} from "~/modules/in-game-lists/types";
import {
	COMMON_USER_FIELDS,
	concatUserSubmittedImagePrefix,
} from "~/utils/kysely.server";
import { dateToDatabaseTimestamp } from "../../utils/dates";
import invariant from "../../utils/invariant";
import * as Seasons from "../mmr/core/Seasons";
import { ordinalToSp } from "../mmr/mmr-utils";
import {
	DEFAULT_LEADERBOARD_MAX_SIZE,
	IGNORED_TEAMS,
	MATCHES_COUNT_NEEDED_FOR_LEADERBOARD,
} from "./leaderboards-constants";

function addPowers<T extends { ordinal: number }>(entries: T[]) {
	return entries.map((entry) => ({
		...entry,
		power: ordinalToSp(entry.ordinal),
	}));
}

function addPlacementRank<T>(entries: T[]) {
	return entries.map((entry, index) => ({
		...entry,
		placementRank: index + 1,
	}));
}

const teamLeaderboardBySeasonQuery = (season: number) =>
	db
		.selectFrom("Skill")
		.innerJoin(
			(eb) =>
				eb
					.selectFrom("Skill as InnerSkill")
					.select(({ fn }) => [
						"InnerSkill.identifier",
						fn.max("InnerSkill.id").as("maxId"),
					])
					.where("season", "=", season)
					.groupBy("InnerSkill.identifier")
					.as("Latest"),
			(join) =>
				join
					.onRef("Latest.identifier", "=", "Skill.identifier")
					.onRef("Latest.maxId", "=", "Skill.id"),
		)
		.select((eb) => [
			"Skill.id as entryId",
			"Skill.ordinal",
			jsonArrayFrom(
				eb
					.selectFrom("SkillTeamUser")
					.innerJoin("User", "SkillTeamUser.userId", "User.id")
					.select(COMMON_USER_FIELDS)
					.whereRef("SkillTeamUser.skillId", "=", "Skill.id"),
			).as("members"),
			jsonArrayFrom(
				eb
					.selectFrom("SkillTeamUser")
					.innerJoin("User", "SkillTeamUser.userId", "User.id")
					.innerJoin(
						"TeamMemberWithSecondary",
						"TeamMemberWithSecondary.userId",
						"User.id",
					)
					.innerJoin("Team", "Team.id", "TeamMemberWithSecondary.teamId")
					.leftJoin(
						"UserSubmittedImage",
						"UserSubmittedImage.id",
						"Team.avatarImgId",
					)
					.select((eb) => [
						"Team.id",
						"Team.name",
						concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
							"avatarUrl",
						),
						"Team.customUrl",
						"TeamMemberWithSecondary.isMainTeam",
						"TeamMemberWithSecondary.userId",
					])
					.whereRef("SkillTeamUser.skillId", "=", "Skill.id"),
			).as("teams"),
		])
		.where("Skill.matchesCount", ">=", MATCHES_COUNT_NEEDED_FOR_LEADERBOARD)
		.where("Skill.season", "=", season)
		.orderBy("Skill.ordinal", "desc")
		.limit(DEFAULT_LEADERBOARD_MAX_SIZE);
type TeamLeaderboardBySeasonQueryReturnType = InferResult<
	ReturnType<typeof teamLeaderboardBySeasonQuery>
>;

export async function teamLeaderboardBySeason({
	season,
	onlyOneEntryPerUser,
}: {
	season: number;
	onlyOneEntryPerUser: boolean;
}) {
	const entries = await teamLeaderboardBySeasonQuery(season).execute();
	const withNonSqPlayersHandled = onlyOneEntryPerUser
		? await filterOutNonSqPlayers({ season, entries })
		: entries;
	const withIgnoredHandled = onlyOneEntryPerUser
		? ignoreTeams({ season, entries: withNonSqPlayersHandled })
		: withNonSqPlayersHandled;

	const oneEntryPerUser = onlyOneEntryPerUser
		? filterOneEntryPerUser(withIgnoredHandled)
		: withIgnoredHandled;
	const withSharedTeam = resolveSharedTeam(oneEntryPerUser);
	const withPower = addPowers(withSharedTeam);

	return addPlacementRank(withPower);
}

async function filterOutNonSqPlayers(args: {
	entries: TeamLeaderboardBySeasonQueryReturnType;
	season: number;
}) {
	const validUserIds = await userIdsWithEnoughSqMatchesForTeamLeaderboard(
		args.season,
	);

	return args.entries.filter((entry) =>
		entry.members.every((member) => validUserIds.includes(member.id)),
	);
}

async function userIdsWithEnoughSqMatchesForTeamLeaderboard(seasonNth: number) {
	const season = Seasons.nthToDateRange(seasonNth);
	invariant(season, "Season not found in sqMatchCountByUserId");

	const userIds = await db
		.selectFrom("GroupMatch")
		.innerJoin("GroupMember", (join) =>
			join.on((eb) =>
				eb.or([
					eb("GroupMatch.alphaGroupId", "=", eb.ref("GroupMember.groupId")),
					eb("GroupMatch.bravoGroupId", "=", eb.ref("GroupMember.groupId")),
				]),
			),
		)
		// this join is needed to filter out canceled matches
		.innerJoin("Skill", (join) =>
			join
				.onRef("Skill.groupMatchId", "=", "GroupMatch.id")
				.onRef("Skill.userId", "=", "GroupMember.userId"),
		)
		.select("GroupMember.userId")
		.where("GroupMatch.createdAt", ">", dateToDatabaseTimestamp(season.starts))
		.where(
			"GroupMatch.createdAt",
			"<",
			dateToDatabaseTimestamp(add(season.ends, { days: 1 })), // some matches can be finished after the season ends
		)
		.execute();

	const countsMap = new Map<number, number>();

	for (const { userId } of userIds) {
		const count = countsMap.get(userId) ?? 0;
		countsMap.set(userId, count + 1);
	}

	return Array.from(countsMap.entries())
		.filter(([_userId, count]) => count >= MATCHES_COUNT_NEEDED_FOR_LEADERBOARD)
		.map(([userId]) => userId);
}

function filterOneEntryPerUser(
	entries: TeamLeaderboardBySeasonQueryReturnType,
) {
	const encounteredUserIds = new Set<number>();
	return entries.filter((entry) => {
		if (entry.members.some((m) => encounteredUserIds.has(m.id))) {
			return false;
		}

		for (const member of entry.members) {
			encounteredUserIds.add(member.id);
		}

		return true;
	});
}

function resolveSharedTeam(entries: ReturnType<typeof filterOneEntryPerUser>) {
	return entries.map(({ teams, ...entry }) => {
		const uniqueTeamIds = R.unique(teams.map((team) => team.id));

		for (const teamId of uniqueTeamIds) {
			const count = teams.filter((team) => team.id === teamId).length;

			if (count === 4) {
				return {
					...entry,
					team: teams.find((team) => team.id === teamId),
				};
			}
		}

		return {
			...entry,
			team: undefined,
		};
	});
}

function ignoreTeams({
	season,
	entries,
}: {
	season: number;
	entries: TeamLeaderboardBySeasonQueryReturnType;
}) {
	const ignoredTeams = IGNORED_TEAMS.get(season);

	if (!ignoredTeams) return entries;

	return entries.filter((entry) => {
		if (
			ignoredTeams.some((team) =>
				team.every((userId) => entry.members.some((m) => m.id === userId)),
			)
		) {
			return false;
		}

		return true;
	});
}

export async function seasonsParticipatedInByUserId(userId: number) {
	const rows = await db
		.selectFrom("Skill")
		.select("season")
		.where("userId", "=", userId)
		.where(({ or, eb }) =>
			or([
				eb("groupMatchId", "is not", null),
				eb("tournamentId", "is not", null),
			]),
		)
		.groupBy("season")
		.orderBy("season", "desc")
		.execute();

	return rows.map((row) => row.season);
}

export type XPLeaderboardItem = Awaited<
	ReturnType<typeof allXPLeaderboard>
>[number];

function xpLeaderboardQuery(where?: {
	mode?: RankedModeShort;
	weaponSplId?: MainWeaponId;
}) {
	let query = db
		.selectFrom("XRankPlacement")
		.innerJoin("SplatoonPlayer", "SplatoonPlayer.id", "XRankPlacement.playerId")
		.leftJoin("User", "User.id", "SplatoonPlayer.userId")
		.select(({ fn }) => [
			...COMMON_USER_FIELDS,
			"XRankPlacement.id as entryId",
			"XRankPlacement.playerId",
			"XRankPlacement.weaponSplId",
			"XRankPlacement.name",
			fn.max("XRankPlacement.power").as("power"),
			sql<number>`rank() over (order by max("XRankPlacement"."power") desc)`.as(
				"placementRank",
			),
		])
		.groupBy("XRankPlacement.playerId")
		.orderBy("power", "desc")
		.limit(DEFAULT_LEADERBOARD_MAX_SIZE);

	if (where?.mode) {
		query = query.where("XRankPlacement.mode", "=", where.mode);
	}

	if (typeof where?.weaponSplId === "number") {
		query = query.where("XRankPlacement.weaponSplId", "=", where.weaponSplId);
	}

	return query;
}

export async function allXPLeaderboard() {
	return xpLeaderboardQuery().execute();
}

export async function modeXPLeaderboard(mode: RankedModeShort) {
	return xpLeaderboardQuery({ mode }).execute();
}

export async function weaponXPLeaderboard(weaponSplId: MainWeaponId) {
	return xpLeaderboardQuery({ weaponSplId }).execute();
}

export type UserSPLeaderboardItem = Awaited<
	ReturnType<typeof userSPLeaderboard>
>[number];

export async function userSPLeaderboard(season: number) {
	const rows = await db
		.selectFrom("Skill")
		.innerJoin("User", "User.id", "Skill.userId")
		.innerJoin(
			(eb) =>
				eb
					.selectFrom("Skill as InnerSkill")
					.select(({ fn }) => [
						"InnerSkill.userId",
						fn.max("InnerSkill.id").as("maxId"),
					])
					.where("season", "=", season)
					.groupBy("InnerSkill.userId")
					.as("Latest"),
			(join) =>
				join
					.onRef("Latest.userId", "=", "Skill.userId")
					.onRef("Latest.maxId", "=", "Skill.id"),
		)
		.select([
			...COMMON_USER_FIELDS,
			"Skill.id as entryId",
			"Skill.ordinal",
			"User.plusSkippedForSeasonNth",
			sql<number>`rank() over (order by "Skill"."ordinal" desc)`.as(
				"placementRank",
			),
		])
		.where("Skill.userId", "is not", null)
		.where("Skill.matchesCount", ">=", MATCHES_COUNT_NEEDED_FOR_LEADERBOARD)
		.where("Skill.season", "=", season)
		.orderBy("Skill.ordinal", "desc")
		.execute();

	return rows.map(({ ordinal, ...rest }) => ({
		...rest,
		pendingPlusTier: null as number | null,
		power: ordinalToSp(ordinal),
	}));
}

export type SeasonPopularUsersWeapon = Record<
	Tables["User"]["id"],
	MainWeaponId
>;

export async function seasonPopularUsersWeapon(
	season: number,
): Promise<SeasonPopularUsersWeapon> {
	const { starts, ends } = Seasons.nthToDateRange(season);

	const rows = await db
		.with("q1", (db) =>
			db
				.selectFrom("ReportedWeapon")
				.innerJoin(
					"GroupMatchMap",
					"ReportedWeapon.groupMatchMapId",
					"GroupMatchMap.id",
				)
				.innerJoin("GroupMatch", "GroupMatchMap.matchId", "GroupMatch.id")
				.select(({ fn }) => [
					"ReportedWeapon.userId",
					"ReportedWeapon.weaponSplId",
					fn.countAll<number>().as("count"),
				])
				.where("GroupMatch.createdAt", ">=", dateToDatabaseTimestamp(starts))
				.where("GroupMatch.createdAt", "<=", dateToDatabaseTimestamp(ends))
				.groupBy(["ReportedWeapon.userId", "ReportedWeapon.weaponSplId"]),
		)
		.selectFrom("q1")
		.select(({ fn }) => [
			"q1.userId",
			"q1.weaponSplId",
			fn.max("q1.count").as("count"),
		])
		.groupBy("q1.userId")
		.execute();

	return Object.fromEntries(
		rows
			.filter((r) => r.count > MATCHES_COUNT_NEEDED_FOR_LEADERBOARD)
			.map((r) => [r.userId, r.weaponSplId]),
	);
}
