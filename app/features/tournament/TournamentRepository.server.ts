import { sub } from "date-fns";
import { type Insertable, type NotNull, sql, type Transaction } from "kysely";
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite";
import { ordinal } from "openskill";
import { db } from "~/db/sql";
import type {
	CastedMatchesInfo,
	DB,
	PreparedMaps,
	Tables,
	TournamentSettings,
} from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";
import { identifierToUserIds } from "~/features/mmr/mmr-utils";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import type { TournamentSummary } from "~/features/tournament-bracket/core/summarizer.server";
import type { TournamentBadgeReceivers } from "~/features/tournament-bracket/tournament-bracket-schemas.server";
import { Status } from "~/modules/brackets-model";
import { modesShort } from "~/modules/in-game-lists/modes";
import { nullFilledArray, nullifyingAvg } from "~/utils/arrays";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import invariant from "~/utils/invariant";
import {
	commonUserSelect,
	concatUserSubmittedImagePrefix,
	customAvatarUrl,
	tournamentLogoWithDefault,
} from "~/utils/kysely.server";
import type { Unwrapped } from "~/utils/types";
import type { TournamentTierNumber } from "./core/tiering";
import { updatedCastedMatchesInfo } from "./tournament-utils";

export type FindById = NonNullable<Unwrapped<typeof findById>>;
export async function findById(id: number) {
	const isSetAsRanked = await db
		.selectFrom("Tournament")
		.select("settings")
		.where("id", "=", id)
		.executeTakeFirst()
		.then((row) => row?.settings.isRanked ?? false);

	const result = await db
		.selectFrom("Tournament")
		.innerJoin("CalendarEvent", "Tournament.id", "CalendarEvent.tournamentId")
		.innerJoin(
			"CalendarEventDate",
			"CalendarEvent.id",
			"CalendarEventDate.eventId",
		)
		.select(({ eb }) => [
			"Tournament.id",
			"CalendarEvent.id as eventId",
			"CalendarEvent.discordUrl",
			"CalendarEvent.tags",
			"Tournament.settings",
			"Tournament.castTwitchAccounts",
			"Tournament.castedMatchesInfo",
			"Tournament.mapPickingStyle",
			sql<boolean>`"Tournament"."rules" is not null`.as("hasRules"),
			"Tournament.parentTournamentId",
			eb
				.selectFrom("CalendarEvent as ParentCalendarEvent")
				.select("ParentCalendarEvent.name")
				.whereRef(
					"ParentCalendarEvent.tournamentId",
					"=",
					"Tournament.parentTournamentId",
				)
				.as("parentTournamentName"),
			"Tournament.tier",
			"CalendarEvent.name",
			"CalendarEventDate.startTime",
			"Tournament.isFinalized",
			"Tournament.seedingSnapshot",
			jsonObjectFrom(
				eb
					.selectFrom("TournamentOrganization")
					.leftJoin(
						"UserSubmittedImage",
						"TournamentOrganization.avatarImgId",
						"UserSubmittedImage.id",
					)
					.select(({ eb: innerEb }) => [
						"TournamentOrganization.id",
						"TournamentOrganization.name",
						"TournamentOrganization.slug",
						concatUserSubmittedImagePrefix(
							innerEb.ref("UserSubmittedImage.url"),
						).as("logoUrl"),
						jsonArrayFrom(
							innerEb
								.selectFrom("TournamentOrganizationMember")
								.innerJoin(
									"User",
									"TournamentOrganizationMember.userId",
									"User.id",
								)
								.select((eb) => [
									"TournamentOrganizationMember.userId",
									"TournamentOrganizationMember.role",
									...commonUserSelect(eb),
									"User.pronouns",
								])
								.whereRef(
									"TournamentOrganizationMember.organizationId",
									"=",
									"TournamentOrganization.id",
								),
						).as("members"),
						jsonArrayFrom(
							innerEb
								.selectFrom("TournamentOrganizationSeries")
								.select("TournamentOrganizationSeries.name")
								.whereRef(
									"TournamentOrganizationSeries.organizationId",
									"=",
									"TournamentOrganization.id",
								),
						).as("series"),
					])
					.whereRef(
						"TournamentOrganization.id",
						"=",
						"CalendarEvent.organizationId",
					),
			).as("organization"),
			tournamentLogoWithDefault(eb).as("logoUrl"),
			jsonObjectFrom(
				eb
					.selectFrom("User")
					.select((eb) => [...commonUserSelect(eb), "User.pronouns"])
					.whereRef("User.id", "=", "CalendarEvent.authorId"),
			).as("author"),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentStaff")
					.innerJoin("User", "TournamentStaff.userId", "User.id")
					.select((eb) => [
						...commonUserSelect(eb),
						"User.pronouns",
						"TournamentStaff.role",
					])
					.where("TournamentStaff.tournamentId", "=", id),
			).as("staff"),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentBracketProgressionOverride")
					.select([
						"TournamentBracketProgressionOverride.sourceBracketIdx",
						"TournamentBracketProgressionOverride.destinationBracketIdx",
						"TournamentBracketProgressionOverride.tournamentTeamId",
					])
					.whereRef(
						"TournamentBracketProgressionOverride.tournamentId",
						"=",
						"Tournament.id",
					),
			).as("bracketProgressionOverrides"),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentTeam")
					.leftJoin(
						"UserSubmittedImage",
						"TournamentTeam.avatarImgId",
						"UserSubmittedImage.id",
					)
					.select(({ eb: innerEb }) => [
						"TournamentTeam.id",
						"TournamentTeam.name",
						"TournamentTeam.seed",
						"TournamentTeam.prefersNotToHost",
						"TournamentTeam.droppedOut",
						"TournamentTeam.inviteCode",
						"TournamentTeam.createdAt",
						"TournamentTeam.activeRosterUserIds",
						"TournamentTeam.startingBracketIdx",
						"TournamentTeam.abDivision",
						"TournamentTeam.avatarImgId",
						concatUserSubmittedImagePrefix(
							innerEb.ref("UserSubmittedImage.url"),
						).as("pickupAvatarUrl"),
						jsonArrayFrom(
							innerEb
								.selectFrom("TournamentTeamMember")
								.innerJoin("User", "TournamentTeamMember.userId", "User.id")
								.leftJoin("SeedingSkill", (join) =>
									join
										.onRef("User.id", "=", "SeedingSkill.userId")
										.on(
											"SeedingSkill.type",
											"=",
											isSetAsRanked ? "RANKED" : "UNRANKED",
										),
								)
								.leftJoin("PlusTier", "PlusTier.userId", "User.id")
								.leftJoin("LiveStream", "LiveStream.userId", "User.id")
								.select((eb) => [
									"User.id as userId",
									"User.username",
									"User.discordId",
									"User.discordAvatar",
									"User.customUrl",
									"User.country",
									"User.twitch",
									"SeedingSkill.ordinal",
									"PlusTier.tier as plusTier",
									"TournamentTeamMember.role",
									"TournamentTeamMember.createdAt",
									sql<string | null> /*sql*/`coalesce(
                    "TournamentTeamMember"."inGameName",
                    "User"."inGameName"
                  )`.as("inGameName"),
									"LiveStream.twitch as streamTwitch",
									"LiveStream.viewerCount as streamViewerCount",
									"LiveStream.thumbnailUrl as streamThumbnailUrl",
									customAvatarUrl(eb).as("customAvatarUrl"),
								])
								.whereRef(
									"TournamentTeamMember.tournamentTeamId",
									"=",
									"TournamentTeam.id",
								)
								.orderBy("TournamentTeamMember.createdAt", "asc"),
						).as("members"),
						jsonArrayFrom(
							innerEb
								.selectFrom("TournamentTeamCheckIn")
								.select([
									"TournamentTeamCheckIn.bracketIdx",
									"TournamentTeamCheckIn.checkedInAt",
									"TournamentTeamCheckIn.isCheckOut",
								])
								.whereRef(
									"TournamentTeamCheckIn.tournamentTeamId",
									"=",
									"TournamentTeam.id",
								),
						).as("checkIns"),
						jsonArrayFrom(
							innerEb
								.selectFrom("MapPoolMap")
								.whereRef(
									"MapPoolMap.tournamentTeamId",
									"=",
									"TournamentTeam.id",
								)
								.select(["MapPoolMap.stageId", "MapPoolMap.mode"]),
						).as("mapPool"),
						jsonObjectFrom(
							innerEb
								.selectFrom("AllTeam")
								.leftJoin(
									"UserSubmittedImage",
									"AllTeam.avatarImgId",
									"UserSubmittedImage.id",
								)
								.whereRef("AllTeam.id", "=", "TournamentTeam.teamId")
								.select((eb) => [
									"AllTeam.id",
									"AllTeam.customUrl",
									concatUserSubmittedImagePrefix(
										eb.ref("UserSubmittedImage.url"),
									).as("logoUrl"),
									"AllTeam.deletedAt",
								]),
						).as("team"),
					])
					.where("TournamentTeam.tournamentId", "=", id)
					.where("TournamentTeam.isPlaceholder", "=", 0)
					.orderBy("TournamentTeam.seed", "asc")
					.orderBy("TournamentTeam.createdAt", "asc")
					.orderBy("TournamentTeam.id", "asc"),
			).as("teams"),
			jsonArrayFrom(
				eb
					.selectFrom("MapPoolMap")
					.select(["MapPoolMap.stageId", "MapPoolMap.mode"])
					.whereRef(
						"MapPoolMap.tieBreakerCalendarEventId",
						"=",
						"CalendarEvent.id",
					),
			).as("tieBreakerMapPool"),
			jsonArrayFrom(
				eb
					.selectFrom("MapPoolMap")
					.select(["MapPoolMap.mode", "MapPoolMap.stageId"])
					.whereRef("MapPoolMap.calendarEventId", "=", "CalendarEvent.id"),
			).as("toSetMapPool"),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentStage")
					.innerJoin(
						"TournamentMatch",
						"TournamentMatch.stageId",
						"TournamentStage.id",
					)
					.innerJoin(
						"TournamentMatchGameResult",
						"TournamentMatch.id",
						"TournamentMatchGameResult.matchId",
					)
					.innerJoin(
						"TournamentMatchGameResultParticipant",
						"TournamentMatchGameResult.id",
						"TournamentMatchGameResultParticipant.matchGameResultId",
					)
					.select("TournamentMatchGameResultParticipant.userId")
					.groupBy("TournamentMatchGameResultParticipant.userId")
					.where("TournamentStage.tournamentId", "=", id),
			).as("participatedUsers"),
			jsonArrayFrom(
				eb
					.selectFrom("LiveStream")
					.select([
						"LiveStream.twitch",
						"LiveStream.viewerCount",
						"LiveStream.thumbnailUrl",
					])
					.where(
						sql<boolean>`"LiveStream"."twitch" IN (SELECT value FROM json_each("Tournament"."castTwitchAccounts"))`,
					),
			).as("castStreams"),
		])
		.where("Tournament.id", "=", id)
		.$narrowType<{ author: NotNull }>()
		.executeTakeFirst();

	if (!result) return null;

	return {
		...result,
		teams: result.teams.map((team) => ({
			...team,
			members: team.members.map(({ ordinal, ...member }) => member),
			avgSeedingSkillOrdinal: nullifyingAvg(
				team.members
					.map((member) => member.ordinal)
					.filter((ordinal) => typeof ordinal === "number"),
			),
		})),
		participatedUsers: result.participatedUsers.map((user) => user.userId),
	};
}

