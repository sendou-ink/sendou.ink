import { startOfYear } from "date-fns";
import type {
	Expression,
	ExpressionBuilder,
	NotNull,
	Transaction,
} from "kysely";
import { sql } from "kysely";
import * as R from "remeda";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "~/features/leaderboards/leaderboards-constants";
import * as Seasons from "~/features/mmr/core/Seasons";
import {
	CANCELED_MATCH_SEASON,
	SP_BASE,
	SP_PER_ORDINAL,
} from "~/features/mmr/mmr-constants";
import { identifierToUserIds } from "~/features/mmr/mmr-utils";
import type { TieredSkill } from "~/features/mmr/tiered.server";
import { serializeMaplistSource } from "~/modules/tournament-map-list-generator/source";
import type { TournamentMapListMap } from "~/modules/tournament-map-list-generator/types";
import { mostPopularArrayElement } from "~/utils/arrays";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import invariant from "~/utils/invariant";
import {
	commonUserSelect,
	concatUserSubmittedImagePrefix,
	jsonArrayFrom,
	jsonObjectFrom,
	matchProfileWeapons,
	skillCountsAsSeasonSet,
	tournamentLogoWithDefault,
} from "~/utils/kysely.server";
import { toDBBoolean } from "~/utils/sql";
import type { Unpacked } from "~/utils/types";
import { FULL_GROUP_SIZE } from "../sendouq/q-constants";
import { SendouQError } from "../sendouq/q-utils.server";
import * as SQGroupRepository from "../sendouq/SQGroupRepository.server";
import { MATCHES_PER_SEASONS_PAGE } from "../user-page/user-page-constants";
import { compareMatchToReportedScores } from "./core/match.server";
import * as SendouQMatch from "./core/SendouQMatch";
import * as SkillDifference from "./core/SkillDifference";
import { calculateMatchSkills } from "./core/skills.server";
import {
	summarizeMaps,
	summarizePlayerResults,
} from "./core/summarizer.server";
import * as MatchSkillRepository from "./MatchSkillRepository.server";
import * as PlayerStatRepository from "./PlayerStatRepository.server";
import * as ReportedWeaponRepository from "./ReportedWeaponRepository.server";

/** Whether a GroupMatch with the given id exists. */
export async function exists(id: number) {
	const row = await db
		.selectFrom("GroupMatch")
		.select("id")
		.where("id", "=", id)
		.executeTakeFirst();

	return Boolean(row);
}

export async function findById(id: number) {
	const result = await db
		.selectFrom("GroupMatch")
		.select(({ exists, selectFrom, eb }) => [
			"GroupMatch.id",
			"GroupMatch.createdAt",
			"GroupMatch.confirmedAt",
			"GroupMatch.confirmedByUserId",
			"GroupMatch.chatCode",
			"GroupMatch.cancelRequestedByUserId",
			"GroupMatch.cancelAcceptedByUserId",
			"GroupMatch.noScreen",

			exists(
				selectFrom("Skill")
					.select("Skill.id")
					.where("Skill.groupMatchId", "=", id),
			).as("isLocked"),
			exists(
				selectFrom("Skill")
					.select("Skill.id")
					.where("Skill.groupMatchId", "=", id)
					.where("Skill.season", "=", CANCELED_MATCH_SEASON),
			).as("isCanceled"),
			jsonArrayFrom(
				eb
					.selectFrom("GroupMatchMap")
					.select([
						"GroupMatchMap.id",
						"GroupMatchMap.mode",
						"GroupMatchMap.stageId",
						"GroupMatchMap.source",
						"GroupMatchMap.winnerGroupId",
						"GroupMatchMap.reportedAt",
						"GroupMatchMap.reportedByUserId",
					])
					.where("GroupMatchMap.matchId", "=", id)
					.orderBy("GroupMatchMap.index", "asc"),
			).as("mapList"),
			jsonArrayFrom(
				eb
					.selectFrom("Skill")
					.select([
						"Skill.userId",
						"Skill.identifier",
						"Skill.ordinal",
						previousSkillColumn("ordinal").as("previousOrdinal"),
						previousSkillColumn("matchesCount").as("previousMatchesCount"),
					])
					.where("Skill.groupMatchId", "=", id)
					.where("Skill.season", "!=", CANCELED_MATCH_SEASON),
			).as("skills"),
			groupWithTeamAndMembers(eb, "GroupMatch.alphaGroupId").as("groupAlpha"),
			groupWithTeamAndMembers(eb, "GroupMatch.bravoGroupId").as("groupBravo"),
		])
		.where("GroupMatch.id", "=", id)
		.$narrowType<{
			groupAlpha: NotNull;
			groupBravo: NotNull;
		}>()
		.executeTakeFirst();

	if (!result) return null;

	invariant(result.groupAlpha, `Group alpha not found for match ${id}`);
	invariant(result.groupBravo, `Group bravo not found for match ${id}`);

	return {
		...R.omit(result, ["skills"]),
		skillDifferences: skillDifferences(result),
	};
}

/**
 * The rating each of a match's `Skill` rows replaced, read off the row that most recently
 * preceded it for the same player or roster in the same season. `null` when the match produced
 * the season's first rating for them.
 */
const previousSkillColumn = (column: "ordinal" | "matchesCount") => {
	// the two are kept apart rather than joined on `is`, so that each can be an equality
	// the season's `userId` and `identifier` indexes serve
	const previous = (of: "userId" | "identifier") =>
		sql`(
			select ${sql.ref(`previous.${column}`)}
			from "Skill" as "previous"
			where ${sql.ref(`previous.${of}`)} = ${sql.ref(`Skill.${of}`)}
				and "previous"."season" = "Skill"."season"
				and "previous"."id" < "Skill"."id"
			order by "previous"."id" desc
			limit 1
		)`;

	return sql<number | null>`case
		when "Skill"."userId" is not null then ${previous("userId")}
		else ${previous("identifier")}
	end`;
};

/**
 * What a finished match did to the SP of everyone who played it, keyed the way the match page
 * reads it. Empty while the match has no ratings yet, so before it is finalized or when canceled.
 */
function skillDifferences(match: {
	skills: Array<
		SkillDifference.RatingChange &
			Pick<Tables["Skill"], "userId" | "identifier">
	>;
	groupAlpha: { id: number; members: Array<{ id: number }> };
	groupBravo: { id: number; members: Array<{ id: number }> };
}) {
	const users: Record<number, SkillDifference.UserSkillDifference> = {};
	const groups: Record<number, SkillDifference.GroupSkillDifference> = {};

	for (const skill of match.skills) {
		if (skill.userId !== null) {
			users[skill.userId] = SkillDifference.forUser(skill);
			continue;
		}
		if (!skill.identifier) continue;

		// a roster is identified by its members rather than by its group, so it is matched
		// back to one of the two through a member the two cannot share
		const rosterUserIds = identifierToUserIds(skill.identifier);
		const group = [match.groupAlpha, match.groupBravo].find((group) =>
			group.members.some((member) => rosterUserIds.includes(member.id)),
		);
		if (!group) continue;

		groups[group.id] = SkillDifference.forGroup(skill);
	}

	return { users, groups };
}

