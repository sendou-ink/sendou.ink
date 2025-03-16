import { add } from "date-fns";
import type { InferResult } from "kysely";
import { jsonArrayFrom } from "kysely/helpers/sqlite";
import { db } from "~/db/sql";
import { COMMON_USER_FIELDS } from "~/utils/kysely.server";
import { dateToDatabaseTimestamp } from "../../utils/dates";
import invariant from "../../utils/invariant";
import { ordinalToSp } from "../mmr/mmr-utils";
import { seasonObject } from "../mmr/season";
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
					.innerJoin("TeamMember", "TeamMember.userId", "User.id")
					.innerJoin("Team", "Team.id", "TeamMember.teamId")
					.leftJoin(
						"UserSubmittedImage",
						"UserSubmittedImage.id",
						"Team.avatarImgId",
					)
					.select([
						"Team.id",
						"Team.name",
						"UserSubmittedImage.url as avatarUrl",
						"Team.customUrl",
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
	const season = seasonObject(seasonNth);
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
		const sharedSameTeam =
			teams.length === 4 && teams.every((team) => team.id === teams[0].id);

		return {
			...entry,
			team: sharedSameTeam ? teams[0] : undefined,
		};
	});
}

function ignoreTeams({
	season,
	entries,
}: { season: number; entries: TeamLeaderboardBySeasonQueryReturnType }) {
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