/**
 * Loads a tournament's rules markdown. Kept out of {@link findById} since it can
 * be large and is only needed on the tournament's rules page.
 */
export async function findRulesById(tournamentId: number) {
	const row = await db
		.selectFrom("Tournament")
		.select("Tournament.rules")
		.where("Tournament.id", "=", tournamentId)
		.executeTakeFirst();

	return row?.rules ?? null;
}

/**
 * Loads a tournament's description markdown. Kept out of {@link findById} since it
 * can be large and is only needed on the tournament's info page.
 */
export async function findDescriptionById(tournamentId: number) {
	const row = await db
		.selectFrom("CalendarEvent")
		.select("CalendarEvent.description")
		.where("CalendarEvent.tournamentId", "=", tournamentId)
		.executeTakeFirst();

	return row?.description ?? null;
}

export async function hasChildTournaments(parentTournamentId: number) {
	const row = await db
		.selectFrom("Tournament")
		.select("Tournament.id")
		.where("Tournament.parentTournamentId", "=", parentTournamentId)
		.limit(1)
		.executeTakeFirst();

	return Boolean(row);
}

export async function findChildTournaments(parentTournamentId: number) {
	const rows = await db
		.selectFrom("Tournament")
		.innerJoin("CalendarEvent", "Tournament.id", "CalendarEvent.tournamentId")
		.select((eb) => [
			"Tournament.id as tournamentId",
			"CalendarEvent.name",
			eb
				.selectFrom("TournamentTeam")
				.select(({ fn }) => [fn.countAll<number>().as("teamsCount")])
				.whereRef("TournamentTeam.tournamentId", "=", "Tournament.id")
				.where("TournamentTeam.isPlaceholder", "=", 0)
				.as("teamsCount"),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentTeam")
					.innerJoin(
						"TournamentTeamMember",
						"TournamentTeamMember.tournamentTeamId",
						"TournamentTeam.id",
					)
					.select(["TournamentTeamMember.userId"])
					.whereRef("TournamentTeam.tournamentId", "=", "Tournament.id")
					.where("TournamentTeam.isPlaceholder", "=", 0),
			).as("teamMembers"),
		])
		.where("Tournament.parentTournamentId", "=", parentTournamentId)
		.$narrowType<{ teamsCount: NotNull }>()
		.execute();

	return rows.map((row) => ({
		...row,
		participantUserIds: new Set(row.teamMembers.map((member) => member.userId)),
	}));
}

