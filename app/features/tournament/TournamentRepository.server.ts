import { type Insertable, type NotNull, sql, type Transaction } from "kysely";
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite";
import { db } from "~/db/sql";
import type {
	CastedMatchesInfo,
	DB,
	PreparedMaps,
	Tables,
	TournamentSettings,
} from "~/db/tables";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import { Status } from "~/modules/brackets-model";
import { modesShort } from "~/modules/in-game-lists/modes";
import { nullFilledArray, nullifyingAvg } from "~/utils/arrays";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import { COMMON_USER_FIELDS, userChatNameColor } from "~/utils/kysely.server";
import type { Unwrapped } from "~/utils/types";
import { userSubmittedImage } from "~/utils/urls-img";
import { HACKY_resolvePicture } from "./tournament-utils";

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
			"Tournament.rules",
			"Tournament.parentTournamentId",
			"CalendarEvent.name",
			"CalendarEvent.description",
			"CalendarEventDate.startTime",
			"Tournament.isFinalized",
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
						"UserSubmittedImage.url as avatarUrl",
						jsonArrayFrom(
							innerEb
								.selectFrom("TournamentOrganizationMember")
								.innerJoin(
									"User",
									"TournamentOrganizationMember.userId",
									"User.id",
								)
								.select([
									"TournamentOrganizationMember.userId",
									"TournamentOrganizationMember.role",
									...COMMON_USER_FIELDS,
									userChatNameColor,
								])
								.whereRef(
									"TournamentOrganizationMember.organizationId",
									"=",
									"TournamentOrganization.id",
								),
						).as("members"),
					])
					.whereRef(
						"TournamentOrganization.id",
						"=",
						"CalendarEvent.organizationId",
					),
			).as("organization"),
			eb
				.selectFrom("UnvalidatedUserSubmittedImage")
				.select(["UnvalidatedUserSubmittedImage.url"])
				.whereRef(
					"CalendarEvent.avatarImgId",
					"=",
					"UnvalidatedUserSubmittedImage.id",
				)
				.as("logoUrl"),
			eb
				.selectFrom("UnvalidatedUserSubmittedImage")
				.select(["UnvalidatedUserSubmittedImage.validatedAt"])
				.whereRef(
					"CalendarEvent.avatarImgId",
					"=",
					"UnvalidatedUserSubmittedImage.id",
				)
				.as("logoValidatedAt"),
			jsonObjectFrom(
				eb
					.selectFrom("User")
					.select([...COMMON_USER_FIELDS, userChatNameColor])
					.whereRef("User.id", "=", "CalendarEvent.authorId"),
			).as("author"),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentStaff")
					.innerJoin("User", "TournamentStaff.userId", "User.id")
					.select([
						...COMMON_USER_FIELDS,
						userChatNameColor,
						"TournamentStaff.role",
					])
					.where("TournamentStaff.tournamentId", "=", id),
			).as("staff"),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentSub")
					.select(({ fn }) => [
						"TournamentSub.visibility",
						fn.countAll<number>().as("count"),
					])
					.where("TournamentSub.tournamentId", "=", id)
					.groupBy("TournamentSub.visibility"),
			).as("subCounts"),
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
						"TournamentTeam.noScreen",
						"TournamentTeam.droppedOut",
						"TournamentTeam.inviteCode",
						"TournamentTeam.createdAt",
						"TournamentTeam.activeRosterUserIds",
						"TournamentTeam.startingBracketIdx",
						"UserSubmittedImage.url as pickupAvatarUrl",
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
								.select([
									"User.id as userId",
									"User.username",
									"User.discordId",
									"User.discordAvatar",
									"User.customUrl",
									"User.country",
									"User.twitch",
									"SeedingSkill.ordinal",
									"TournamentTeamMember.isOwner",
									"TournamentTeamMember.createdAt",
									sql<string | null> /*sql*/`coalesce(
                    "TournamentTeamMember"."inGameName",
                    "User"."inGameName"
                  )`.as("inGameName"),
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
								.select([
									"AllTeam.id",
									"AllTeam.customUrl",
									"UserSubmittedImage.url as logoUrl",
									"AllTeam.deletedAt",
								]),
						).as("team"),
					])
					.where("TournamentTeam.tournamentId", "=", id)
					.orderBy("TournamentTeam.seed", "asc")
					.orderBy("TournamentTeam.createdAt", "asc"),
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
		logoSrc: result.logoUrl
			? userSubmittedImage(result.logoUrl)
			: HACKY_resolvePicture(result),
		participatedUsers: result.participatedUsers.map((user) => user.userId),
	};
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
					.whereRef("TournamentTeam.tournamentId", "=", "Tournament.id"),
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
					.selectFrom("TournamentOrganization")
					.innerJoin(
						"TournamentOrganizationMember",
						"TournamentOrganization.id",
						"TournamentOrganizationMember.organizationId",
					)
					.select(["TournamentOrganizationMember.userId"])
					.whereRef(
						"TournamentOrganization.id",
						"=",
						"CalendarEvent.organizationId",
					)
					.where("TournamentOrganizationMember.role", "in", [
						"ADMIN",
						"ORGANIZER",
					]),
			).as("organizationMembers"),
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
			organizationMembers: NotNull;
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
			"CalendarEvent.authorId",
			"CalendarEvent.name",
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
				.where((eb) =>
					eb.or([
						eb("TournamentTeamCheckIn.checkedInAt", "is not", null),
						eb("CalendarEventDate.startTime", ">", databaseTimestampNow()),
					]),
				)
				.select(({ fn }) => [fn.countAll<number>().as("teamsCount")])
				.as("teamsCount"),
			eb
				.selectFrom("UserSubmittedImage")
				.select(["UserSubmittedImage.url"])
				.whereRef("CalendarEvent.avatarImgId", "=", "UserSubmittedImage.id")
				.as("logoUrl"),
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
					.select([
						...COMMON_USER_FIELDS,
						"User.country",
						"TournamentTeam.name as teamName",
						"TeamAvatar.url as teamLogoUrl",
						"TournamentTeamAvatar.url as pickupAvatarUrl",
					]),
			).as("firstPlacers"),
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
			">=",
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
					.select([...COMMON_USER_FIELDS])
					.whereRef("User.id", "=", "TournamentResult.userId"),
			).as("user"),
		])
		.where("tournamentId", "=", tournamentId)
		.where("TournamentResult.placement", "<=", 3)
		.$narrowType<{ user: NotNull }>()
		.execute();
}

