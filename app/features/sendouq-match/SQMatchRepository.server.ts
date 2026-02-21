import { add } from "date-fns";
import type { ExpressionBuilder, NotNull, Transaction } from "kysely";
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite";
import * as R from "remeda";
import { db } from "~/db/sql";
import type { DB, ParsedMemento } from "~/db/tables";
import * as Seasons from "~/features/mmr/core/Seasons";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import type { TournamentMapListMap } from "~/modules/tournament-map-list-generator/types";
import { mostPopularArrayElement } from "~/utils/arrays";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import invariant from "~/utils/invariant";
import {
	COMMON_USER_FIELDS,
	concatUserSubmittedImagePrefix,
	tournamentLogoWithDefault,
	userChatNameColor,
} from "~/utils/kysely.server";
import type { Unpacked } from "~/utils/types";
import { FULL_GROUP_SIZE } from "../sendouq/q-constants";
import * as SQGroupRepository from "../sendouq/SQGroupRepository.server";
import { MATCHES_PER_SEASONS_PAGE } from "../user-page/user-page-constants";
import { compareMatchToReportedScores } from "./core/match.server";
import { mergeReportedWeapons } from "./core/reported-weapons.server";
import { calculateMatchSkills } from "./core/skills.server";
import {
	summarizeMaps,
	summarizePlayerResults,
} from "./core/summarizer.server";
import * as PlayerStatRepository from "./PlayerStatRepository.server";
import { winnersArrayToWinner } from "./q-match-utils";
import * as ReportedWeaponRepository from "./ReportedWeaponRepository.server";
import * as SkillRepository from "./SkillRepository.server";