/** Child division tournaments of a league sign-up, with their name and finalized status. */
export function findChildTournamentsForDivCalc(parentTournamentId: number) {
	return db
		.selectFrom("Tournament")
		.innerJoin("CalendarEvent", "Tournament.id", "CalendarEvent.tournamentId")
		.select([
			"Tournament.id as tournamentId",
			"CalendarEvent.name",
			"Tournament.isFinalized",
		])
		.where("Tournament.parentTournamentId", "=", parentTournamentId)
		.execute();
}

/**
 * User ids eligible for a LUTI division placement in the given tournament: they have a result, were
 * on a team that did not drop out, and played at least one match.
 */
export function findLeagueDivParticipantUserIds(tournamentId: number) {
	return db
		.selectFrom("TournamentResult")
		.innerJoin(
			"TournamentTeam",
			"TournamentTeam.id",
			"TournamentResult.tournamentTeamId",
		)
		.select("TournamentResult.userId")
		.distinct()
		.where("TournamentResult.tournamentId", "=", tournamentId)
		.where("TournamentTeam.droppedOut", "=", 0)
		.execute();
}

export async function findTOSetMapPoolById(tournamentId: number) {
	return (
		await db
			.selectFrom("CalendarEvent")
			.innerJoin("MapPoolMap", "CalendarEvent.id", "MapPoolMap.calendarEventId")
			.select(["MapPoolMap.mode", "MapPoolMap.stageId"])
			.where("CalendarEvent.tournamentId", "=", tournamentId)
			.execute()
	).sort((a, b) => {
		const modeAIndexOf = modesShort.indexOf(a.mode);
		const modeBIndexOf = modesShort.indexOf(b.mode);

		if (modeAIndexOf < modeBIndexOf) return -1;
		if (modeAIndexOf > modeBIndexOf) return 1;

		return a.stageId - b.stageId;
	});
}

export async function findPreparedMapsById(tournamentId: number) {
	return (
		(
			await db
				.selectFrom("Tournament")
				.select("preparedMaps")
				.where("id", "=", tournamentId)
				.executeTakeFirst()
		)?.preparedMaps ?? undefined
	);
}