export async function findCastTwitchAccountsByTournamentId(
	tournamentId: number,
) {
	const result = await db
		.selectFrom("Tournament")
		.select("castTwitchAccounts")
		.where("id", "=", tournamentId)
		.executeTakeFirst();

	if (!result) return null;

	return result.castTwitchAccounts;
}

export function checkedInTournamentTeamsByBracket({
	tournamentId,
	bracketIdx,
}: {
	tournamentId: number;
	bracketIdx: number;
}) {
	return db
		.selectFrom("TournamentTeamCheckIn")
		.innerJoin(
			"TournamentTeam",
			"TournamentTeamCheckIn.tournamentTeamId",
			"TournamentTeam.id",
		)
		.select(["TournamentTeamCheckIn.tournamentTeamId"])
		.where("TournamentTeamCheckIn.bracketIdx", "=", bracketIdx)
		.where("TournamentTeam.tournamentId", "=", tournamentId)
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

export function checkIn({
	tournamentTeamId,
	bracketIdx,
}: {
	tournamentTeamId: number;
	bracketIdx: number | null;
}) {
	return db.transaction().execute(async (trx) => {
		let query = trx
			.deleteFrom("TournamentTeamCheckIn")
			.where("TournamentTeamCheckIn.tournamentTeamId", "=", tournamentTeamId)
			.where("TournamentTeamCheckIn.isCheckOut", "=", 1);

		if (typeof bracketIdx === "number") {
			query = query.where("TournamentTeamCheckIn.bracketIdx", "=", bracketIdx);
		}

		await query.execute();

		await trx
			.insertInto("TournamentTeamCheckIn")
			.values({
				checkedInAt: dateToDatabaseTimestamp(new Date()),
				tournamentTeamId,
				bracketIdx,
			})
			.execute();
	});
}

export function checkOut({
	tournamentTeamId,
	bracketIdx,
}: {
	tournamentTeamId: number;
	bracketIdx: number | null;
}) {
	return db.transaction().execute(async (trx) => {
		let query = trx
			.deleteFrom("TournamentTeamCheckIn")
			.where("TournamentTeamCheckIn.tournamentTeamId", "=", tournamentTeamId);

		if (typeof bracketIdx === "number") {
			query = query.where("TournamentTeamCheckIn.bracketIdx", "=", bracketIdx);
		}

		await query.execute();

		if (typeof bracketIdx === "number") {
			await trx
				.insertInto("TournamentTeamCheckIn")
				.values({
					checkedInAt: dateToDatabaseTimestamp(new Date()),
					tournamentTeamId,
					bracketIdx,
					isCheckOut: 1,
				})
				.execute();
		}
	});
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

export function updateTeamName({
	tournamentTeamId,
	name,
}: {
	tournamentTeamId: number;
	name: string;
}) {
	return db
		.updateTable("TournamentTeam")
		.set({
			name,
		})
		.where("id", "=", tournamentTeamId)
		.execute();
}

export function dropTeamOut({
	tournamentTeamId,
	previewBracketIdxs,
}: {
	tournamentTeamId: number;
	previewBracketIdxs: number[];
}) {
	return db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("TournamentTeamCheckIn")
			.where("tournamentTeamId", "=", tournamentTeamId)
			.where("TournamentTeamCheckIn.bracketIdx", "in", previewBracketIdxs)
			.execute();

		await trx
			.updateTable("TournamentTeam")
			.set({
				droppedOut: 1,
			})
			.where("id", "=", tournamentTeamId)
			.execute();
	});
}

