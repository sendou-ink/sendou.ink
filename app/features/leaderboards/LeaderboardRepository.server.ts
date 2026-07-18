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
	commonUserSelect,
	concatUserSubmittedImagePrefix,
} from "~/utils/kysely.server";
import { dateToDatabaseTimestamp } from "../../utils/dates";
import * as Seasons from "../mmr/core/Seasons";
import { ordinalToSp } from "../mmr/mmr-utils";
import {
	DEFAULT_LEADERBOARD_MAX_SIZE,
	IGNORED_TEAMS,
	MATCHES_COUNT_NEEDED_FOR_LEADERBOARD,
} from "./leaderboards-constants";

// must stay above the largest weaponSplId
const USER_WEAPON_PACK_FACTOR = 100_000;

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
		.selectFrom((eb) =>
			eb
				.selectFrom((eb) =>
					eb
						.selectFrom("Skill")
						// with a lone max() aggregate SQLite takes the bare columns
						// from the row that had the max id
						.select(({ fn }) => [
							fn.max("Skill.id").as("entryId"),
							"Skill.ordinal",
							"Skill.matchesCount",
						])
						.where("Skill.season", "=", season)
						.where("Skill.identifier", "is not", null)
						.groupBy("Skill.identifier")
						.as("LatestOfTeam"),
				)
				.select(["LatestOfTeam.entryId", "LatestOfTeam.ordinal"])
				.where(
					"LatestOfTeam.matchesCount",
					">=",
					MATCHES_COUNT_NEEDED_FOR_LEADERBOARD,
				)
				.orderBy("LatestOfTeam.ordinal", "desc")
				.limit(DEFAULT_LEADERBOARD_MAX_SIZE)
				.as("Entry"),
		)
		.select((eb) => [
			"Entry.entryId",
			"Entry.ordinal",
			jsonArrayFrom(
				eb
					.selectFrom("SkillTeamUser")
					.innerJoin("User", "SkillTeamUser.userId", "User.id")
					.select((eb) => commonUserSelect(eb))
					.whereRef("SkillTeamUser.skillId", "=", "Entry.entryId"),
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
					.whereRef("SkillTeamUser.skillId", "=", "Entry.entryId"),
			).as("teams"),
		])
		.orderBy("Entry.ordinal", "desc");
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
	const validUserIds = new Set(
		await userIdsWithEnoughSqMatchesForTeamLeaderboard(args.season),
	);

	return args.entries.filter((entry) =>
		entry.members.every((member) => validUserIds.has(member.id)),
	);
}

async function userIdsWithEnoughSqMatchesForTeamLeaderboard(seasonNth: number) {
	// a Skill row with groupMatchId set exists exactly once per user per
	// completed (not canceled) SendouQ match of the season
	const rows = await db
		.selectFrom("Skill")
		.select("userId")
		.where("season", "=", seasonNth)
		.where("groupMatchId", "is not", null)
		.where("userId", "is not", null)
		.groupBy("userId")
		.having(
			(eb) => eb.fn.countAll(),
			">=",
			MATCHES_COUNT_NEEDED_FOR_LEADERBOARD,
		)
		.$narrowType<{ userId: number }>()
		.execute();

	return rows.map((row) => row.userId);
}