export async function findById(id: number) {
	const result = await db
		.selectFrom("GroupMatch")
		.select(({ exists, selectFrom, eb }) => [
			"GroupMatch.id",
			"GroupMatch.createdAt",
			"GroupMatch.reportedAt",
			"GroupMatch.reportedByUserId",
			"GroupMatch.chatCode",
			"GroupMatch.memento",
			exists(
				selectFrom("Skill")
					.select("Skill.id")
					.where("Skill.groupMatchId", "=", id),
			).as("isLocked"),
			jsonArrayFrom(
				eb
					.selectFrom("GroupMatchMap")
					.select([
						"GroupMatchMap.id",
						"GroupMatchMap.mode",
						"GroupMatchMap.stageId",
						"GroupMatchMap.source",
						"GroupMatchMap.winnerGroupId",
					])
					.where("GroupMatchMap.matchId", "=", id)
					.orderBy("GroupMatchMap.index", "asc"),
			).as("mapList"),
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

	return result;
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
				jsonObjectFrom(
					eb
						.selectFrom("AllTeam")
						.leftJoin(
							"UserSubmittedImage",
							"AllTeam.avatarImgId",
							"UserSubmittedImage.id",
						)
						.select((eb) => [
							"AllTeam.name",
							"AllTeam.customUrl",
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
						.leftJoin("PlusTier", "User.id", "PlusTier.userId")
						.select((arrayEb) => [
							...COMMON_USER_FIELDS,
							"GroupMember.role",
							"GroupMember.note",
							"User.inGameName",
							"User.pronouns",
							"User.vc",
							"User.languages",
							"User.noScreen",
							"User.qWeaponPool as weapons",
							"User.mapModePreferences",
							"PlusTier.tier as plusTier",
							arrayEb
								.selectFrom("UserFriendCode")
								.select("UserFriendCode.friendCode")
								.whereRef("UserFriendCode.userId", "=", "User.id")
								.orderBy("UserFriendCode.createdAt", "desc")
								.limit(1)
								.as("friendCode"),
							userChatNameColor,
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
export async function seasonResultPagesByUserId({
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
		.where(({ or, eb }) =>
			or([
				eb("groupMatchId", "is not", null),
				eb("tournamentId", "is not", null),
			]),
		)
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
			"TournamentResult.spDiff",
			"TournamentResult.setResults",
			"TournamentResult.tournamentId",
			"TournamentResult.tournamentTeamId",
			"CalendarEventDate.startTime as tournamentStartTime",
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
				.select([...COMMON_USER_FIELDS])
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
			"GroupMatch.memento",
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
									"ReportedWeapon.groupMatchMapId",
									"=",
									"GroupMatchMap.id",
								),
						).as("weapons"),
					])
					.whereRef("GroupMatchMap.matchId", "=", "GroupMatch.id"),
			).as("maps"),
		])
		.whereRef("Skill.groupMatchId", "=", "GroupMatch.id");
};

export type SeasonGroupMatch = Extract<
	Unpacked<Unpacked<ReturnType<typeof seasonResultsByUserId>>>,
	{ type: "GROUP_MATCH" }
>["groupMatch"];

export type SeasonTournamentResult = Extract<
	Unpacked<Unpacked<ReturnType<typeof seasonResultsByUserId>>>,
	{ type: "TOURNAMENT_RESULT" }
>["tournamentResult"];

/**
 * Retrieves results of given user, competitive season & page. Both SendouQ matches and ranked tournaments.
 */
export async function seasonResultsByUserId({
	userId,
	season,
	page = 1,
}: {
	userId: number;
	season: number;
	page: number;
}) {
	const rows = await db
		.selectFrom("Skill")
		.select((eb) => [
			"Skill.id",
			"Skill.createdAt",
			jsonObjectFrom(tournamentResultsSubQuery(eb, userId)).as(
				"tournamentResult",
			),
			jsonObjectFrom(groupMatchResultsSubQuery(eb)).as("groupMatch"),
		])
		.where("userId", "=", userId)
		.where("season", "=", season)
		.where(({ or, eb }) =>
			or([
				eb("groupMatchId", "is not", null),
				eb("tournamentId", "is not", null),
			]),
		)
		.limit(MATCHES_PER_SEASONS_PAGE)
		.offset(MATCHES_PER_SEASONS_PAGE * (page - 1))
		.orderBy("Skill.id", "desc")
		.execute();

	return rows
		.map((row) => {
			if (row.groupMatch) {
				const skillDiff =
					row.groupMatch?.memento?.users[userId]?.skillDifference;

				const chooseMostPopularWeapon = (userId: number) => {
					const weaponSplIds = row
						.groupMatch!.maps.flatMap((map) => map.weapons)
						.filter((w) => w.userId === userId)
						.map((w) => w.weaponSplId);

					return mostPopularArrayElement(weaponSplIds);
				};

				return {
					type: "GROUP_MATCH" as const,
					...R.omit(row, ["groupMatch", "tournamentResult"]),
					// older skills don't have createdAt, so we use groupMatch's createdAt as fallback
					createdAt: row.createdAt ?? row.groupMatch.createdAt,
					groupMatch: {
						...R.omit(row.groupMatch, ["createdAt", "memento", "maps"]),
						// note there is no corresponding "censoring logic" for tournament result
						// because for those the sp diff is not inserted in the first place
						// if it should not be shown to the user
						spDiff: skillDiff?.calculated ? skillDiff.spDiff : null,
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
					...R.omit(row, ["groupMatch", "tournamentResult"]),
					// older skills don't have createdAt, so we use tournament's start time as a fallback
					createdAt: row.createdAt ?? row.tournamentResult.tournamentStartTime,
					tournamentResult: row.tournamentResult,
				};
			}

			// Skills from dropped teams without tournament results - skip these
			return null;
		})
		.filter((result) => result !== null);
}

export async function seasonCanceledMatchesByUserId({
	userId,
	season,
}: {
	userId: number;
	season: number;
}) {
	const { starts, ends } = Seasons.nthToDateRange(season);

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
				// dummy skills used to close match when it's canceled have season -1
				.on("Skill.season", "=", -1),
		)
		.select(["GroupMatch.id", "GroupMatch.createdAt"])
		.where("GroupMember.userId", "=", userId)
		.where("GroupMatch.createdAt", ">=", dateToDatabaseTimestamp(starts))
		.where(
			"GroupMatch.createdAt",
			"<=",
			dateToDatabaseTimestamp(add(ends, { days: 1 })),
		)
		.orderBy("GroupMatch.createdAt", "desc")
		.execute();
}

export function create({
	alphaGroupId,
	bravoGroupId,
	mapList,
	memento,
}: {
	alphaGroupId: number;
	bravoGroupId: number;
	mapList: TournamentMapListMap[];
	memento: ParsedMemento;
}) {
	return db.transaction().execute(async (trx) => {
		const match = await trx
			.insertInto("GroupMatch")
			.values({
				alphaGroupId,
				bravoGroupId,
				chatCode: shortNanoid(),
				memento: JSON.stringify(memento),
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
					source: String(map.source),
				})),
			)
			.execute();

		await syncGroupTeamId(alphaGroupId, trx);
		await syncGroupTeamId(bravoGroupId, trx);

		await validateCreatedMatch(trx, alphaGroupId, bravoGroupId);

		return match;
	});
}