export function relatedUsersByTournamentIds(tournamentIds: number[]) {
	return db
		.selectFrom("CalendarEventDate")
		.innerJoin("CalendarEvent", "CalendarEventDate.eventId", "CalendarEvent.id")
		.innerJoin("Tournament", "CalendarEvent.tournamentId", "Tournament.id")
		.select((eb) => [
			"Tournament.id",
			"CalendarEvent.authorId",
			jsonArrayFrom(
				eb
					.selectFrom("TournamentStaff")
					.select(["TournamentStaff.userId"])
					.whereRef("TournamentStaff.tournamentId", "=", "Tournament.id")
					.where("TournamentStaff.role", "=", "ORGANIZER"),
			).as("staff"),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentTeam")
					.innerJoin(
						"TournamentTeamMember",
						"TournamentTeamMember.tournamentTeamId",
						"TournamentTeam.id",
					)
					.select(["TournamentTeamMember.userId"])
					.whereRef("TournamentTeam.tournamentId", "=", "Tournament.id"),
			).as("teamMembers"),
		])
		.where("Tournament.id", "in", tournamentIds)
		.$narrowType<{
			staff: NotNull;
			teamMembers: NotNull;
		}>()
		.execute();
}

export type ForShowcase = Unwrapped<typeof forShowcase>;

export function forShowcase() {
	return db
		.selectFrom("Tournament")
		.innerJoin("CalendarEvent", "Tournament.id", "CalendarEvent.tournamentId")
		.innerJoin(
			"CalendarEventDate",
			"CalendarEvent.id",
			"CalendarEventDate.eventId",
		)
		.select((eb) => [
			"Tournament.id",
			"Tournament.settings",
			"Tournament.tier",
			"Tournament.isFinalized",
			"CalendarEvent.authorId",
			"CalendarEvent.name",
			"CalendarEvent.organizationId",
			"CalendarEventDate.startTime",
			"CalendarEvent.hidden",
			eb
				.selectFrom("TournamentTeam")
				.leftJoin("TournamentTeamCheckIn", (join) =>
					join
						.on("TournamentTeamCheckIn.bracketIdx", "is", null)
						.onRef(
							"TournamentTeamCheckIn.tournamentTeamId",
							"=",
							"TournamentTeam.id",
						),
				)
				.whereRef("TournamentTeam.tournamentId", "=", "Tournament.id")
				.where("TournamentTeam.isPlaceholder", "=", 0)
				.where((eb) =>
					eb.or([
						eb("TournamentTeamCheckIn.checkedInAt", "is not", null),
						eb("CalendarEventDate.startTime", ">", databaseTimestampNow()),
					]),
				)
				.select(({ fn }) => [
					fn.count<number>("TournamentTeam.id").distinct().as("teamsCount"),
				])
				.as("teamsCount"),
			tournamentLogoWithDefault(eb).as("logoUrl"),
			jsonObjectFrom(
				eb
					.selectFrom("TournamentOrganization")
					.select([
						"TournamentOrganization.name",
						"TournamentOrganization.slug",
					])
					.whereRef(
						"TournamentOrganization.id",
						"=",
						"CalendarEvent.organizationId",
					),
			).as("organization"),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentResult")
					.innerJoin("User", "TournamentResult.userId", "User.id")
					.innerJoin(
						"TournamentTeam",
						"TournamentResult.tournamentTeamId",
						"TournamentTeam.id",
					)
					.leftJoin("AllTeam", "TournamentTeam.teamId", "AllTeam.id")
					.leftJoin(
						"UserSubmittedImage as TeamAvatar",
						"AllTeam.avatarImgId",
						"TeamAvatar.id",
					)
					.leftJoin(
						"UserSubmittedImage as TournamentTeamAvatar",
						"TournamentTeam.avatarImgId",
						"TournamentTeamAvatar.id",
					)
					.whereRef("TournamentResult.tournamentId", "=", "Tournament.id")
					.where("TournamentResult.placement", "=", 1)
					.select((eb) => [
						...commonUserSelect(eb),
						"User.country",
						"TournamentResult.div",
						"TournamentTeam.name as teamName",
						concatUserSubmittedImagePrefix(eb.ref("TeamAvatar.url")).as(
							"teamLogoUrl",
						),
						concatUserSubmittedImagePrefix(
							eb.ref("TournamentTeamAvatar.url"),
						).as("pickupAvatarUrl"),
					]),
			).as("firstPlacers"),
			eb
				.selectFrom("TournamentMatchVod")
				.innerJoin(
					"TournamentMatch",
					"TournamentMatch.id",
					"TournamentMatchVod.matchId",
				)
				.innerJoin(
					"TournamentStage",
					"TournamentStage.id",
					"TournamentMatch.stageId",
				)
				.whereRef("TournamentStage.tournamentId", "=", "Tournament.id")
				.select(({ fn }) => [fn.countAll<number>().as("count")])
				.as("vodCount"),
		])
		.where("CalendarEventDate.startTime", ">", databaseTimestampWeekAgo())
		.orderBy("CalendarEventDate.startTime", "asc")
		.$narrowType<{ teamsCount: NotNull }>()
		.execute();
}

function databaseTimestampWeekAgo() {
	const now = new Date();

	now.setDate(now.getDate() - 7);

	return dateToDatabaseTimestamp(now);
}

export function findAllBetweenTwoTimestamps({
	startTime,
	endTime,
}: {
	startTime: Date;
	endTime: Date;
}) {
	return db
		.selectFrom("CalendarEvent")
		.innerJoin(
			"CalendarEventDate",
			"CalendarEvent.id",
			"CalendarEventDate.eventId",
		)
		.innerJoin("Tournament", "CalendarEvent.tournamentId", "Tournament.id")
		.select(["Tournament.id as tournamentId"])
		.where(
			"CalendarEventDate.startTime",
			">",
			dateToDatabaseTimestamp(startTime),
		)
		.where(
			"CalendarEventDate.startTime",
			"<=",
			dateToDatabaseTimestamp(endTime),
		)
		.where("CalendarEvent.hidden", "=", 0)
		.execute();
}