function groupWithTeamAndMembers(
	eb: ExpressionBuilder<DB, "GroupMatch">,
	groupIdRef: "GroupMatch.alphaGroupId" | "GroupMatch.bravoGroupId",
) {
	return jsonObjectFrom(
		eb
			.selectFrom("Group")
			.select(({ eb }) => [
				"Group.id",
				"Group.chatCode",
				"Group.matchmade",
				"Group.tierName",
				"Group.tierIsPlus",
				jsonObjectFrom(
					eb
						.selectFrom("AllTeam")
						.leftJoin(
							"UserSubmittedImage",
							"AllTeam.avatarImgId",
							"UserSubmittedImage.id",
						)
						.select((eb) => [
							"AllTeam.id",
							"AllTeam.name",
							"AllTeam.customUrl",
							"AllTeam.mapModePreferences",
							concatUserSubmittedImagePrefix(
								eb.ref("UserSubmittedImage.url"),
							).as("avatarUrl"),
						])
						.where("AllTeam.id", "=", eb.ref("Group.teamId")),
				).as("team"),
				jsonArrayFrom(
					eb
						.selectFrom("GroupMember")
						.innerJoin("User", "User.id", "GroupMember.userId")
						.leftJoin("GroupMatchContinueVote", (join) =>
							join
								.onRef(
									"GroupMember.userId",
									"=",
									"GroupMatchContinueVote.userId",
								)
								.onRef(
									"GroupMember.groupId",
									"=",
									"GroupMatchContinueVote.groupId",
								),
						)
						.select((arrayEb) => [
							...commonUserSelect(arrayEb),
							"GroupMember.note",
							"GroupMember.tierName",
							"GroupMember.tierIsPlus",
							"User.inGameName",
							"User.vc",
							"User.languages",
							"User.noScreen",
							matchProfileWeapons(arrayEb).as("weapons"),
							"User.mapModePreferences",
							"GroupMatchContinueVote.isContinuing",
							arrayEb
								.selectFrom("UserFriendCode")
								.select("UserFriendCode.friendCode")
								.whereRef("UserFriendCode.userId", "=", "User.id")
								.orderBy("UserFriendCode.createdAt", "desc")
								.limit(1)
								.as("friendCode"),
						])
						.whereRef("GroupMember.groupId", "=", groupIdRef)
						.orderBy("GroupMember.userId", "asc"),
				).as("members"),
			])
			.where("Group.id", "=", eb.ref(groupIdRef)),
	);
}

/**
 * Retrieves the pages count of results for a specific user and season. Counting both SendouQ matches and ranked tournaments.
 */
export async function countSeasonResultPagesByUserId({
	userId,
	season,
}: {
	userId: number;
	season: number;
}): Promise<number> {
	const row = await db
		.selectFrom("Skill")
		.select(({ fn }) => [fn.countAll().as("count")])
		.where("userId", "=", userId)
		.where("season", "=", season)
		.where((eb) => skillCountsAsSeasonSet(eb, userId))
		.executeTakeFirstOrThrow();

	return Math.ceil((row.count as number) / MATCHES_PER_SEASONS_PAGE);
}

const tournamentResultsSubQuery = (
	eb: ExpressionBuilder<DB, "Skill">,
	userId: number,
) =>
	eb
		.selectFrom("TournamentResult")
		.innerJoin(
			"CalendarEvent",
			"TournamentResult.tournamentId",
			"CalendarEvent.tournamentId",
		)
		.innerJoin(
			"CalendarEventDate",
			"CalendarEvent.id",
			"CalendarEventDate.eventId",
		)
		.select((eb) => [
			"TournamentResult.setResults",
			"TournamentResult.tournamentId",
			"TournamentResult.tournamentTeamId",
			"CalendarEventDate.startsAt as tournamentStartTime",
			"CalendarEvent.name as tournamentName",
			tournamentLogoWithDefault(eb).as("logoUrl"),
		])
		.whereRef("TournamentResult.tournamentId", "=", "Skill.tournamentId")
		.where("TournamentResult.userId", "=", userId);

const groupMatchResultsSubQuery = (eb: ExpressionBuilder<DB, "Skill">) => {
	const groupMembersSubQuery = (
		eb: ExpressionBuilder<DB, "GroupMatch">,
		side: "alpha" | "bravo",
	) =>
		jsonArrayFrom(
			eb
				.selectFrom("GroupMember")
				.innerJoin("User", "GroupMember.userId", "User.id")
				.select((eb) => commonUserSelect(eb))
				.whereRef(
					"GroupMember.groupId",
					"=",
					side === "alpha"
						? "GroupMatch.alphaGroupId"
						: "GroupMatch.bravoGroupId",
				),
		);

	return eb
		.selectFrom("GroupMatch")
		.select((innerEb) => [
			"GroupMatch.id",
			"GroupMatch.createdAt",
			"GroupMatch.alphaGroupId",
			"GroupMatch.bravoGroupId",
			groupMembersSubQuery(innerEb, "alpha").as("groupAlphaMembers"),
			groupMembersSubQuery(innerEb, "bravo").as("groupBravoMembers"),
			jsonArrayFrom(
				innerEb
					.selectFrom("GroupMatchMap")
					.select((innerEb2) => [
						"GroupMatchMap.winnerGroupId",
						jsonArrayFrom(
							innerEb2
								.selectFrom("ReportedWeapon")
								.select(["ReportedWeapon.userId", "ReportedWeapon.weaponSplId"])
								.whereRef(
									"ReportedWeapon.groupMatchId",
									"=",
									"GroupMatchMap.matchId",
								)
								.whereRef(
									"ReportedWeapon.mapIndex",
									"=",
									"GroupMatchMap.index",
								),
						).as("weapons"),
					])
					.whereRef("GroupMatchMap.matchId", "=", "GroupMatch.id"),
			).as("maps"),
		])
		.whereRef("Skill.groupMatchId", "=", "GroupMatch.id");
};

export type SeasonGroupMatch = Extract<
	Unpacked<Unpacked<ReturnType<typeof findSeasonResultsByUserId>>>,
	{ type: "GROUP_MATCH" }
>["groupMatch"];

export type SeasonTournamentResult = Extract<
	Unpacked<Unpacked<ReturnType<typeof findSeasonResultsByUserId>>>,
	{ type: "TOURNAMENT_RESULT" }
>["tournamentResult"];

/** SP of an openskill ordinal, matching `ordinalToSp` down to its rounding. */
const spOf = (ordinal: Expression<number>) =>
	sql<number>`round(${ordinal} * ${sql.lit(SP_PER_ORDINAL)} + ${sql.lit(SP_BASE)}, 2)`;

/**
 * SP of a roster's rating, or `null` while the roster is not yet ranked and so has
 * no SP to show. Reads `matchesCount` and `ordinal` off the `rosterSkill` selection.
 */
const rosterSp = sql<
	number | null
>`case when ${sql.ref("rosterSkill.matchesCount")} >= ${sql.lit(MATCHES_COUNT_NEEDED_FOR_LEADERBOARD)}
		then ${spOf(sql.ref("rosterSkill.ordinal"))}
	end`;

/**
 * The SP a rating change was worth, or `null` while the rating is still being calculated
 * and so has never been shown. Reads the columns
 * {@link previousRatingColumns} adds, plus `ordinal`, off the named selection.
 */
const spDiffOf = (of: "userSkill" | "rosterSkill") =>
	sql<
		number | null
	>`case when ${sql.ref(`${of}.previousMatchesCount`)} >= ${sql.lit(MATCHES_COUNT_NEEDED_FOR_LEADERBOARD)}
			then round(${spOf(sql.ref(`${of}.ordinal`))} - ${spOf(sql.ref(`${of}.previousOrdinal`))}, 2)
		end`;