export function undoDropTeamOut(tournamentTeamId: number) {
	return db
		.updateTable("TournamentTeam")
		.set({
			droppedOut: 0,
		})
		.where("id", "=", tournamentTeamId)
		.execute();
}

export function addStaff({
	tournamentId,
	userId,
	role,
}: {
	tournamentId: number;
	userId: number;
	role: Tables["TournamentStaff"]["role"];
}) {
	return db
		.insertInto("TournamentStaff")
		.values({
			tournamentId,
			userId,
			role,
		})
		.execute();
}

export function removeStaff({
	tournamentId,
	userId,
}: {
	tournamentId: number;
	userId: number;
}) {
	return db
		.deleteFrom("TournamentStaff")
		.where("tournamentId", "=", tournamentId)
		.where("userId", "=", userId)
		.execute();
}

interface UpsertPreparedMapsArgs {
	tournamentId: number;
	maps: Omit<PreparedMaps, "createdAt">;
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

		preparedMaps[bracketIdx] = { ...maps, createdAt: databaseTimestampNow() };

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
			castTwitchAccounts: JSON.stringify(castTwitchAccounts),
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
}: {
	matchId: number;
	tournamentId: number;
}) {
	return db.transaction().execute(async (trx) => {
		const castedMatchesInfo = await castedMatchesInfoByTournamentId(
			trx,
			tournamentId,
		);

		if (!castedMatchesInfo.lockedMatches.includes(matchId)) {
			castedMatchesInfo.lockedMatches.push(matchId);
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
			(lockedMatchId) => lockedMatchId !== matchId,
		);

		await trx
			.updateTable("Tournament")
			.set({
				castedMatchesInfo: JSON.stringify(castedMatchesInfo),
			})
			.where("id", "=", tournamentId)
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

		let newCastedMatchesInfo: CastedMatchesInfo;
		if (twitchAccount === null) {
			newCastedMatchesInfo = {
				...castedMatchesInfo,
				castedMatches: castedMatchesInfo.castedMatches.filter(
					(cm) => cm.matchId !== matchId,
				),
			};
		} else {
			newCastedMatchesInfo = {
				...castedMatchesInfo,
				castedMatches: castedMatchesInfo.castedMatches
					.filter(
						(cm) =>
							// currently a match can only  be streamed by one account
							// and a cast can only stream one match at a time
							// these can change in the future
							cm.matchId !== matchId && cm.twitchAccount !== twitchAccount,
					)
					.concat([{ twitchAccount, matchId }]),
			};
		}

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
				createdAt: dateToDatabaseTimestamp(new Date()),
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