async function syncGroupTeamId(groupId: number, trx: Transaction<DB>) {
	const members = await trx
		.selectFrom("GroupMember")
		.leftJoin(
			"TeamMemberWithSecondary",
			"TeamMemberWithSecondary.userId",
			"GroupMember.userId",
		)
		.select(["TeamMemberWithSecondary.teamId"])
		.where("GroupMember.groupId", "=", groupId)
		.execute();

	const teamIds = members.map((m) => m.teamId).filter((id) => id !== null);

	const counts = new Map<number, number>();

	for (const teamId of teamIds) {
		const newCount = (counts.get(teamId) ?? 0) + 1;
		if (newCount === 4) {
			await trx
				.updateTable("Group")
				.set({ teamId })
				.where("id", "=", groupId)
				.execute();
			return;
		}

		counts.set(teamId, newCount);
	}

	await trx
		.updateTable("Group")
		.set({ teamId: null })
		.where("id", "=", groupId)
		.execute();
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

export async function updateScore(
	{
		matchId,
		reportedByUserId,
		winners,
	}: {
		matchId: number;
		reportedByUserId: number;
		winners: ("ALPHA" | "BRAVO")[];
	},
	trx?: Transaction<DB>,
) {
	const executor = trx ?? db;

	const match = await executor
		.updateTable("GroupMatch")
		.set({
			reportedAt: dateToDatabaseTimestamp(new Date()),
			reportedByUserId,
		})
		.where("id", "=", matchId)
		.returningAll()
		.executeTakeFirstOrThrow();

	await executor
		.updateTable("GroupMatchMap")
		.set({ winnerGroupId: null })
		.where("matchId", "=", matchId)
		.execute();

	for (const [index, winner] of winners.entries()) {
		await executor
			.updateTable("GroupMatchMap")
			.set({
				winnerGroupId:
					winner === "ALPHA" ? match.alphaGroupId : match.bravoGroupId,
			})
			.where("matchId", "=", matchId)
			.where("index", "=", index)
			.execute();
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
			season: -1,
			sigma: -1,
			ordinal: -1,
			userId: null,
			matchesCount: 0,
		})
		.execute();
}

export type ReportScoreResult =
	| { status: "REPORTED"; shouldRefreshCaches: false }
	| { status: "CONFIRMED"; shouldRefreshCaches: true }
	| { status: "DIFFERENT"; shouldRefreshCaches: false }
	| { status: "DUPLICATE"; shouldRefreshCaches: false };

export type CancelMatchResult =
	| { status: "CANCEL_REPORTED"; shouldRefreshCaches: false }
	| { status: "CANCEL_CONFIRMED"; shouldRefreshCaches: true }
	| { status: "CANT_CANCEL"; shouldRefreshCaches: false }
	| { status: "DUPLICATE"; shouldRefreshCaches: false };

type WeaponInput = {
	groupMatchMapId: number;
	weaponSplId: MainWeaponId;
	userId: number;
	mapIndex: number;
};

export async function adminReport({
	matchId,
	reportedByUserId,
	winners,
}: {
	matchId: number;
	reportedByUserId: number;
	winners: ("ALPHA" | "BRAVO")[];
}): Promise<void> {
	const match = await findById(matchId);
	invariant(match, "Match not found");

	const members = buildMembers(match);
	const winner = winnersArrayToWinner(winners);
	const winnerGroupId =
		winner === "ALPHA" ? match.groupAlpha.id : match.groupBravo.id;
	const loserGroupId =
		winner === "ALPHA" ? match.groupBravo.id : match.groupAlpha.id;

	const { newSkills, differences } = calculateMatchSkills({
		groupMatchId: match.id,
		winner: (match.groupAlpha.id === winnerGroupId
			? match.groupAlpha
			: match.groupBravo
		).members.map((m) => m.id),
		loser: (match.groupAlpha.id === loserGroupId
			? match.groupAlpha
			: match.groupBravo
		).members.map((m) => m.id),
		winnerGroupId,
		loserGroupId,
	});

	await db.transaction().execute(async (trx) => {
		await updateScore({ matchId, reportedByUserId, winners }, trx);
		await SQGroupRepository.setAsInactive(match.groupAlpha.id, trx);
		await SQGroupRepository.setAsInactive(match.groupBravo.id, trx);
		await PlayerStatRepository.upsertMapResults(
			summarizeMaps({ match, members, winners }),
			trx,
		);
		await PlayerStatRepository.upsertPlayerResults(
			summarizePlayerResults({ match, members, winners }),
			trx,
		);
		await SkillRepository.createMatchSkills(
			{
				skills: newSkills,
				differences,
				groupMatchId: match.id,
				oldMatchMemento: match.memento,
			},
			trx,
		);
	});
}