/**
 * Season's Skill rows partitioned by `partitionBy`, each carrying the rating it replaced.
 * Rows from SendouQ sets are included and not just the tournament ones the seasons page
 * shows, because a tournament rating's predecessor is just as often a SendouQ set.
 */
const previousRatingColumns = (
	eb: ExpressionBuilder<DB, "Skill">,
	partitionBy: "Skill.userId" | "Skill.identifier",
) =>
	[
		eb.fn
			.agg<number | null>("lag", [eb.ref("Skill.ordinal")])
			.over((ob) => ob.partitionBy(partitionBy).orderBy("Skill.id"))
			.as("previousOrdinal"),
		eb.fn
			.agg<number | null>("lag", [eb.ref("Skill.matchesCount")])
			.over((ob) => ob.partitionBy(partitionBy).orderBy("Skill.id"))
			.as("previousMatchesCount"),
	] as const;

/**
 * Retrieves results of given user, competitive season & page. Both SendouQ matches and ranked tournaments.
 */
export async function findSeasonResultsByUserId({
	userId,
	season,
	page = 1,
}: {
	userId: number;
	season: number;
	page: number;
}) {
	const rows = await db
		.with("userSkill", (db) =>
			db
				.selectFrom("Skill")
				.select((eb) => [
					"Skill.id",
					"Skill.ordinal",
					...previousRatingColumns(eb, "Skill.userId"),
				])
				.where("Skill.userId", "=", userId)
				.where("Skill.season", "=", season),
		)
		.with("rosterSkill", (db) =>
			db
				.selectFrom("Skill")
				.innerJoin("SkillTeamUser", "SkillTeamUser.skillId", "Skill.id")
				.select((eb) => [
					"Skill.id",
					"Skill.tournamentId",
					"Skill.ordinal",
					"Skill.matchesCount",
					...previousRatingColumns(eb, "Skill.identifier"),
				])
				.where("SkillTeamUser.userId", "=", userId)
				.where("Skill.season", "=", season),
		)
		.with("tournamentRosterSkill", (db) =>
			db
				.selectFrom("rosterSkill")
				.select((eb) => [
					"rosterSkill.tournamentId",
					rosterSp.as("teamSp"),
					spDiffOf("rosterSkill").as("teamSpDiff"),
					// a user plays for several rosters when their team subbed mid-tournament,
					// in which case the roster they played the most sets with is theirs.
					// note the ranking happens over every roster and not only the ranked ones,
					// so that an unranked roster of theirs still wins and simply shows nothing
					eb.fn
						.agg<number>("row_number")
						.over((ob) =>
							ob
								.partitionBy("rosterSkill.tournamentId")
								.orderBy(
									sql<number>`${sql.ref("rosterSkill.matchesCount")} - coalesce(${sql.ref("rosterSkill.previousMatchesCount")}, 0)`,
									"desc",
								)
								.orderBy("rosterSkill.id", "desc"),
						)
						.as("rosterRank"),
				])
				.where("rosterSkill.tournamentId", "is not", null),
		)
		.selectFrom("Skill")
		.innerJoin("userSkill", "userSkill.id", "Skill.id")
		.leftJoin("tournamentRosterSkill", (join) =>
			join
				.onRef("tournamentRosterSkill.tournamentId", "=", "Skill.tournamentId")
				.on("tournamentRosterSkill.rosterRank", "=", 1),
		)
		.select((eb) => [
			"Skill.id",
			"Skill.createdAt",
			spDiffOf("userSkill").as("spDiff"),
			"tournamentRosterSkill.teamSp",
			"tournamentRosterSkill.teamSpDiff",
			jsonObjectFrom(tournamentResultsSubQuery(eb, userId)).as(
				"tournamentResult",
			),
			jsonObjectFrom(groupMatchResultsSubQuery(eb)).as("groupMatch"),
		])
		.where("Skill.userId", "=", userId)
		.where("Skill.season", "=", season)
		.where((eb) => skillCountsAsSeasonSet(eb, userId))
		.limit(MATCHES_PER_SEASONS_PAGE)
		.offset(MATCHES_PER_SEASONS_PAGE * (page - 1))
		.orderBy("Skill.id", "desc")
		.execute();

	return rows
		.map((row) => {
			if (row.groupMatch) {
				const chooseMostPopularWeapon = (userId: number) => {
					const weaponSplIds = row
						.groupMatch!.maps.flatMap((map) => map.weapons)
						.filter((w) => w.userId === userId)
						.map((w) => w.weaponSplId);

					return mostPopularArrayElement(weaponSplIds);
				};

				return {
					type: "GROUP_MATCH" as const,
					...R.omit(row, [
						"groupMatch",
						"tournamentResult",
						"spDiff",
						"teamSp",
						"teamSpDiff",
					]),
					// older skills don't have createdAt, so we use groupMatch's createdAt as fallback
					createdAt: row.createdAt ?? row.groupMatch.createdAt,
					groupMatch: {
						...R.omit(row.groupMatch, ["createdAt", "maps"]),
						// null while the rating is still being calculated and so has never been
						// shown, which is the case expression spDiffOf builds
						spDiff: row.spDiff,
						groupAlphaMembers: row.groupMatch.groupAlphaMembers.map((m) => ({
							...m,
							weaponSplId: chooseMostPopularWeapon(m.id),
						})),
						groupBravoMembers: row.groupMatch.groupBravoMembers.map((m) => ({
							...m,
							weaponSplId: chooseMostPopularWeapon(m.id),
						})),
						score: row.groupMatch.maps.reduce(
							(acc, cur) => [
								acc[0] +
									(cur.winnerGroupId === row.groupMatch!.alphaGroupId ? 1 : 0),
								acc[1] +
									(cur.winnerGroupId === row.groupMatch!.bravoGroupId ? 1 : 0),
							],
							[0, 0],
						),
					},
				};
			}

			if (row.tournamentResult) {
				return {
					type: "TOURNAMENT_RESULT" as const,
					...R.omit(row, [
						"groupMatch",
						"tournamentResult",
						"spDiff",
						"teamSp",
						"teamSpDiff",
					]),
					// older skills don't have createdAt, so we use tournament's start time as a fallback
					createdAt: row.createdAt ?? row.tournamentResult.tournamentStartTime,
					tournamentResult: {
						...row.tournamentResult,
						spDiff: row.spDiff,
						teamSp: row.teamSp,
						teamSpDiff: row.teamSpDiff,
					},
				};
			}

			// Skills from dropped teams without tournament results - skip these
			return null;
		})
		.filter((result) => result !== null);
}