export function topThreeResultsByTournamentId(tournamentId: number) {
	return db
		.selectFrom("TournamentResult")
		.select(({ eb }) => [
			"TournamentResult.placement",
			"TournamentResult.tournamentTeamId",
			jsonObjectFrom(
				eb
					.selectFrom("User")
					.select((eb) => commonUserSelect(eb))
					.whereRef("User.id", "=", "TournamentResult.userId"),
			).as("user"),
		])
		.where("tournamentId", "=", tournamentId)
		.where("TournamentResult.placement", "<=", 3)
		.$narrowType<{ user: NotNull }>()
		.execute();
}

export async function friendCodesByTournamentId(tournamentId: number) {
	const values = await db
		.selectFrom("TournamentTeam")
		.innerJoin(
			"TournamentTeamMember",
			"TournamentTeam.id",
			"TournamentTeamMember.tournamentTeamId",
		)
		.innerJoin(
			"UserFriendCode",
			"TournamentTeamMember.userId",
			"UserFriendCode.userId",
		)
		.select(["TournamentTeamMember.userId", "UserFriendCode.friendCode"])
		.orderBy("UserFriendCode.createdAt", "asc")
		.where("TournamentTeam.tournamentId", "=", tournamentId)
		.execute();

	// later friend code overwrites earlier ones
	return values.reduce(
		(acc, cur) => {
			acc[cur.userId] = cur.friendCode;
			return acc;
		},
		{} as Record<number, string>,
	);
}

export function updateProgression({
	tournamentId,
	bracketProgression,
}: {
	tournamentId: number;
	bracketProgression: TournamentSettings["bracketProgression"];
}) {
	return db.transaction().execute(async (trx) => {
		const { settings: existingSettings } = await trx
			.selectFrom("Tournament")
			.select("settings")
			.where("id", "=", tournamentId)
			.executeTakeFirstOrThrow();

		if (
			Progression.changedBracketProgressionFormat(
				existingSettings.bracketProgression,
				bracketProgression,
			)
		) {
			const allTournamentTeamsOfTournament = (
				await trx
					.selectFrom("TournamentTeam")
					.select("id")
					.where("tournamentId", "=", tournamentId)
					.execute()
			).map((t) => t.id);

			// delete all bracket check-ins
			await trx
				.deleteFrom("TournamentTeamCheckIn")
				.where("TournamentTeamCheckIn.bracketIdx", "is not", null)
				.where(
					"TournamentTeamCheckIn.tournamentTeamId",
					"in",
					allTournamentTeamsOfTournament,
				)
				.execute();

			await trx
				.updateTable("TournamentTeam")
				.set({
					startingBracketIdx: null,
				})
				.where("tournamentId", "=", tournamentId)
				.execute();
		}

		const newSettings: Tables["Tournament"]["settings"] = {
			...existingSettings,
			bracketProgression,
		};

		await trx
			.updateTable("Tournament")
			.set({
				settings: JSON.stringify(newSettings),
				preparedMaps: Progression.changedBracketProgressionFormat(
					existingSettings.bracketProgression,
					bracketProgression,
				)
					? null
					: undefined,
			})
			.where("id", "=", tournamentId)
			.execute();
	});
}

export function overrideTeamBracketProgression({
	tournamentId,
	tournamentTeamId,
	sourceBracketIdx,
	destinationBracketIdx,
}: {
	tournamentId: number;
	tournamentTeamId: number;
	sourceBracketIdx: number;
	destinationBracketIdx: number;
}) {
	// set in migration: unique("sourceBracketIdx", "tournamentTeamId") on conflict replace
	return db
		.insertInto("TournamentBracketProgressionOverride")
		.values({
			tournamentId,
			tournamentTeamId,
			sourceBracketIdx,
			destinationBracketIdx,
		})
		.execute();
}

export function setStaff({
	tournamentId,
	staff,
}: {
	tournamentId: number;
	staff: Array<{
		userId: number;
		role: Tables["TournamentStaff"]["role"];
	}>;
}) {
	return db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("TournamentStaff")
			.where("tournamentId", "=", tournamentId)
			.execute();

		if (staff.length > 0) {
			await trx
				.insertInto("TournamentStaff")
				.values(
					staff.map((staffer) => ({
						tournamentId,
						userId: staffer.userId,
						role: staffer.role,
					})),
				)
				.execute();
		}
	});
}

interface UpsertPreparedMapsArgs {
	tournamentId: number;
	maps: Omit<PreparedMaps, "createdAt" | "authorId">;
	bracketIdx: number;
}

export function upsertPreparedMaps({
	bracketIdx,
	maps,
	tournamentId,
}: UpsertPreparedMapsArgs) {
	return db.transaction().execute(async (trx) => {
		const tournament = await trx
			.selectFrom("Tournament")
			.select(["Tournament.preparedMaps", "Tournament.settings"])
			.where("Tournament.id", "=", tournamentId)
			.executeTakeFirstOrThrow();

		const preparedMaps: Array<PreparedMaps | null> =
			tournament.preparedMaps ??
			nullFilledArray(tournament.settings.bracketProgression.length);

		preparedMaps[bracketIdx] = {
			...maps,
			authorId: actorId(),
			createdAt: databaseTimestampNow(),
		};

		await trx
			.updateTable("Tournament")
			.set({ preparedMaps: JSON.stringify(preparedMaps) })
			.where("Tournament.id", "=", tournamentId)
			.execute();
	});
}