export async function reportScore({
	matchId,
	reportedByUserId,
	winners,
	weapons,
}: {
	matchId: number;
	reportedByUserId: number;
	winners: ("ALPHA" | "BRAVO")[];
	weapons: WeaponInput[];
}): Promise<ReportScoreResult> {
	const match = await findById(matchId);
	invariant(match, "Match not found");

	const members = buildMembers(match);
	const reporterGroupId = members.find(
		(m) => m.id === reportedByUserId,
	)?.groupId;
	invariant(reporterGroupId, "Reporter is not a member of any group");

	const previousReporterGroupId = match.reportedByUserId
		? members.find((m) => m.id === match.reportedByUserId)?.groupId
		: undefined;

	const compared = compareMatchToReportedScores({
		match,
		winners,
		newReporterGroupId: reporterGroupId,
		previousReporterGroupId,
	});

	const oldReportedWeapons =
		(await ReportedWeaponRepository.findByMatchId(matchId)) ?? [];
	const mergedWeapons = mergeReportedWeapons({
		oldWeapons: oldReportedWeapons,
		newWeapons: weapons,
		newReportedMapsCount: winners.length,
	});
	const weaponsForDb = mergedWeapons.map((w) => ({
		groupMatchMapId: w.groupMatchMapId,
		userId: w.userId,
		weaponSplId: w.weaponSplId,
	}));

	if (compared === "DUPLICATE") {
		await ReportedWeaponRepository.replaceByMatchId(matchId, weaponsForDb);
		return { status: "DUPLICATE", shouldRefreshCaches: false };
	}

	if (compared === "DIFFERENT") {
		return { status: "DIFFERENT", shouldRefreshCaches: false };
	}

	if (compared === "FIRST_REPORT") {
		await db.transaction().execute(async (trx) => {
			await updateScore({ matchId, reportedByUserId, winners }, trx);
			await SQGroupRepository.setAsInactive(reporterGroupId, trx);
			if (weaponsForDb.length > 0) {
				await ReportedWeaponRepository.createMany(weaponsForDb, trx);
			}
		});
		return { status: "REPORTED", shouldRefreshCaches: false };
	}

	if (compared === "FIX_PREVIOUS") {
		await db.transaction().execute(async (trx) => {
			await updateScore({ matchId, reportedByUserId, winners }, trx);
			await ReportedWeaponRepository.replaceByMatchId(
				matchId,
				weaponsForDb,
				trx,
			);
		});
		return { status: "REPORTED", shouldRefreshCaches: false };
	}

	const winner = winnersArrayToWinner(winners);
	const winnerGroupId =
		winner === "ALPHA" ? match.groupAlpha.id : match.groupBravo.id;
	const loserGroupId =
		winner === "ALPHA" ? match.groupBravo.id : match.groupAlpha.id;

	const { newSkills, differences } = calculateMatchSkills({
		groupMatchId: match.id,
		winner: (match.groupAlpha.id === winnerGroupId
			? match.groupAlpha
			: match.groupBravo
		).members.map((m) => m.id),
		loser: (match.groupAlpha.id === loserGroupId
			? match.groupAlpha
			: match.groupBravo
		).members.map((m) => m.id),
		winnerGroupId,
		loserGroupId,
	});

	await db.transaction().execute(async (trx) => {
		await SQGroupRepository.setAsInactive(reporterGroupId, trx);
		await PlayerStatRepository.upsertMapResults(
			summarizeMaps({ match, members, winners }),
			trx,
		);
		await PlayerStatRepository.upsertPlayerResults(
			summarizePlayerResults({ match, members, winners }),
			trx,
		);
		await SkillRepository.createMatchSkills(
			{
				skills: newSkills,
				differences,
				groupMatchId: match.id,
				oldMatchMemento: match.memento,
			},
			trx,
		);
		if (weaponsForDb.length > 0) {
			await ReportedWeaponRepository.createMany(weaponsForDb, trx);
		}
	});

	return { status: "CONFIRMED", shouldRefreshCaches: true };
}

export async function cancelMatch({
	matchId,
	reportedByUserId,
}: {
	matchId: number;
	reportedByUserId: number;
}): Promise<CancelMatchResult> {
	const match = await findById(matchId);
	invariant(match, "Match not found");

	const members = buildMembers(match);
	const reporterGroupId = members.find(
		(m) => m.id === reportedByUserId,
	)?.groupId;
	invariant(reporterGroupId, "Reporter is not a member of any group");

	const previousReporterGroupId = match.reportedByUserId
		? members.find((m) => m.id === match.reportedByUserId)?.groupId
		: undefined;

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
		return { status: "CANT_CANCEL", shouldRefreshCaches: false };
	}

	if (compared === "FIRST_REPORT" || compared === "FIX_PREVIOUS") {
		await db.transaction().execute(async (trx) => {
			await updateScore({ matchId, reportedByUserId, winners: [] }, trx);
			await SQGroupRepository.setAsInactive(reporterGroupId, trx);
		});
		return { status: "CANCEL_REPORTED", shouldRefreshCaches: false };
	}

	await db.transaction().execute(async (trx) => {
		await SQGroupRepository.setAsInactive(reporterGroupId, trx);
		await lockMatchWithoutSkillChange(match.id, trx);
	});
	return { status: "CANCEL_CONFIRMED", shouldRefreshCaches: true };
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
