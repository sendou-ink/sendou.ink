import { add } from "date-fns";
import type { ExpressionBuilder, NotNull, Transaction } from "kysely";
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite";
import * as R from "remeda";
import { db } from "~/db/sql";
import type { DB, ParsedMemento } from "~/db/tables";
import * as Seasons from "~/features/mmr/core/Seasons";
import type { TournamentMapListMap } from "~/modules/tournament-map-list-generator/types";
import { mostPopularArrayElement } from "~/utils/arrays";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import invariant from "~/utils/invariant";
import {
	COMMON_USER_FIELDS,
	concatUserSubmittedImagePrefix,
	matchProfileWeapons,
	tournamentLogoWithDefault,
} from "~/utils/kysely.server";
import type { Unpacked } from "~/utils/types";
import { FULL_GROUP_SIZE } from "../sendouq/q-constants";
import { SendouQError } from "../sendouq/q-utils.server";
import * as SQGroupRepository from "../sendouq/SQGroupRepository.server";
import { MATCHES_PER_SEASONS_PAGE } from "../user-page/user-page-constants";
import { compareMatchToReportedScores } from "./core/match.server";
import * as SendouQMatch from "./core/SendouQMatch";
import { calculateMatchSkills } from "./core/skills.server";
import {
	summarizeMaps,
	summarizePlayerResults,
} from "./core/summarizer.server";
import * as PlayerStatRepository from "./PlayerStatRepository.server";
import * as ReportedWeaponRepository from "./ReportedWeaponRepository.server";
import * as SkillRepository from "./SkillRepository.server";

export async function findById(id: number) {
	const result = await db
		.selectFrom("GroupMatch")
		.select(({ exists, selectFrom, eb }) => [
			"GroupMatch.id",
			"GroupMatch.createdAt",
			"GroupMatch.confirmedAt",
			"GroupMatch.confirmedByUserId",
			"GroupMatch.chatCode",
			"GroupMatch.memento",
			"GroupMatch.cancelRequestedByUserId",
			"GroupMatch.cancelAcceptedByUserId",

			exists(
				selectFrom("Skill")
					.select("Skill.id")
					.where("Skill.groupMatchId", "=", id),
			).as("isLocked"),
			exists(
				selectFrom("Skill")
					.select("Skill.id")
					.where("Skill.groupMatchId", "=", id)
					.where("Skill.season", "=", -1),
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
				"Group.matchmade",
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
							...COMMON_USER_FIELDS,
							"GroupMember.role",
							"GroupMember.note",
							"User.inGameName",
							"User.pronouns",
							"User.vc",
							"User.languages",
							"User.noScreen",
							matchProfileWeapons(arrayEb).as("weapons"),
							"User.mapModePreferences",
							"PlusTier.tier as plusTier",
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

export type CancelMatchResult =
	| { status: "CANCEL_REPORTED"; shouldRefreshCaches: false }
	| { status: "CANCEL_CONFIRMED"; shouldRefreshCaches: true }
	| { status: "CANT_CANCEL"; shouldRefreshCaches: false }
	| { status: "DUPLICATE"; shouldRefreshCaches: false };

export async function cancelMatch({
	matchId,
	reportedByUserId,
	isAdminReport,
}: {
	matchId: number;
	reportedByUserId: number;
	isAdminReport?: boolean;
}): Promise<CancelMatchResult> {
	const match = await findById(matchId);
	invariant(match, "Match not found");

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
}: {
	matchId: number;
	requestedByUserId: number;
}): Promise<RequestCancelResult> {
	const match = await findById(matchId);
	invariant(match, "Match not found");

	if (match.isLocked) {
		return { status: "ALREADY_LOCKED" };
	}

	if (match.cancelRequestedByUserId) {
		return { status: "ALREADY_REQUESTED" };
	}

	await db
		.updateTable("GroupMatch")
		.set({ cancelRequestedByUserId: requestedByUserId })
		.where("id", "=", matchId)
		.execute();

	return { status: "REQUESTED" };
}

export type AcceptCancelResult =
	| { status: "ACCEPTED" }
	| { status: "ALREADY_LOCKED" }
	| { status: "NO_CANCEL_REQUEST" }
	| { status: "NOT_ALLOWED" };

export async function acceptCancelMatch({
	matchId,
	acceptedByUserId,
}: {
	matchId: number;
	acceptedByUserId: number;
}): Promise<AcceptCancelResult> {
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
	invariant(requesterGroupId, "Requester is not a member of any group");

	const accepterGroupId = members.find(
		(m) => m.id === acceptedByUserId,
	)?.groupId;
	invariant(accepterGroupId, "Accepter is not a member of any group");

	if (accepterGroupId === requesterGroupId) {
		return { status: "NOT_ALLOWED" };
	}

	await db.transaction().execute(async (trx) => {
		await SQGroupRepository.setAsInactive(requesterGroupId, trx);
		await SQGroupRepository.setAsInactive(accepterGroupId, trx);
		await lockMatchWithoutSkillChange(match.id, trx);
		await trx
			.updateTable("GroupMatch")
			.set({ cancelAcceptedByUserId: acceptedByUserId })
			.where("id", "=", matchId)
			.execute();
	});

	return { status: "ACCEPTED" };
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

	await db
		.updateTable("GroupMatch")
		.set({ cancelRequestedByUserId: null })
		.where("id", "=", matchId)
		.execute();

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

	await finalizeMatch({
		match,
		members,
		winners,
		winnerGroupId,
		loserGroupId,
		confirmedByUserId: reportedByUserId,
		preFinalize: (trx) =>
			SQGroupRepository.setAsInactive(groupToDeactivate, trx),
	});

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

	await finalizeMatch({
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
	confirmedByUserId: number;
	preFinalize?: (trx: Transaction<DB>) => Promise<unknown>;
}) {
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
		if (preFinalize) await preFinalize(trx);
		await trx
			.updateTable("GroupMatch")
			.set({
				confirmedAt: dateToDatabaseTimestamp(new Date()),
				confirmedByUserId,
			})
			.where("id", "=", match.id)
			.execute();
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