export async function findSeasonCanceledMatchesByUserId({
	userId,
	season,
}: {
	userId: number;
	season: number;
}) {
	const { starts, ends } = Seasons.nthToReportingDateRange(season);

	return db
		.selectFrom("GroupMember")
		.innerJoin("Group", "GroupMember.groupId", "Group.id")
		.innerJoin("GroupMatch", (join) =>
			join.on((eb) =>
				eb.or([
					eb("GroupMatch.alphaGroupId", "=", eb.ref("Group.id")),
					eb("GroupMatch.bravoGroupId", "=", eb.ref("Group.id")),
				]),
			),
		)
		.innerJoin("Skill", (join) =>
			join
				.onRef("GroupMatch.id", "=", "Skill.groupMatchId")
				.on("Skill.season", "=", CANCELED_MATCH_SEASON),
		)
		.select((eb) => [
			"GroupMatch.id",
			"GroupMatch.createdAt",
			// requester's report first (it always has the smaller id)
			jsonArrayFrom(
				eb
					.selectFrom("GroupMatchCancelReport")
					.innerJoin(
						"User as Author",
						"Author.id",
						"GroupMatchCancelReport.authorUserId",
					)
					.select((innerEb) => [
						"GroupMatchCancelReport.reason",
						"Author.username as authorUsername",
						jsonArrayFrom(
							innerEb
								.selectFrom("GroupMatchCancelReportPlayer")
								.innerJoin(
									"User",
									"User.id",
									"GroupMatchCancelReportPlayer.userId",
								)
								.select(["User.id", "User.username"])
								.whereRef(
									"GroupMatchCancelReportPlayer.cancelReportId",
									"=",
									"GroupMatchCancelReport.id",
								)
								.orderBy("User.username", "asc"),
						).as("nominatedPlayers"),
					])
					.whereRef("GroupMatchCancelReport.groupMatchId", "=", "GroupMatch.id")
					.orderBy("GroupMatchCancelReport.id", "asc"),
			).as("cancelReports"),
		])
		.where("GroupMember.userId", "=", userId)
		.where("GroupMatch.createdAt", ">=", dateToDatabaseTimestamp(starts))
		.where("GroupMatch.createdAt", "<=", dateToDatabaseTimestamp(ends))
		.orderBy("GroupMatch.createdAt", "desc")
		.execute();
}

/** Returns both teams' cancel reports of a match with the nominated player ids, requester's report first. */
export async function findCancelReportsByGroupMatchId(groupMatchId: number) {
	return db
		.selectFrom("GroupMatchCancelReport")
		.select((eb) => [
			"GroupMatchCancelReport.groupId",
			"GroupMatchCancelReport.authorUserId",
			"GroupMatchCancelReport.reason",
			jsonArrayFrom(
				eb
					.selectFrom("GroupMatchCancelReportPlayer")
					.select("GroupMatchCancelReportPlayer.userId")
					.whereRef(
						"GroupMatchCancelReportPlayer.cancelReportId",
						"=",
						"GroupMatchCancelReport.id",
					),
			).as("nominatedPlayers"),
		])
		.where("GroupMatchCancelReport.groupMatchId", "=", groupMatchId)
		.orderBy("GroupMatchCancelReport.id", "asc")
		.execute();
}

/**
 * Counts per user how many canceled matches they have been nominated in as a cause,
 * both within the given season and within the current calendar year. Only finalized
 * cancellations count; a match where both teams nominated the user counts once.
 */
export async function findCancelNominationCountsByUserIds({
	userIds,
	season,
}: {
	userIds: number[];
	season: number;
}) {
	const seasonRange = Seasons.nthToReportingDateRange(season);
	const yearStarts = startOfYear(new Date());
	const from = new Date(
		Math.min(seasonRange.starts.getTime(), yearStarts.getTime()),
	);

	const rows = await db
		.selectFrom("GroupMatchCancelReportPlayer")
		.innerJoin(
			"GroupMatchCancelReport",
			"GroupMatchCancelReport.id",
			"GroupMatchCancelReportPlayer.cancelReportId",
		)
		.innerJoin(
			"GroupMatch",
			"GroupMatch.id",
			"GroupMatchCancelReport.groupMatchId",
		)
		.innerJoin("Skill", (join) =>
			join
				.onRef("Skill.groupMatchId", "=", "GroupMatch.id")
				.on("Skill.season", "=", CANCELED_MATCH_SEASON),
		)
		.select([
			"GroupMatchCancelReportPlayer.userId",
			"GroupMatch.id as groupMatchId",
			"GroupMatch.createdAt",
		])
		.where("GroupMatchCancelReportPlayer.userId", "in", userIds)
		.where("GroupMatch.createdAt", ">=", dateToDatabaseTimestamp(from))
		.execute();

	const rowsByUserId = R.groupBy(rows, (row) => row.userId);

	return userIds.map((userId) => {
		const userMatches = R.uniqueBy(
			rowsByUserId[userId] ?? [],
			(row) => row.groupMatchId,
		);

		return {
			userId,
			seasonCount: userMatches.filter(
				(row) =>
					row.createdAt >= dateToDatabaseTimestamp(seasonRange.starts) &&
					row.createdAt <= dateToDatabaseTimestamp(seasonRange.ends),
			).length,
			yearCount: userMatches.filter(
				(row) => row.createdAt >= dateToDatabaseTimestamp(yearStarts),
			).length,
		};
	});
}

/**
 * Creates a match between two groups. Every match made in the app comes from a
 * ready check, which is resolved as part of the same transaction; only seeds and
 * tests, which have no check to resolve, leave `readyCheckId` out.
 */
export function insert({
	alphaGroupId,
	bravoGroupId,
	mapList,
	tiers,
	readyCheckId,
}: {
	alphaGroupId: number;
	bravoGroupId: number;
	mapList: TournamentMapListMap[];
	/** Tiers the two groups and their members hold as the match starts, snapshotted on them. */
	tiers: MatchTiers;
	readyCheckId?: number;
}) {
	return db.transaction().execute(async (trx) => {
		const existingMatch = await trx
			.selectFrom("GroupMatch")
			.select(["id"])
			.where((eb) =>
				eb.or([
					eb("alphaGroupId", "in", [alphaGroupId, bravoGroupId]),
					eb("bravoGroupId", "in", [alphaGroupId, bravoGroupId]),
				]),
			)
			.executeTakeFirst();

		if (existingMatch) {
			throw new SendouQError("Can't leave group when already in a match");
		}

		const memberPreferringNoScreen = await trx
			.selectFrom("GroupMember")
			.innerJoin("User", "User.id", "GroupMember.userId")
			.select("User.id")
			.where("GroupMember.groupId", "in", [alphaGroupId, bravoGroupId])
			.where("User.noScreen", "=", 1)
			.executeTakeFirst();

		const match = await trx
			.insertInto("GroupMatch")
			.values({
				alphaGroupId,
				bravoGroupId,
				chatCode: shortNanoid(),
				noScreen: memberPreferringNoScreen ? 1 : 0,
			})
			.returningAll()
			.executeTakeFirstOrThrow();

		await trx
			.insertInto("GroupMatchMap")
			.values(
				mapList.map((map, i) => ({
					matchId: match.id,
					index: i,
					mode: map.mode,
					stageId: map.stageId,
					source: serializeMaplistSource(map.source),
				})),
			)
			.execute();

		await snapshotTiers(tiers, trx);

		await SQGroupRepository.syncTeamId(alphaGroupId, trx);
		await SQGroupRepository.syncTeamId(bravoGroupId, trx);

		// both groups are locked into this match, so anything pending is moot
		await SQGroupRepository.deleteLikesAndSuggestionsByGroupId(
			alphaGroupId,
			trx,
		);
		await SQGroupRepository.deleteLikesAndSuggestionsByGroupId(
			bravoGroupId,
			trx,
		);

		if (typeof readyCheckId === "number") {
			await SQGroupRepository.deleteReadyCheck(
				{ id: readyCheckId, markMissedMembers: false },
				trx,
			);
		}

		await validateCreatedMatch(trx, alphaGroupId, bravoGroupId);

		return match;
	});
}

/** Tiers of a starting match's two groups and of the members they are made of. */
export interface MatchTiers {
	groups: Array<{
		id: number;
		tier: TieredSkill["tier"];
		members: Array<{
			userId: number;
			/** `"CALCULATING"` when they have too few ranked sets of the season to have a tier. */
			tier: TieredSkill["tier"] | "CALCULATING";
		}>;
	}>;
}