export function updateCastTwitchAccounts({
	tournamentId,
	castTwitchAccounts,
}: {
	tournamentId: number;
	castTwitchAccounts: string[];
}) {
	return db
		.updateTable("Tournament")
		.set({
			castTwitchAccounts: JSON.stringify(
				castTwitchAccounts
					.map((account) => account.trim().toLowerCase())
					.filter(Boolean),
			),
		})
		.where("id", "=", tournamentId)
		.execute();
}

const castedMatchesInfoByTournamentId = async (
	trx: Transaction<DB>,
	tournamentId: number,
) =>
	(
		await trx
			.selectFrom("Tournament")
			.select("castedMatchesInfo")
			.where("id", "=", tournamentId)
			.executeTakeFirstOrThrow()
	).castedMatchesInfo ??
	({
		castedMatches: [],
		lockedMatches: [],
	} as CastedMatchesInfo);

export function lockMatch({
	matchId,
	tournamentId,
	twitchAccount,
}: {
	matchId: number;
	tournamentId: number;
	twitchAccount: string;
}) {
	return db.transaction().execute(async (trx) => {
		const castedMatchesInfo = await castedMatchesInfoByTournamentId(
			trx,
			tournamentId,
		);

		if (!castedMatchesInfo.lockedMatches.some((lm) => lm.matchId === matchId)) {
			castedMatchesInfo.lockedMatches.push({ matchId, twitchAccount });
		}

		await trx
			.updateTable("Tournament")
			.set({
				castedMatchesInfo: JSON.stringify(castedMatchesInfo),
			})
			.where("id", "=", tournamentId)
			.execute();
	});
}

export function unlockMatch({
	matchId,
	tournamentId,
}: {
	matchId: number;
	tournamentId: number;
}) {
	return db.transaction().execute(async (trx) => {
		const castedMatchesInfo = await castedMatchesInfoByTournamentId(
			trx,
			tournamentId,
		);

		castedMatchesInfo.lockedMatches = castedMatchesInfo.lockedMatches.filter(
			(lm) => lm.matchId !== matchId,
		);

		await trx
			.updateTable("Tournament")
			.set({
				castedMatchesInfo: JSON.stringify(castedMatchesInfo),
			})
			.where("id", "=", tournamentId)
			.execute();

		// Make sure that a match is not marked as started when it is unlocked
		// as we use this timestamp to determine the "deadline" for the match
		// so it doesn't make sense for that timer to run if players can't play yet
		await trx
			.updateTable("TournamentMatch")
			.set({
				startedAt: databaseTimestampNow(),
			})
			.where("id", "=", matchId)
			// ensure we don't set startedAt if it was never set before
			.where("TournamentMatch.startedAt", "is not", null)
			.execute();
	});
}

export function setMatchAsCasted({
	matchId,
	tournamentId,
	twitchAccount,
}: {
	matchId: number;
	tournamentId: number;
	twitchAccount: string | null;
}) {
	return db.transaction().execute(async (trx) => {
		const castedMatchesInfo = await castedMatchesInfoByTournamentId(
			trx,
			tournamentId,
		);

		const newCastedMatchesInfo = updatedCastedMatchesInfo(castedMatchesInfo, {
			matchId,
			twitchAccount,
			timestamp: databaseTimestampNow(),
		});

		await trx
			.updateTable("Tournament")
			.set({
				castedMatchesInfo: JSON.stringify(newCastedMatchesInfo),
			})
			.where("id", "=", tournamentId)
			.execute();
	});
}

export function pickBanEventsByMatchId(matchId: number) {
	return db
		.selectFrom("TournamentMatchPickBanEvent")
		.select([
			"TournamentMatchPickBanEvent.mode",
			"TournamentMatchPickBanEvent.stageId",
			"TournamentMatchPickBanEvent.type",
			"TournamentMatchPickBanEvent.number",
			"TournamentMatchPickBanEvent.createdAt",
		])
		.where("matchId", "=", matchId)
		.orderBy("TournamentMatchPickBanEvent.number", "asc")
		.execute();
}

export function addPickBanEvent(
	values: Insertable<DB["TournamentMatchPickBanEvent"]>,
) {
	return db.insertInto("TournamentMatchPickBanEvent").values(values).execute();
}

export function resetBracket(tournamentStageId: number) {
	return db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("TournamentMatch")
			.where("stageId", "=", tournamentStageId)
			.execute();

		await trx
			.deleteFrom("TournamentRound")
			.where("stageId", "=", tournamentStageId)
			.execute();

		await trx
			.deleteFrom("TournamentGroup")
			.where("stageId", "=", tournamentStageId)
			.execute();

		await trx
			.deleteFrom("TournamentStage")
			.where("id", "=", tournamentStageId)
			.execute();
	});
}

export function reopenTournament(tournamentId: number) {
	return db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("TournamentResult")
			.where("tournamentId", "=", tournamentId)
			.execute();

		await trx
			.updateTable("Tournament")
			.set({ isFinalized: 0 })
			.where("id", "=", tournamentId)
			.execute();

		await trx
			.deleteFrom("Skill")
			.where("tournamentId", "=", tournamentId)
			.execute();

		await trx
			.deleteFrom("TournamentBadgeOwner")
			.where("tournamentId", "=", tournamentId)
			.execute();
	});
}

