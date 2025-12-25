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
	tournamentLogoWithDefault,
	userChatNameColor,
} from "~/utils/kysely.server";
import type { Unpacked } from "~/utils/types";
import { FULL_GROUP_SIZE } from "../sendouq/q-constants";
import { MATCHES_PER_SEASONS_PAGE } from "../user-page/user-page-constants";

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

	return rows.map((row) => {
		if (row.groupMatch) {
			const skillDiff = row.groupMatch?.memento?.users[userId]?.skillDifference;

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

		throw new Error("Row does not contain groupMatch or tournamentResult");
	});
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