/**
 * Records the tiers on the groups and members themselves, so that the match page keeps showing
 * what was held when it was played. Recomputing could not: tier thresholds are percentiles of
 * the season's live distribution and so shift as the season goes on.
 */
async function snapshotTiers(tiers: MatchTiers, trx: Transaction<DB>) {
	for (const group of tiers.groups) {
		await trx
			.updateTable("Group")
			.set({
				tierName: group.tier.name,
				tierIsPlus: toDBBoolean(group.tier.isPlus),
			})
			.where("Group.id", "=", group.id)
			.execute();

		for (const member of group.members) {
			await trx
				.updateTable("GroupMember")
				.set(
					member.tier === "CALCULATING"
						? { tierName: "CALCULATING", tierIsPlus: 0 }
						: {
								tierName: member.tier.name,
								tierIsPlus: toDBBoolean(member.tier.isPlus),
							},
				)
				.where("GroupMember.groupId", "=", group.id)
				.where("GroupMember.userId", "=", member.userId)
				.execute();
		}
	}
}

async function validateCreatedMatch(
	trx: Transaction<DB>,
	alphaGroupId: number,
	bravoGroupId: number,
) {
	for (const groupId of [alphaGroupId, bravoGroupId]) {
		const members = await trx
			.selectFrom("GroupMember")
			.select("GroupMember.userId")
			.where("GroupMember.groupId", "=", groupId)
			.execute();

		if (members.length !== FULL_GROUP_SIZE) {
			throw new Error(`Group ${groupId} does not have full group members`);
		}

		const matches = await trx
			.selectFrom("GroupMatch")
			.select("GroupMatch.id")
			.where((eb) =>
				eb.or([
					eb("GroupMatch.alphaGroupId", "=", groupId),
					eb("GroupMatch.bravoGroupId", "=", groupId),
				]),
			)
			.execute();

		if (matches.length !== 1) {
			throw new Error(`Group ${groupId} is already in a match`);
		}
	}
}

export function lockMatchWithoutSkillChange(
	groupMatchId: number,
	trx?: Transaction<DB>,
) {
	return (trx ?? db)
		.insertInto("Skill")
		.values({
			groupMatchId,
			identifier: null,
			mu: -1,
			season: CANCELED_MATCH_SEASON,
			sigma: -1,
			ordinal: -1,
			userId: null,
			matchesCount: 0,
		})
		.execute();
}

export type CancelMatchResult =
	| { status: "CANCEL_REPORTED"; shouldRefreshCaches: false }
	| { status: "CANCEL_CONFIRMED"; shouldRefreshCaches: true }
	| { status: "CANT_CANCEL"; shouldRefreshCaches: false }
	| { status: "DUPLICATE"; shouldRefreshCaches: false };

export async function cancelMatch({
	matchId,
	isAdminReport,
}: {
	matchId: number;
	isAdminReport?: boolean;
}): Promise<CancelMatchResult> {
	const reportedByUserId = actorId();
	const match = await findById(matchId);
	invariant(match, "Match not found");

	if (match.isLocked) {
		return { status: "CANT_CANCEL", shouldRefreshCaches: false };
	}

	if (isAdminReport) {
		await db.transaction().execute(async (trx) => {
			await trx
				.updateTable("GroupMatchMap")
				.set({
					winnerGroupId: null,
					reportedAt: dateToDatabaseTimestamp(new Date()),
					reportedByUserId,
				})
				.where("matchId", "=", matchId)
				.execute();
			await SQGroupRepository.setAsInactive(match.groupAlpha.id, trx);
			await SQGroupRepository.setAsInactive(match.groupBravo.id, trx);
			await lockMatchWithoutSkillChange(match.id, trx);
			await trx
				.updateTable("GroupMatch")
				.set({ cancelRequestedByUserId: null })
				.where("id", "=", matchId)
				.execute();
			// a pending cancel request's report is one-sided, staff canceling overrides it
			await trx
				.deleteFrom("GroupMatchCancelReport")
				.where("groupMatchId", "=", matchId)
				.execute();
		});
		return { status: "CANCEL_CONFIRMED", shouldRefreshCaches: true };
	}

	const members = buildMembers(match);
	const reporterGroupId = members.find(
		(m) => m.id === reportedByUserId,
	)?.groupId;
	invariant(reporterGroupId, "Reporter is not a member of any group");

	const previousReporterGroupId = lastReporterGroupId(match, members);

	const compared = compareMatchToReportedScores({
		match,
		winners: [],
		newReporterGroupId: reporterGroupId,
		previousReporterGroupId,
	});

	if (compared === "DUPLICATE") {
		return { status: "DUPLICATE", shouldRefreshCaches: false };
	}

	if (compared === "DIFFERENT") {
		await SQGroupRepository.setAsInactive(reporterGroupId);
		return { status: "CANT_CANCEL", shouldRefreshCaches: false };
	}

	if (compared === "FIRST_REPORT" || compared === "FIX_PREVIOUS") {
		await db.transaction().execute(async (trx) => {
			await trx
				.updateTable("GroupMatchMap")
				.set({
					winnerGroupId: null,
					reportedAt: dateToDatabaseTimestamp(new Date()),
					reportedByUserId,
				})
				.where("matchId", "=", matchId)
				.execute();
			await SQGroupRepository.setAsInactive(reporterGroupId, trx);
			if (compared === "FIX_PREVIOUS") {
				await ReportedWeaponRepository.replaceByMatchId(matchId, [], trx);
			}
		});
		return { status: "CANCEL_REPORTED", shouldRefreshCaches: false };
	}

	await db.transaction().execute(async (trx) => {
		await SQGroupRepository.setAsInactive(reporterGroupId, trx);
		await lockMatchWithoutSkillChange(match.id, trx);
	});
	return { status: "CANCEL_CONFIRMED", shouldRefreshCaches: true };
}

export type RequestCancelResult =
	| { status: "REQUESTED" }
	| { status: "ALREADY_LOCKED" }
	| { status: "ALREADY_REQUESTED" };

export async function requestCancelMatch({
	matchId,
	requestedByUserId,
	reason,
	nominatedUserIds,
}: {
	matchId: number;
	requestedByUserId: number;
	reason: string;
	nominatedUserIds: number[];
}): Promise<RequestCancelResult> {
	const match = await findById(matchId);
	invariant(match, "Match not found");

	const requesterGroupId = buildMembers(match).find(
		(m) => m.id === requestedByUserId,
	)?.groupId;
	invariant(requesterGroupId, "Requester is not a member of any group");

	return db.transaction().execute<RequestCancelResult>(async (trx) => {
		const cancelState = await findCancelState(matchId, trx);

		if (cancelState.isLocked) {
			return { status: "ALREADY_LOCKED" };
		}

		if (cancelState.cancelRequestedByUserId) {
			return { status: "ALREADY_REQUESTED" };
		}

		await trx
			.updateTable("GroupMatch")
			.set({ cancelRequestedByUserId: requestedByUserId })
			.where("id", "=", matchId)
			.execute();
		await insertCancelReport(
			{
				groupMatchId: matchId,
				groupId: requesterGroupId,
				authorUserId: requestedByUserId,
				reason,
				nominatedUserIds,
			},
			trx,
		);

		return { status: "REQUESTED" };
	});
}

export type AcceptCancelResult =
	| { status: "ACCEPTED" }
	| { status: "ALREADY_LOCKED" }
	| { status: "NO_CANCEL_REQUEST" }
	| { status: "NOT_ALLOWED" };