/**
 * Finalizes a tournament, recording the full summary: skills, seeding skills,
 * map/player result deltas, badge owners and placements. Use
 * {@link finalizeWithoutSummary} for test tournaments that should be marked as
 * finalized without recording any stats.
 */
export function finalize({
	tournamentId,
	summary,
	season,
	badgeReceivers = [],
}: {
	tournamentId: number;
	summary: TournamentSummary;
	season?: number;
	badgeReceivers?: TournamentBadgeReceivers;
}) {
	const seasonValue = season ?? null;

	return db.transaction().execute(async (trx) => {
		for (const skill of summary.skills) {
			invariant(seasonValue !== null, "Season missing for skill");
			// A skill row keys on either userId (solo) or identifier (team), never
			// both. The matchesCount subquery filters by whichever is present so it
			// references exactly one indexed column — a combined
			// `where "userId" = ? or "identifier" = ?` triggers a stat4-driven
			// misestimate when one parameter is NULL (the planner treats NULL as a
			// frequent indexed value, ~900K rows for Skill.identifier) and picks a
			// pathological MULTI-INDEX OR plan.
			const insertedSkill = await trx
				.insertInto("Skill")
				.values((eb) => ({
					tournamentId,
					mu: skill.mu,
					sigma: skill.sigma,
					ordinal: ordinal(skill),
					userId: skill.userId,
					identifier: skill.identifier,
					matchesCount: eb(
						eb.val(skill.matchesCount),
						"+",
						eb
							.selectFrom("Skill")
							.select((e2) =>
								e2.fn
									.coalesce(e2.fn.max("matchesCount"), e2.val(0))
									.as("matchesCount"),
							)
							.$if(skill.userId !== null, (qb) =>
								qb.where("userId", "=", skill.userId),
							)
							.$if(skill.identifier !== null, (qb) =>
								qb.where("identifier", "=", skill.identifier),
							)
							.where("season", "=", seasonValue),
					),
					season: seasonValue,
					createdAt: databaseTimestampNow(),
				}))
				.returningAll()
				.executeTakeFirstOrThrow();

			if (insertedSkill.identifier) {
				for (const userId of identifierToUserIds(insertedSkill.identifier)) {
					await trx
						.insertInto("SkillTeamUser")
						.values({ skillId: insertedSkill.id, userId })
						.onConflict((oc) => oc.columns(["skillId", "userId"]).doNothing())
						.execute();
				}
			}
		}

		// SeedingSkill has `on conflict replace` set in its migration
		if (summary.seedingSkills.length > 0) {
			await trx
				.insertInto("SeedingSkill")
				.values(
					summary.seedingSkills.map((seedingSkill) => ({
						type: seedingSkill.type,
						mu: seedingSkill.mu,
						sigma: seedingSkill.sigma,
						ordinal: seedingSkill.ordinal,
						userId: seedingSkill.userId,
					})),
				)
				.execute();
		}

		for (const mapResultDelta of summary.mapResultDeltas) {
			invariant(seasonValue !== null, "Season missing for map result");
			await trx
				.insertInto("MapResult")
				.values({
					mode: mapResultDelta.mode,
					stageId: mapResultDelta.stageId,
					userId: mapResultDelta.userId,
					wins: mapResultDelta.wins,
					losses: mapResultDelta.losses,
					season: seasonValue,
				})
				.onConflict((oc) =>
					oc
						.columns(["userId", "stageId", "mode", "season"])
						.doUpdateSet((eb) => ({
							wins: eb("MapResult.wins", "+", eb.ref("excluded.wins")),
							losses: eb("MapResult.losses", "+", eb.ref("excluded.losses")),
						})),
				)
				.execute();
		}

		for (const playerResultDelta of summary.playerResultDeltas) {
			invariant(seasonValue !== null, "Season missing for player result");
			await trx
				.insertInto("PlayerResult")
				.values({
					ownerUserId: playerResultDelta.ownerUserId,
					otherUserId: playerResultDelta.otherUserId,
					mapWins: playerResultDelta.mapWins,
					mapLosses: playerResultDelta.mapLosses,
					setWins: playerResultDelta.setWins,
					setLosses: playerResultDelta.setLosses,
					type: playerResultDelta.type,
					season: seasonValue,
				})
				.onConflict((oc) =>
					oc
						.columns(["ownerUserId", "otherUserId", "type", "season"])
						.doUpdateSet((eb) => ({
							mapWins: eb(
								"PlayerResult.mapWins",
								"+",
								eb.ref("excluded.mapWins"),
							),
							mapLosses: eb(
								"PlayerResult.mapLosses",
								"+",
								eb.ref("excluded.mapLosses"),
							),
							setWins: eb(
								"PlayerResult.setWins",
								"+",
								eb.ref("excluded.setWins"),
							),
							setLosses: eb(
								"PlayerResult.setLosses",
								"+",
								eb.ref("excluded.setLosses"),
							),
						})),
				)
				.execute();
		}

		const badgeOwners = badgeReceivers.flatMap((badgeReceiver) =>
			badgeReceiver.userIds.map((userId) => ({
				tournamentId,
				badgeId: badgeReceiver.badgeId,
				userId,
			})),
		);
		if (badgeOwners.length > 0) {
			await trx
				.insertInto("TournamentBadgeOwner")
				.values(badgeOwners)
				.execute();
		}

		for (const tournamentResult of summary.tournamentResults) {
			const setResults = summary.setResults.get(tournamentResult.userId);

			if (setResults?.every((result) => !result)) {
				continue;
			}

			await trx
				.insertInto("TournamentResult")
				.values({
					tournamentId,
					userId: tournamentResult.userId,
					placement: tournamentResult.placement,
					participantCount: tournamentResult.participantCount,
					tournamentTeamId: tournamentResult.tournamentTeamId,
					setResults: JSON.stringify(setResults ?? []),
					spDiff: summary.spDiffs?.get(tournamentResult.userId) ?? null,
					div: tournamentResult.div,
				})
				.execute();
		}

		await trx
			.updateTable("Tournament")
			.set({ isFinalized: 1 })
			.where("id", "=", tournamentId)
			.execute();
	});
}