export async function userHasEnoughSqMatches(userId: number) {
	const season = Seasons.currentOrPrevious();
	if (!season) return false;

	const dateRange = Seasons.nthToDateRange(season.nth);
	if (!dateRange) return false;

	const rows = await db
		.selectFrom("GroupMatch")
		.innerJoin("GroupMember", (join) =>
			join.on((eb) =>
				eb.or([
					eb("GroupMatch.alphaGroupId", "=", eb.ref("GroupMember.groupId")),
					eb("GroupMatch.bravoGroupId", "=", eb.ref("GroupMember.groupId")),
				]),
			),
		)
		.innerJoin("Skill", (join) =>
			join
				.onRef("Skill.groupMatchId", "=", "GroupMatch.id")
				.onRef("Skill.userId", "=", "GroupMember.userId"),
		)
		.where("GroupMember.userId", "=", userId)
		.where(
			"GroupMatch.createdAt",
			">",
			dateToDatabaseTimestamp(dateRange.starts),
		)
		.where(
			"GroupMatch.createdAt",
			"<",
			dateToDatabaseTimestamp(add(dateRange.ends, { days: 1 })),
		)
		.select(db.fn.countAll<number>().as("count"))
		.executeTakeFirstOrThrow();

	return rows.count >= MATCHES_COUNT_NEEDED_FOR_LEADERBOARD;
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
		.where(({ or, eb, exists, selectFrom }) =>
			or([
				eb("groupMatchId", "is not", null),
				exists(
					selectFrom("TournamentResult")
						.select("TournamentResult.userId")
						.whereRef(
							"TournamentResult.tournamentId",
							"=",
							"Skill.tournamentId",
						)
						.where("TournamentResult.userId", "=", userId),
				),
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
	// walks placements from the highest power down (power-descending indexes
	// keeping only each player's best placement, so it can
	// stop at the 500th distinct player instead of aggregating every player's
	// max power first
	return db
		.selectFrom((eb) => {
			let placements = eb
				.selectFrom("XRankPlacement")
				.select([
					"XRankPlacement.id as entryId",
					"XRankPlacement.playerId",
					"XRankPlacement.weaponSplId",
					"XRankPlacement.name",
					"XRankPlacement.power",
				])
				.where(({ not, exists, selectFrom }) =>
					not(
						exists(
							selectFrom("XRankPlacement as Better")
								.select("Better.id")
								.whereRef("Better.playerId", "=", "XRankPlacement.playerId")
								.$if(Boolean(where?.mode), (qb) =>
									qb.where("Better.mode", "=", where!.mode!),
								)
								.$if(typeof where?.weaponSplId === "number", (qb) =>
									qb.where("Better.weaponSplId", "=", where!.weaponSplId!),
								)
								.where((eb) =>
									eb.or([
										eb("Better.power", ">", eb.ref("XRankPlacement.power")),
										eb.and([
											eb("Better.power", "=", eb.ref("XRankPlacement.power")),
											eb("Better.id", "<", eb.ref("XRankPlacement.id")),
										]),
									]),
								),
						),
					),
				)
				.orderBy("XRankPlacement.power", "desc")
				.limit(DEFAULT_LEADERBOARD_MAX_SIZE);

			if (where?.mode) {
				placements = placements.where("XRankPlacement.mode", "=", where.mode);
			}

			if (typeof where?.weaponSplId === "number") {
				placements = placements.where(
					"XRankPlacement.weaponSplId",
					"=",
					where.weaponSplId,
				);
			}

			return placements.as("Placement");
		})
		.innerJoin("SplatoonPlayer", "SplatoonPlayer.id", "Placement.playerId")
		.leftJoin("User", "User.id", "SplatoonPlayer.userId")
		.select((eb) => [
			...commonUserSelect(eb),
			"Placement.entryId",
			"Placement.playerId",
			"Placement.weaponSplId",
			"Placement.name",
			"Placement.power",
			sql<number>`rank() over (order by "Placement"."power" desc)`.as(
				"placementRank",
			),
		])
		.orderBy("Placement.power", "desc")
		.limit(DEFAULT_LEADERBOARD_MAX_SIZE);
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
		.selectFrom((eb) =>
			eb
				.selectFrom("Skill")
				// with a lone max() aggregate SQLite takes the bare columns from the
				// row that had the max id
				.select(({ fn }) => [
					fn.max("Skill.id").as("entryId"),
					"Skill.ordinal",
					"Skill.matchesCount",
					"Skill.userId",
				])
				.where("Skill.season", "=", season)
				.where("Skill.userId", "is not", null)
				.groupBy("Skill.userId")
				.as("Latest"),
		)
		.innerJoin("User", "User.id", "Latest.userId")
		.select((eb) => [
			...commonUserSelect(eb),
			"Latest.entryId",
			"Latest.ordinal",
			"User.plusSkippedForSeasonNth",
		])
		.where("Latest.matchesCount", ">=", MATCHES_COUNT_NEEDED_FOR_LEADERBOARD)
		.orderBy("Latest.ordinal", "desc")
		.execute();

	let placementRank = 0;
	return rows.map(({ ordinal, ...rest }, index) => {
		if (index === 0 || ordinal !== rows[index - 1].ordinal) {
			placementRank = index + 1;
		}

		return {
			...rest,
			placementRank,
			pendingPlusTier: null as number | null,
			power: ordinalToSp(ordinal),
		};
	});
}

export type SeasonPopularUsersWeapon = Record<
	Tables["User"]["id"],
	MainWeaponId
>;

export async function seasonPopularUsersWeapon(
	season: number,
): Promise<SeasonPopularUsersWeapon> {
	const { starts, ends } = Seasons.nthToDateRange(season);
	const startsTs = dateToDatabaseTimestamp(starts);
	const endsTs = dateToDatabaseTimestamp(ends);

	// grouping the ~quarter million rows a season has by one packed integer is
	// measurably faster than by the (userId, weaponSplId) pair; the packed key
	// also sorts identically to the pair so max() tie-breaking is unchanged
	const packedUserWeapon = sql<number>`"ReportedWeapon"."userId" * ${sql.lit(
		USER_WEAPON_PACK_FACTOR,
	)} + "ReportedWeapon"."weaponSplId"`;

	const sendouqWeapons = db
		.selectFrom("ReportedWeapon")
		.innerJoin("GroupMatch", "ReportedWeapon.groupMatchId", "GroupMatch.id")
		.select(packedUserWeapon.as("packedUserWeapon"))
		.where("GroupMatch.createdAt", ">=", startsTs)
		.where("GroupMatch.createdAt", "<=", endsTs);

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
		.select(packedUserWeapon.as("packedUserWeapon"))
		.where("Tournament.isFinalized", "=", 1)
		.where("ReportedWeapon.createdAt", ">=", startsTs)
		.where("ReportedWeapon.createdAt", "<=", endsTs);

	const rows = await db
		.with("q1", (db) =>
			db
				.selectFrom(sendouqWeapons.unionAll(tournamentWeapons).as("merged"))
				.select(({ fn, ref }) => [
					sql<number>`${ref("merged.packedUserWeapon")} / ${sql.lit(
						USER_WEAPON_PACK_FACTOR,
					)}`.as("userId"),
					sql<MainWeaponId>`${ref("merged.packedUserWeapon")} % ${sql.lit(
						USER_WEAPON_PACK_FACTOR,
					)}`.as("weaponSplId"),
					fn.countAll<number>().as("count"),
				])
				.groupBy("merged.packedUserWeapon"),
		)
		.selectFrom("q1")
		.select(({ fn }) => [
			"q1.userId",
			"q1.weaponSplId",
			fn.max("q1.count").as("count"),
		])
		.groupBy("q1.userId")
		.having(
			({ fn }) => fn.max("q1.count"),
			">",
			MATCHES_COUNT_NEEDED_FOR_LEADERBOARD,
		)
		.execute();

	return Object.fromEntries(rows.map((r) => [r.userId, r.weaponSplId]));
}