export async function acceptCancelMatch({
	matchId,
	acceptedByUserId,
	reason,
	nominatedUserIds,
}: {
	matchId: number;
	acceptedByUserId: number;
	reason: string;
	nominatedUserIds: number[];
}): Promise<AcceptCancelResult> {
	const match = await findById(matchId);
	invariant(match, "Match not found");

	const members = buildMembers(match);

	const accepterGroupId = members.find(
		(m) => m.id === acceptedByUserId,
	)?.groupId;
	invariant(accepterGroupId, "Accepter is not a member of any group");

	return db.transaction().execute<AcceptCancelResult>(async (trx) => {
		const cancelState = await findCancelState(matchId, trx);

		if (cancelState.isLocked) {
			return { status: "ALREADY_LOCKED" };
		}

		if (!cancelState.cancelRequestedByUserId) {
			return { status: "NO_CANCEL_REQUEST" };
		}

		const requesterGroupId = members.find(
			(m) => m.id === cancelState.cancelRequestedByUserId,
		)?.groupId;
		invariant(requesterGroupId, "Requester is not a member of any group");

		if (accepterGroupId === requesterGroupId) {
			return { status: "NOT_ALLOWED" };
		}

		await SQGroupRepository.setAsInactive(requesterGroupId, trx);
		await SQGroupRepository.setAsInactive(accepterGroupId, trx);
		await lockMatchWithoutSkillChange(match.id, trx);
		await trx
			.updateTable("GroupMatch")
			.set({ cancelAcceptedByUserId: acceptedByUserId })
			.where("id", "=", matchId)
			.execute();
		await insertCancelReport(
			{
				groupMatchId: matchId,
				groupId: accepterGroupId,
				authorUserId: acceptedByUserId,
				reason,
				nominatedUserIds,
			},
			trx,
		);

		return { status: "ACCEPTED" };
	});
}

export type RefuseCancelResult =
	| { status: "REFUSED" }
	| { status: "ALREADY_LOCKED" }
	| { status: "NO_CANCEL_REQUEST" }
	| { status: "NOT_ALLOWED" };

export async function refuseCancelMatch({
	matchId,
	refusedByUserId,
}: {
	matchId: number;
	refusedByUserId: number;
}): Promise<RefuseCancelResult> {
	const match = await findById(matchId);
	invariant(match, "Match not found");

	if (match.isLocked) {
		return { status: "ALREADY_LOCKED" };
	}

	if (!match.cancelRequestedByUserId) {
		return { status: "NO_CANCEL_REQUEST" };
	}

	const members = buildMembers(match);
	const requesterGroupId = members.find(
		(m) => m.id === match.cancelRequestedByUserId,
	)?.groupId;
	const refuserGroupId = members.find((m) => m.id === refusedByUserId)?.groupId;
	invariant(refuserGroupId, "Refuser is not a member of any group");

	if (refuserGroupId === requesterGroupId) {
		return { status: "NOT_ALLOWED" };
	}

	await db.transaction().execute(async (trx) => {
		await trx
			.updateTable("GroupMatch")
			.set({ cancelRequestedByUserId: null })
			.where("id", "=", matchId)
			.execute();
		await trx
			.deleteFrom("GroupMatchCancelReport")
			.where("groupMatchId", "=", matchId)
			.execute();
	});

	return { status: "REFUSED" };
}

export type ReportMapWinnerResult =
	| { status: "MAP_REPORTED" }
	| { status: "MATCH_REPORTED" }
	| { status: "MATCH_FINALIZED" }
	| { status: "ALREADY_LOCKED" }
	| { status: "INVALID_WINNER" }
	| { status: "SCORE_DISAGREEMENT" }
	| { status: "STALE" };

export async function reportMapWinner({
	matchId,
	winnerId,
	reportedByUserId,
	reportedCount,
	isStaffReport,
}: {
	matchId: number;
	winnerId: number;
	reportedByUserId: number;
	reportedCount: number;
	isStaffReport?: boolean;
}): Promise<ReportMapWinnerResult> {
	const match = await findById(matchId);
	invariant(match, "Match not found");

	if (match.isLocked) {
		return { status: "ALREADY_LOCKED" };
	}

	if (winnerId !== match.groupAlpha.id && winnerId !== match.groupBravo.id) {
		return { status: "INVALID_WINNER" };
	}

	const {
		mapsToWin,
		alphaWins: existingAlphaWins,
		bravoWins: existingBravoWins,
		isDecisive: scoreAlreadyDecisive,
	} = SendouQMatch.score(match);

	// Confirmation flow: score is already decisive (first team reported the set-ending map)
	if (scoreAlreadyDecisive) {
		return handleMatchConfirmation({
			match,
			winnerId,
			reportedByUserId,
			existingAlphaWins,
			mapsToWin,
			isStaffReport,
		});
	}

	const actualReportedCount = match.mapList.filter(
		(m) => m.winnerGroupId !== null,
	).length;
	if (actualReportedCount !== reportedCount) {
		return { status: "STALE" };
	}

	const currentMap = match.mapList.find((m) => m.winnerGroupId === null);
	invariant(currentMap, "No unreported map found");

	const alphaWins =
		existingAlphaWins + (winnerId === match.groupAlpha.id ? 1 : 0);
	const bravoWins =
		existingBravoWins + (winnerId === match.groupBravo.id ? 1 : 0);
	const matchIsOver = alphaWins >= mapsToWin || bravoWins >= mapsToWin;

	// Non-final map: report and continue
	if (!matchIsOver) {
		await db
			.updateTable("GroupMatchMap")
			.set({
				winnerGroupId: winnerId,
				reportedAt: dateToDatabaseTimestamp(new Date()),
				reportedByUserId,
			})
			.where("id", "=", currentMap.id)
			.execute();
		return { status: "MAP_REPORTED" };
	}

	// Set-ending map reported by staff: auto-finalize (no awaiting confirmation)
	if (isStaffReport) {
		return handleStaffFinalization({
			match,
			currentMap,
			winnerId,
			reportedByUserId,
		});
	}

	// Set-ending map: first report, await confirmation from other team
	const members = buildMembers(match);
	const reporterGroupId = members.find(
		(m) => m.id === reportedByUserId,
	)?.groupId;
	invariant(reporterGroupId, "Reporter is not a member of any group");

	await db.transaction().execute(async (trx) => {
		await trx
			.updateTable("GroupMatchMap")
			.set({
				winnerGroupId: winnerId,
				reportedAt: dateToDatabaseTimestamp(new Date()),
				reportedByUserId,
			})
			.where("id", "=", currentMap.id)
			.execute();
		await SQGroupRepository.setAsInactive(reporterGroupId, trx);
	});

	return { status: "MATCH_REPORTED" };
}

