import type { InferResult } from "kysely";
import { sql } from "kysely";
import * as R from "remeda";
import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";
import type {
	MainWeaponId,
	RankedModeShort,
} from "~/modules/in-game-lists/types";
import {
	commonUserSelect,
	concatUserSubmittedImagePrefix,
	jsonArrayFrom,
	latestSkillPerSeason,
	skillCountsAsSeasonSet,
} from "~/utils/kysely.server";
import { dateToDatabaseTimestamp } from "../../utils/dates";
import * as Seasons from "../mmr/core/Seasons";
import { ordinalToSp, type SkillTeamIdentifier } from "../mmr/mmr-utils";
import {
	DEFAULT_LEADERBOARD_MAX_SIZE,
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

/** Numbers the entries by placement. A skipped team keeps its spot in the order but takes no number, the one below it getting the number it would have had. */
function addPlacementRank<T extends { isSkipped: boolean }>(entries: T[]) {
	let placementRank = 0;

	return entries.map((entry): T & { placementRank: number | null } => {
		if (entry.isSkipped) return { ...entry, placementRank: null };

		placementRank++;
		return { ...entry, placementRank };
	});
}

const teamLeaderboardBySeasonQuery = (season: number) =>
	db
		.selectFrom((eb) =>
			eb
				.selectFrom(
					latestSkillPerSeason({ season, by: "identifier" }).as("LatestOfTeam"),
				)
				.select([
					"LatestOfTeam.latestId as entryId",
					"LatestOfTeam.ordinal",
					"LatestOfTeam.identifier",
				])
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
			"Entry.identifier",
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
		.orderBy("Entry.ordinal", "desc")
		.$narrowType<{ identifier: SkillTeamIdentifier }>();
type TeamLeaderboardBySeasonQueryReturnType = InferResult<
	ReturnType<typeof teamLeaderboardBySeasonQuery>
>;
type TeamLeaderboardEntry = TeamLeaderboardBySeasonQueryReturnType[number] & {
	isSkipped: boolean;
};

export async function findTeamLeaderboardBySeason({
	season,
	onlyOneEntryPerUser,
}: {
	season: number;
	onlyOneEntryPerUser: boolean;
}) {
	// skipping is about the season finale qualification which the all rosters leaderboard is not concerned with
	const entries = addSkipped({
		entries: await teamLeaderboardBySeasonQuery(season).execute(),
		skippedIdentifiers: onlyOneEntryPerUser
			? await findAllTeamSkipIdentifiersBySeason(season)
			: new Set<SkillTeamIdentifier>(),
	});
	const withNonSqPlayersHandled = onlyOneEntryPerUser
		? await filterOutNonSqPlayers({ season, entries })
		: entries;

	const oneEntryPerUser = onlyOneEntryPerUser
		? filterOneEntryPerUser(withNonSqPlayersHandled)
		: withNonSqPlayersHandled;
	const withSharedTeam = resolveSharedTeam(oneEntryPerUser);
	const withPower = addPowers(withSharedTeam);

	return addPlacementRank(withPower);
}

function addSkipped(args: {
	entries: TeamLeaderboardBySeasonQueryReturnType;
	skippedIdentifiers: Set<SkillTeamIdentifier>;
}): TeamLeaderboardEntry[] {
	return args.entries.map((entry) => ({
		...entry,
		isSkipped: args.skippedIdentifiers.has(entry.identifier),
	}));
}

async function filterOutNonSqPlayers(args: {
	entries: TeamLeaderboardEntry[];
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

export async function hasEnoughSqMatchesByUserId(userId: number) {
	const season = Seasons.currentOrPrevious();
	if (!season) return false;

	const dateRange = Seasons.nthToReportingDateRange(season.nth);
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
		.where("GroupMatch.createdAt", "<", dateToDatabaseTimestamp(dateRange.ends))
		.select(db.fn.countAll<number>().as("count"))
		.executeTakeFirstOrThrow();

	return rows.count >= MATCHES_COUNT_NEEDED_FOR_LEADERBOARD;
}

/** The highest placing entry of each user. A skipped team is always kept and doesn't spend
 * its players' entry, so a roster sharing players with it can still place below it. */
function filterOneEntryPerUser(entries: TeamLeaderboardEntry[]) {
	const encounteredUserIds = new Set<number>();
	return entries.filter((entry) => {
		if (entry.isSkipped) return true;

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

async function findAllTeamSkipIdentifiersBySeason(season: number) {
	const rows = await db
		.selectFrom("LeaderboardTeamSkip")
		.select("LeaderboardTeamSkip.identifier")
		.where("LeaderboardTeamSkip.season", "=", season)
		.execute();

	return new Set(rows.map((row) => row.identifier));
}

/** Marks a team as not counting for the season's team leaderboard placements. Records the acting user as `skippedByUserId`. */
export async function insertTeamSkip(args: {
	season: number;
	identifier: SkillTeamIdentifier;
}) {
	await db
		.insertInto("LeaderboardTeamSkip")
		.values({ ...args, skippedByUserId: actorId() })
		.onConflict((oc) => oc.columns(["season", "identifier"]).doNothing())
		.execute();
}

export async function deleteTeamSkip(args: {
	season: number;
	identifier: SkillTeamIdentifier;
}) {
	await db
		.deleteFrom("LeaderboardTeamSkip")
		.where("LeaderboardTeamSkip.season", "=", args.season)
		.where("LeaderboardTeamSkip.identifier", "=", args.identifier)
		.execute();
}

export async function findSeasonsParticipatedInByUserId(userId: number) {
	const rows = await db
		.selectFrom("Skill")
		.select("season")
		.where("userId", "=", userId)
		.where((eb) => skillCountsAsSeasonSet(eb, userId))
		.groupBy("season")
		.orderBy("season", "desc")
		.execute();

	return rows.map((row) => row.season);
}

export type XPLeaderboardItem = Awaited<
	ReturnType<typeof findAllXPLeaderboard>
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

export async function findAllXPLeaderboard() {
	return xpLeaderboardQuery().execute();
}

export async function findModeXPLeaderboard(mode: RankedModeShort) {
	return xpLeaderboardQuery({ mode }).execute();
}

export async function findWeaponXPLeaderboard(weaponSplId: MainWeaponId) {
	return xpLeaderboardQuery({ weaponSplId }).execute();
}

export type UserSPLeaderboardItem = Awaited<
	ReturnType<typeof findUserSPLeaderboard>
>[number];

export async function findUserSPLeaderboard(season: number) {
	const rows = await db
		.selectFrom(latestSkillPerSeason({ season, by: "userId" }).as("Latest"))
		.innerJoin("User", "User.id", "Latest.userId")
		.select((eb) => [
			...commonUserSelect(eb),
			"Latest.latestId as entryId",
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

export async function findSeasonPopularUsersWeapon(
	season: number,
): Promise<SeasonPopularUsersWeapon> {
	const { starts, ends } = Seasons.nthToReportingDateRange(season);
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