/**
 * Marks a tournament as finalized without recording any summary stats. Used for
 * test tournaments. See {@link finalize} for the normal path.
 */
export function finalizeWithoutSummary(tournamentId: number) {
	return db
		.updateTable("Tournament")
		.set({ isFinalized: 1 })
		.where("id", "=", tournamentId)
		.execute();
}

export type TournamentRepositoryInsertableMatch = Omit<
	Insertable<DB["TournamentMatch"]>,
	"status" | "chatCode"
>;

export function insertSwissMatches(
	matches: TournamentRepositoryInsertableMatch[],
) {
	if (matches.length === 0) {
		throw new Error("No matches to insert");
	}

	return db
		.insertInto("TournamentMatch")
		.values(
			matches.map((match) => ({
				groupId: match.groupId,
				number: match.number,
				opponentOne: match.opponentOne,
				opponentTwo: match.opponentTwo,
				roundId: match.roundId,
				stageId: match.stageId,
				status: Status.Ready,
				chatCode: shortNanoid(),
			})),
		)
		.execute();
}

export function deleteSwissMatches({
	groupId,
	roundId,
}: {
	groupId: number;
	roundId: number;
}) {
	return db
		.deleteFrom("TournamentMatch")
		.where("groupId", "=", groupId)
		.where("roundId", "=", roundId)
		.execute();
}

export async function searchByName({
	query,
	limit,
	minStartTime,
	maxStartTime,
}: {
	query: string;
	limit: number;
	minStartTime?: Date;
	maxStartTime?: Date;
}) {
	let sqlQuery = db
		.selectFrom("Tournament")
		.innerJoin("CalendarEvent", "Tournament.id", "CalendarEvent.tournamentId")
		.innerJoin(
			"CalendarEventDate",
			"CalendarEvent.id",
			"CalendarEventDate.eventId",
		)
		.select((eb) => [
			"Tournament.id",
			"CalendarEvent.name",
			"CalendarEventDate.startTime",
			tournamentLogoWithDefault(eb).as("logoUrl"),
		])
		.where("CalendarEvent.name", "like", `%${query}%`)
		.where("CalendarEvent.hidden", "=", 0)
		.orderBy("CalendarEventDate.startTime", "desc")
		.limit(limit);

	if (minStartTime) {
		sqlQuery = sqlQuery.where(
			"CalendarEventDate.startTime",
			">=",
			dateToDatabaseTimestamp(minStartTime),
		);
	}

	if (maxStartTime) {
		sqlQuery = sqlQuery.where(
			"CalendarEventDate.startTime",
			"<=",
			dateToDatabaseTimestamp(maxStartTime),
		);
	}

	return sqlQuery.execute();
}

export function updateTeamSeeds({
	tournamentId,
	teamIds,
	teamsWithMembers,
}: {
	tournamentId: number;
	teamIds: number[];
	teamsWithMembers: Array<{
		teamId: number;
		members: Array<{ userId: number; username: string }>;
	}>;
}) {
	return db.transaction().execute(async (trx) => {
		await trx
			.updateTable("TournamentTeam")
			.set({ seed: null })
			.where("tournamentId", "=", tournamentId)
			.execute();

		for (const [i, teamId] of teamIds.entries()) {
			await trx
				.updateTable("TournamentTeam")
				.set({ seed: i + 1 })
				.where("id", "=", teamId)
				.execute();
		}

		const snapshot = JSON.stringify({
			savedAt: databaseTimestampNow(),
			teams: teamsWithMembers,
		});
		await trx
			.updateTable("Tournament")
			.set({ seedingSnapshot: snapshot })
			.where("id", "=", tournamentId)
			.execute();
	});
}

export function updateTournamentTier({
	tournamentId,
	tier,
}: {
	tournamentId: number;
	tier: TournamentTierNumber;
}) {
	return db
		.updateTable("Tournament")
		.set({ tier })
		.where("id", "=", tournamentId)
		.execute();
}

export async function findRunningTournamentIds() {
	const now = new Date();
	const cutoff = sub(now, { days: 2 });

	const rows = await db
		.selectFrom("Tournament")
		.innerJoin("CalendarEvent", "Tournament.id", "CalendarEvent.tournamentId")
		.innerJoin(
			"CalendarEventDate",
			"CalendarEvent.id",
			"CalendarEventDate.eventId",
		)
		.select("Tournament.id")
		.where("Tournament.isFinalized", "=", 0)
		.where("CalendarEventDate.startTime", "<", dateToDatabaseTimestamp(now))
		.where("CalendarEventDate.startTime", ">", dateToDatabaseTimestamp(cutoff))
		.where((eb) =>
			eb.exists(
				eb
					.selectFrom("TournamentStage")
					.select("TournamentStage.id")
					.whereRef("TournamentStage.tournamentId", "=", "Tournament.id"),
			),
		)
		.where(
			sql<number>`json_extract("Tournament"."settings", '$.isTest')`,
			"is not",
			1,
		)
		.execute();

	return rows.map((row) => row.id);
}