async function handleMatchConfirmation({
	match,
	winnerId,
	reportedByUserId,
	existingAlphaWins,
	mapsToWin,
	isStaffReport,
}: {
	match: NonNullable<Awaited<ReturnType<typeof findById>>>;
	winnerId: number;
	reportedByUserId: number;
	existingAlphaWins: number;
	mapsToWin: number;
	isStaffReport?: boolean;
}): Promise<ReportMapWinnerResult> {
	const members = buildMembers(match);

	// Find the deciding map (last map with a winner)
	const decidingMap = match.mapList
		.toReversed()
		.find((m) => m.winnerGroupId !== null);
	invariant(decidingMap, "No deciding map found");

	const originalReporterGroupId = decidingMap.reportedByUserId
		? members.find((m) => m.id === decidingMap.reportedByUserId)?.groupId
		: undefined;

	// Staff confirms on behalf of the non-reporting team; their group is the one
	// still ACTIVE and needs to be deactivated when the match finalizes.
	const groupToDeactivate = isStaffReport
		? originalReporterGroupId === match.groupAlpha.id
			? match.groupBravo.id
			: match.groupAlpha.id
		: members.find((m) => m.id === reportedByUserId)?.groupId;
	invariant(groupToDeactivate, "Reporter is not a member of any group");

	if (!isStaffReport) {
		// Same team re-reporting
		if (groupToDeactivate === originalReporterGroupId) {
			return { status: "STALE" };
		}

		// Other team reports a different winner for the deciding map
		if (winnerId !== decidingMap.winnerGroupId) {
			await SQGroupRepository.setAsInactive(groupToDeactivate);
			return { status: "SCORE_DISAGREEMENT" };
		}
	} else if (winnerId !== decidingMap.winnerGroupId) {
		return { status: "STALE" };
	}

	// Other team confirms the score — finalize
	const winnerGroupId =
		existingAlphaWins >= mapsToWin ? match.groupAlpha.id : match.groupBravo.id;
	const loserGroupId =
		existingAlphaWins >= mapsToWin ? match.groupBravo.id : match.groupAlpha.id;

	const winners: ("ALPHA" | "BRAVO")[] = match.mapList
		.filter((m) => m.winnerGroupId !== null)
		.map((m) => (m.winnerGroupId === match.groupAlpha.id ? "ALPHA" : "BRAVO"));

	const finalized = await finalizeMatch({
		match,
		members,
		winners,
		winnerGroupId,
		loserGroupId,
		confirmedByUserId: reportedByUserId,
		preFinalize: (trx) =>
			SQGroupRepository.setAsInactive(groupToDeactivate, trx),
	});

	if (!finalized) {
		return { status: "ALREADY_LOCKED" };
	}

	return { status: "MATCH_FINALIZED" };
}

async function handleStaffFinalization({
	match,
	currentMap,
	winnerId,
	reportedByUserId,
}: {
	match: NonNullable<Awaited<ReturnType<typeof findById>>>;
	currentMap: NonNullable<
		Awaited<ReturnType<typeof findById>>
	>["mapList"][number];
	winnerId: number;
	reportedByUserId: number;
}): Promise<ReportMapWinnerResult> {
	const winnerGroupId = winnerId;
	const loserGroupId =
		winnerId === match.groupAlpha.id
			? match.groupBravo.id
			: match.groupAlpha.id;

	const members = buildMembers(match);

	const winners: ("ALPHA" | "BRAVO")[] = [
		...match.mapList
			.filter((m) => m.winnerGroupId !== null)
			.map((m) =>
				m.winnerGroupId === match.groupAlpha.id
					? ("ALPHA" as const)
					: ("BRAVO" as const),
			),
		winnerId === match.groupAlpha.id ? "ALPHA" : "BRAVO",
	];

	const finalized = await finalizeMatch({
		match,
		members,
		winners,
		winnerGroupId,
		loserGroupId,
		confirmedByUserId: reportedByUserId,
		preFinalize: async (trx) => {
			await trx
				.updateTable("GroupMatchMap")
				.set({
					winnerGroupId,
					reportedAt: dateToDatabaseTimestamp(new Date()),
					reportedByUserId,
				})
				.where("id", "=", currentMap.id)
				.execute();
			await SQGroupRepository.setAsInactive(match.groupAlpha.id, trx);
			await SQGroupRepository.setAsInactive(match.groupBravo.id, trx);
		},
	});

	if (!finalized) {
		return { status: "ALREADY_LOCKED" };
	}

	return { status: "MATCH_FINALIZED" };
}

async function finalizeMatch({
	match,
	members,
	winners,
	winnerGroupId,
	loserGroupId,
	confirmedByUserId,
	preFinalize,
}: {
	match: NonNullable<Awaited<ReturnType<typeof findById>>>;
	members: ReturnType<typeof buildMembers>;
	winners: ("ALPHA" | "BRAVO")[];
	winnerGroupId: number;
	loserGroupId: number;
	confirmedByUserId: number | null;
	preFinalize?: (trx: Transaction<DB>) => Promise<unknown>;
}) {
	// the match belongs to the season it was created in, not to whichever season
	// is open when it happens to be reported (up to 25h later, see Seasons)
	const season = Seasons.currentOrPrevious(
		databaseTimestampToDate(match.createdAt),
	)?.nth;
	invariant(typeof season === "number", `No season for match ${match.id}`);

	const newSkills = await calculateMatchSkills({
		groupMatchId: match.id,
		season,
		winner: (match.groupAlpha.id === winnerGroupId
			? match.groupAlpha
			: match.groupBravo
		).members.map((m) => m.id),
		loser: (match.groupAlpha.id === loserGroupId
			? match.groupAlpha
			: match.groupBravo
		).members.map((m) => m.id),
	});

	return db.transaction().execute(async (trx) => {
		const { isLocked, confirmedAt } = await findLockState(match.id, trx);
		if (isLocked || confirmedAt) return false;

		if (preFinalize) await preFinalize(trx);
		await trx
			.updateTable("GroupMatch")
			.set({
				confirmedAt: dateToDatabaseTimestamp(new Date()),
				confirmedByUserId,
				cancelRequestedByUserId: null,
			})
			.where("id", "=", match.id)
			.execute();
		// a pending cancel request's report is obsolete once the match finishes normally
		await trx
			.deleteFrom("GroupMatchCancelReport")
			.where("groupMatchId", "=", match.id)
			.execute();
		await PlayerStatRepository.upsertMapResults(
			summarizeMaps({ match, season, members, winners }),
			trx,
		);
		await PlayerStatRepository.upsertPlayerResults(
			summarizePlayerResults({ match, season, members, winners }),
			trx,
		);
		await MatchSkillRepository.insertMatchSkills(newSkills, trx);

		return true;
	});
}

/** Lock state read inside the finalizing transaction so concurrent confirmations can't both finalize. */
function findLockState(matchId: number, trx: Transaction<DB>) {
	return trx
		.selectFrom("GroupMatch")
		.select(({ exists, selectFrom }) => [
			"GroupMatch.confirmedAt",
			exists(
				selectFrom("Skill")
					.select("Skill.id")
					.where("Skill.groupMatchId", "=", matchId),
			).as("isLocked"),
		])
		.where("GroupMatch.id", "=", matchId)
		.executeTakeFirstOrThrow();
}

/** Matches created before the given cutoff whose score was never confirmed and that no cancellation has locked. */
export function findUnfinishedMatchesCreatedBefore(cutoff: Date) {
	return db
		.selectFrom("GroupMatch")
		.select(["GroupMatch.id", "GroupMatch.chatCode"])
		.where("GroupMatch.confirmedAt", "is", null)
		.where("GroupMatch.createdAt", "<", dateToDatabaseTimestamp(cutoff))
		.where(({ not, exists, selectFrom }) =>
			not(
				exists(
					selectFrom("Skill")
						.select("Skill.id")
						.whereRef("Skill.groupMatchId", "=", "GroupMatch.id"),
				),
			),
		)
		.execute();
}

export type ResolveUnfinishedMatchResult =
	| { status: "CANCELED" }
	| { status: "CONFIRMED" }
	| { status: "ALREADY_LOCKED" };

/**
 * Resolves a match the teams never finished: cancels it if the score is not
 * decisive, otherwise confirms the one team's report on the other's behalf.
 * Leaves `confirmedByUserId` empty as no user acted.
 */
export async function resolveUnfinishedMatch(
	matchId: number,
): Promise<ResolveUnfinishedMatchResult> {
	const match = await findById(matchId);
	invariant(match, "Match not found");

	if (match.isLocked || match.confirmedAt) {
		return { status: "ALREADY_LOCKED" };
	}

	const { mapsToWin, alphaWins, isDecisive } = SendouQMatch.score(match);

	if (!isDecisive) {
		await db.transaction().execute(async (trx) => {
			await trx
				.updateTable("GroupMatchMap")
				.set({ winnerGroupId: null })
				.where("matchId", "=", matchId)
				.execute();
			await SQGroupRepository.setAsInactive(match.groupAlpha.id, trx);
			await SQGroupRepository.setAsInactive(match.groupBravo.id, trx);
			await lockMatchWithoutSkillChange(match.id, trx);
			await trx
				.updateTable("GroupMatch")
				.set({ cancelRequestedByUserId: null })
				.where("id", "=", matchId)
				.execute();
		});
		return { status: "CANCELED" };
	}

	const winnerGroupId =
		alphaWins >= mapsToWin ? match.groupAlpha.id : match.groupBravo.id;
	const loserGroupId =
		alphaWins >= mapsToWin ? match.groupBravo.id : match.groupAlpha.id;

	const winners: ("ALPHA" | "BRAVO")[] = match.mapList
		.filter((m) => m.winnerGroupId !== null)
		.map((m) => (m.winnerGroupId === match.groupAlpha.id ? "ALPHA" : "BRAVO"));

	const finalized = await finalizeMatch({
		match,
		members: buildMembers(match),
		winners,
		winnerGroupId,
		loserGroupId,
		confirmedByUserId: null,
		preFinalize: async (trx) => {
			await SQGroupRepository.setAsInactive(match.groupAlpha.id, trx);
			await SQGroupRepository.setAsInactive(match.groupBravo.id, trx);
		},
	});

	if (!finalized) {
		return { status: "ALREADY_LOCKED" };
	}

	return { status: "CONFIRMED" };
}

export async function undoMatchReport({
	matchId,
	requestedByUserId,
	isStaff,
}: {
	matchId: number;
	requestedByUserId: number;
	isStaff?: boolean;
}): Promise<{ status: "SUCCESS" | "NOT_ALLOWED" | "ALREADY_LOCKED" }> {
	const match = await findById(matchId);
	invariant(match, "Match not found");

	if (match.isLocked) {
		return { status: "ALREADY_LOCKED" };
	}

	if (!SendouQMatch.score(match).isDecisive) {
		return { status: "NOT_ALLOWED" };
	}

	const decidingMapIndex = match.mapList.findLastIndex(
		(m) => m.winnerGroupId !== null,
	);
	const decidingMap =
		decidingMapIndex === -1 ? undefined : match.mapList[decidingMapIndex];
	invariant(decidingMap, "No deciding map found");

	if (!decidingMap.reportedByUserId) {
		return { status: "NOT_ALLOWED" };
	}

	const members = buildMembers(match);
	const requesterGroupId = members.find(
		(m) => m.id === requestedByUserId,
	)?.groupId;
	const reporterGroupId = members.find(
		(m) => m.id === decidingMap.reportedByUserId,
	)?.groupId;

	if (!isStaff && requesterGroupId !== reporterGroupId) {
		return { status: "NOT_ALLOWED" };
	}

	await db.transaction().execute(async (trx) => {
		await trx
			.updateTable("GroupMatchMap")
			.set({ winnerGroupId: null, reportedAt: null, reportedByUserId: null })
			.where("id", "=", decidingMap.id)
			.execute();

		await ReportedWeaponRepository.deleteByMapIndex(
			{ matchId, mapIndex: decidingMapIndex },
			trx,
		);

		await trx
			.deleteFrom("GroupMatchContinueVote")
			.where("GroupMatchContinueVote.groupId", "in", [
				match.groupAlpha.id,
				match.groupBravo.id,
			])
			.execute();
	});

	return { status: "SUCCESS" };
}

export async function undoMapReport({
	matchId,
	mapIndex,
}: {
	matchId: number;
	mapIndex: number;
}): Promise<{ status: "SUCCESS" | "NOT_ALLOWED" | "ALREADY_LOCKED" }> {
	const match = await findById(matchId);
	invariant(match, "Match not found");

	if (match.isLocked) {
		return { status: "ALREADY_LOCKED" };
	}

	if (SendouQMatch.score(match).isDecisive) {
		return { status: "NOT_ALLOWED" };
	}

	const targetMap = match.mapList[mapIndex];
	if (!targetMap || targetMap.winnerGroupId === null) {
		return { status: "NOT_ALLOWED" };
	}

	const hasLaterReport = match.mapList
		.slice(mapIndex + 1)
		.some((m) => m.winnerGroupId !== null);
	if (hasLaterReport) {
		return { status: "NOT_ALLOWED" };
	}

	await db.transaction().execute(async (trx) => {
		await trx
			.updateTable("GroupMatchMap")
			.set({ winnerGroupId: null })
			.where("id", "=", targetMap.id)
			.execute();

		await ReportedWeaponRepository.deleteByMapIndex({ matchId, mapIndex }, trx);

		await trx
			.deleteFrom("GroupMatchContinueVote")
			.where("GroupMatchContinueVote.groupId", "in", [
				match.groupAlpha.id,
				match.groupBravo.id,
			])
			.execute();
	});

	return { status: "SUCCESS" };
}

/** Cancel request state read inside the writing transaction so concurrent requests can't both pass the guards. */
function findCancelState(matchId: number, trx: Transaction<DB>) {
	return trx
		.selectFrom("GroupMatch")
		.select(({ exists, selectFrom }) => [
			"GroupMatch.cancelRequestedByUserId",
			exists(
				selectFrom("Skill")
					.select("Skill.id")
					.where("Skill.groupMatchId", "=", matchId),
			).as("isLocked"),
		])
		.where("GroupMatch.id", "=", matchId)
		.executeTakeFirstOrThrow();
}

async function insertCancelReport(
	{
		groupMatchId,
		groupId,
		authorUserId,
		reason,
		nominatedUserIds,
	}: {
		groupMatchId: number;
		groupId: number;
		authorUserId: number;
		reason: string;
		nominatedUserIds: number[];
	},
	trx: Transaction<DB>,
) {
	const report = await trx
		.insertInto("GroupMatchCancelReport")
		.values({ groupMatchId, groupId, authorUserId, reason })
		.returning("id")
		.executeTakeFirstOrThrow();

	await trx
		.insertInto("GroupMatchCancelReportPlayer")
		.values(
			nominatedUserIds.map((userId) => ({
				cancelReportId: report.id,
				userId,
			})),
		)
		.execute();
}

function buildMembers(
	match: NonNullable<Awaited<ReturnType<typeof findById>>>,
) {
	return [
		...match.groupAlpha.members.map((m) => ({
			...m,
			groupId: match.groupAlpha.id,
		})),
		...match.groupBravo.members.map((m) => ({
			...m,
			groupId: match.groupBravo.id,
		})),
	];
}

function lastReporterGroupId(
	match: NonNullable<Awaited<ReturnType<typeof findById>>>,
	members: ReturnType<typeof buildMembers>,
) {
	const lastReportedMap = match.mapList
		.toReversed()
		.find((m) => m.reportedByUserId !== null);
	if (!lastReportedMap?.reportedByUserId) return undefined;
	return members.find((m) => m.id === lastReportedMap.reportedByUserId)
		?.groupId;
}
