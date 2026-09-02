import { sub } from "date-fns";
import {
	type Insertable,
	type NotNull,
	type SqlBool,
	sql,
	type Transaction,
} from "kysely";
import { ordinal } from "openskill";
import * as R from "remeda";
import { db } from "~/db/sql";
import type { DB, DBBoolean, Tables } from "~/db/tables";
import type {
	CastedMatchesInfo,
	PreparedMaps,
	TournamentSettings,
} from "~/db/tables-json";
import { actorId } from "~/features/auth/core/user.server";
import { identifierToUserIds } from "~/features/mmr/mmr-utils";
import { organizerPermissions } from "~/features/tournament/core/permissions";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import type { TournamentSummary } from "~/features/tournament-bracket/core/summarizer.server";
import type {
	TournamentBadgeReceivers,
	TournamentTrophyReceiver,
} from "~/features/tournament-bracket/tournament-bracket-schemas";
import type { TournamentOrganizationRole } from "~/features/tournament-organization/tournament-organization-constants";
import { modesShort } from "~/modules/in-game-lists/modes";
import { isSupporter } from "~/modules/permissions/utils";
import { nullFilledArray, nullifyingAvg } from "~/utils/arrays";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import invariant from "~/utils/invariant";
import {
	commonUserSelect,
	concatUserSubmittedImagePrefix,
	jsonArrayFrom,
	jsonObjectFrom,
	tournamentLogoWithDefault,
	tournamentMembersCount,
	tournamentTeamsCount,
	tournamentUsername,
} from "~/utils/kysely.server";
import type { Unwrapped } from "~/utils/types";
import type { TournamentTierNumber } from "./core/tiering";
import type { TournamentStaffRole } from "./tournament-constants";
import { updatedCastedMatchesInfo } from "./tournament-utils";

export type FindById = NonNullable<Unwrapped<typeof findById>>;
export async function findById(id: number) {
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
			"Tournament.tier",
			"CalendarEvent.name",
			"CalendarEventDate.startsAt",
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
						"TournamentOrganization.isEstablished",
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
									"User.isTournamentOrganizer",
									"User.patronTier",
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
						"UserSubmittedImage as PickupAvatar",
						"TournamentTeam.avatarImgId",
						"PickupAvatar.id",
					)
					.leftJoin("AllTeam", "AllTeam.id", "TournamentTeam.teamId")
					.leftJoin(
						"UserSubmittedImage as TeamAvatar",
						"AllTeam.avatarImgId",
						"TeamAvatar.id",
					)
					.select(({ eb: innerEb }) => [
						"TournamentTeam.id",
						"TournamentTeam.name",
						"TournamentTeam.seed",
						"TournamentTeam.prefersNotToHost",
						"TournamentTeam.droppedOut",
						"TournamentTeam.createdAt",
						"TournamentTeam.inviteCode",
						"TournamentTeam.activeRosterUserIds",
						"TournamentTeam.startingBracketIdx",
						"TournamentTeam.abDivision",
						concatUserSubmittedImagePrefix(innerEb.ref("TeamAvatar.url")).as(
							"teamLogoUrl",
						),
						concatUserSubmittedImagePrefix(innerEb.ref("PickupAvatar.url")).as(
							"pickupAvatarUrl",
						),
						sql<boolean> /*sql*/`exists(
              select 1 from "MapPoolMap"
              where "MapPoolMap"."tournamentTeamId" = "TournamentTeam"."id"
            )`.as("hasMapPool"),
						innerEb
							.selectFrom("TournamentTeamMember")
							.innerJoin("SeedingSkill", (join) =>
								join
									.onRef(
										"SeedingSkill.userId",
										"=",
										"TournamentTeamMember.userId",
									)
									.on(
										"SeedingSkill.type",
										"=",
										sql<
											Tables["SeedingSkill"]["type"]
										> /*sql*/`case when json_extract("Tournament"."settings", '$.isRanked') = 1 then 'RANKED' else 'UNRANKED' end`,
									),
							)
							.select(({ fn }) =>
								fn.avg<number>("SeedingSkill.ordinal").as("v"),
							)
							.whereRef(
								"TournamentTeamMember.tournamentTeamId",
								"=",
								"TournamentTeam.id",
							)
							.as("avgSeedingSkillOrdinal"),
						jsonArrayFrom(
							innerEb
								.selectFrom("TournamentTeamMember")
								.select([
									"TournamentTeamMember.userId",
									"TournamentTeamMember.role",
									"TournamentTeamMember.createdAt",
								])
								.whereRef(
									"TournamentTeamMember.tournamentTeamId",
									"=",
									"TournamentTeam.id",
								)
								.orderBy(sql`"TournamentTeamMember"."role" = 'OWNER'`, "desc")
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
		])
		.where("Tournament.id", "=", id)
		.$narrowType<{ author: NotNull }>()
		.executeTakeFirst();

	if (!result) return null;

	const { organization, ...rest } = result;

	return {
		...rest,
		organization: organization
			? {
					...organization,
					members: organization.members.map(
						({ isTournamentOrganizer, patronTier, ...member }) => member,
					),
				}
			: organization,
		permissions: permissionsOf(result),
		teams: result.teams.map(({ members, ...team }) => ({
			...team,
			avgSeedingSkillOrdinal:
				typeof team.avgSeedingSkillOrdinal === "number"
					? Math.round(team.avgSeedingSkillOrdinal * 100) / 100
					: null,
			memberUserIds: members.map((member) => member.userId),
			ownerUserId:
				members.find((member) => member.role === "OWNER")?.userId ?? null,
		})),
		latestTeamIdByDuplicatedUserId: latestTeamIdByDuplicatedUserId(
			result.teams,
		),
	};
}

/**
 * Who may act on the tournament, following the convention in docs/dev/permissions.md.
 * `ADMIN`, `ORGANIZE` and `MANAGE_MATCHES` come from {@link organizerPermissions}.
 *
 * - `EDIT_EVENT_INFO`: editing the calendar event the tournament belongs to. Organization
 *   admins only qualify when the organization is established or they may add tournaments
 *   of their own anyway.
 * - `EDIT_IN_GAME_NAMES`: setting the in-game names of the tournament's players. Restricted
 *   to members of an established organization because the name they set is shown in every
 *   tournament from then on, not only in this one.
 */
function permissionsOf(tournament: {
	author: { id: number };
	staff: Array<{ id: number; role: TournamentStaffRole }>;
	organization: {
		isEstablished: DBBoolean;
		members: Array<{
			userId: number;
			role: TournamentOrganizationRole;
			isTournamentOrganizer: DBBoolean;
			patronTier: number | null;
		}>;
	} | null;
}) {
	const organizationMembers = tournament.organization?.members ?? [];
	const isEstablished = Boolean(tournament.organization?.isEstablished);

	const membersWithRole = (roles: Array<TournamentOrganizationRole>) =>
		organizationMembers
			.filter((member) => roles.includes(member.role))
			.map((member) => member.userId);

	return {
		...organizerPermissions({
			authorId: tournament.author.id,
			organizationMembers,
			staff: tournament.staff.map((staff) => ({
				userId: staff.id,
				role: staff.role,
			})),
		}),
		EDIT_EVENT_INFO: R.unique([
			tournament.author.id,
			...organizationMembers
				.filter(
					(member) =>
						member.role === "ADMIN" &&
						(isEstablished ||
							Boolean(member.isTournamentOrganizer) ||
							isSupporter(member)),
				)
				.map((member) => member.userId),
		]),
		EDIT_IN_GAME_NAMES: isEstablished
			? membersWithRole(["ADMIN", "ORGANIZER"])
			: [],
	};
}

/**
 * Users on multiple rosters mapped to the team they joined most recently. Nearly always
 * empty, which lets the teams drop the per member join timestamps only this tiebreak needs.
 */
function latestTeamIdByDuplicatedUserId(
	teams: Array<{
		id: number;
		members: Array<{ userId: number; createdAt: number }>;
	}>,
) {
	const latestByUserId = new Map<
		number,
		{ teamId: number; joinedAt: number }
	>();
	const duplicatedUserIds = new Set<number>();

	for (const team of teams) {
		for (const member of team.members) {
			const existing = latestByUserId.get(member.userId);
			if (existing) {
				duplicatedUserIds.add(member.userId);
			}
			if (!existing || member.createdAt > existing.joinedAt) {
				latestByUserId.set(member.userId, {
					teamId: team.id,
					joinedAt: member.createdAt,
				});
			}
		}
	}

	const result: Record<number, number> = {};
	for (const userId of duplicatedUserIds) {
		result[userId] = latestByUserId.get(userId)!.teamId;
	}

	return result;
}

/** Live streams of checked-in participants and of the tournament's cast Twitch accounts. */
export async function findStreamsByTournamentId(tournamentId: number) {
	const [participantStreams, castStreams] = await Promise.all([
		db
			.selectFrom("LiveStream")
			.innerJoin("User", "User.twitch", "LiveStream.twitch")
			.innerJoin(
				"TournamentTeamMember",
				"TournamentTeamMember.userId",
				"User.id",
			)
			.innerJoin(
				"TournamentTeam",
				"TournamentTeam.id",
				"TournamentTeamMember.tournamentTeamId",
			)
			.select((eb) => [
				"User.id as userId",
				"LiveStream.twitch",
				"LiveStream.viewerCount",
				"LiveStream.thumbnailUrl",
				"TournamentTeam.name as teamName",
				...commonUserSelect(eb, { inTournament: true }),
			])
			.where("TournamentTeam.tournamentId", "=", tournamentId)
			.where("TournamentTeam.isPlaceholder", "=", 0)
			.where(({ exists, selectFrom }) =>
				exists(
					selectFrom("TournamentTeamCheckIn")
						.select("TournamentTeamCheckIn.tournamentTeamId")
						.whereRef(
							"TournamentTeamCheckIn.tournamentTeamId",
							"=",
							"TournamentTeam.id",
						),
				),
			)
			.groupBy("LiveStream.twitch")
			.$narrowType<{ twitch: NotNull }>()
			.execute(),
		db
			.selectFrom("LiveStream")
			.select([
				"LiveStream.twitch",
				"LiveStream.viewerCount",
				"LiveStream.thumbnailUrl",
			])
			.where(
				sql<boolean>`"LiveStream"."twitch" IN (SELECT value FROM json_each((SELECT "castTwitchAccounts" FROM "Tournament" WHERE "Tournament"."id" = ${tournamentId})))`,
			)
			.execute(),
	]);

	return { participantStreams, castStreams };
}

/** User ids of everyone who played at least one map of the tournament. */
export async function findParticipatedUserIdsById(tournamentId: number) {
	const rows = await db
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
		.where("TournamentStage.tournamentId", "=", tournamentId)
		.execute();

	return rows.map((row) => row.userId);
}

export type TeamFull = Unwrapped<typeof findTeamsFullByTournamentId>;

/**
 * Full rosters of a tournament's teams: per member profile data, map pools and
 * invite codes. Kept out of {@link findById} because the tournament layout ships
 * the lite team shape only — views that render rosters load these separately.
 */
export async function findTeamsFullByTournamentId(tournamentId: number) {
	const teams = await db
		.selectFrom("TournamentTeam")
		.innerJoin("Tournament", "Tournament.id", "TournamentTeam.tournamentId")
		.leftJoin(
			"UserSubmittedImage as PickupAvatar",
			"TournamentTeam.avatarImgId",
			"PickupAvatar.id",
		)
		.select((eb) => [
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
			concatUserSubmittedImagePrefix(eb.ref("PickupAvatar.url")).as(
				"pickupAvatarUrl",
			),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentTeamMember")
					.innerJoin("User", "TournamentTeamMember.userId", "User.id")
					.leftJoin("SeedingSkill", (join) =>
						join
							.onRef("User.id", "=", "SeedingSkill.userId")
							.on(
								"SeedingSkill.type",
								"=",
								sql<
									Tables["SeedingSkill"]["type"]
								> /*sql*/`case when json_extract("Tournament"."settings", '$.isRanked') = 1 then 'RANKED' else 'UNRANKED' end`,
							),
					)
					.select((eb) => [
						...commonUserSelect(eb, { idAs: "userId", inTournament: true }),
						"User.country",
						"User.tournamentName",
						"SeedingSkill.ordinal",
						"TournamentTeamMember.role",
						"TournamentTeamMember.createdAt",
						"TournamentTeamMember.isSub",
						"TournamentTeamMember.isOrganizerAdded",
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
					.orderBy(sql`"TournamentTeamMember"."role" = 'OWNER'`, "desc")
					.orderBy("TournamentTeamMember.createdAt", "asc"),
			).as("members"),
			jsonArrayFrom(
				eb
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
				eb
					.selectFrom("MapPoolMap")
					.whereRef("MapPoolMap.tournamentTeamId", "=", "TournamentTeam.id")
					.select(["MapPoolMap.stageId", "MapPoolMap.mode"]),
			).as("mapPool"),
			jsonObjectFrom(
				eb
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
						concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
							"logoUrl",
						),
						"AllTeam.deletedAt",
					]),
			).as("team"),
		])
		.where("TournamentTeam.tournamentId", "=", tournamentId)
		.where("TournamentTeam.isPlaceholder", "=", 0)
		.orderBy("TournamentTeam.seed", "asc")
		.orderBy("TournamentTeam.createdAt", "asc")
		.orderBy("TournamentTeam.id", "asc")
		.execute();

	return teams.map((team) => ({
		...team,
		members: team.members.map(({ ordinal, ...member }) => member),
		avgSeedingSkillOrdinal: nullifyingAvg(
			team.members
				.map((member) => member.ordinal)
				.filter((ordinal) => typeof ordinal === "number"),
		),
	}));
}

/**
 * Twitch accounts of the given tournaments' participants who have not dropped out.
 * Kept out of {@link findById} since only the live stream sync routine needs them.
 */
export async function findParticipantTwitchAccounts(tournamentIds: number[]) {
	if (tournamentIds.length === 0) return [];

	return db
		.selectFrom("TournamentTeamMember")
		.innerJoin(
			"TournamentTeam",
			"TournamentTeam.id",
			"TournamentTeamMember.tournamentTeamId",
		)
		.innerJoin("User", "User.id", "TournamentTeamMember.userId")
		.select([
			"TournamentTeam.tournamentId",
			"TournamentTeamMember.userId",
			"User.twitch",
		])
		.where("TournamentTeam.tournamentId", "in", tournamentIds)
		.where("TournamentTeam.isPlaceholder", "=", 0)
		.where("TournamentTeam.droppedOut", "=", 0)
		.where("User.twitch", "is not", null)
		.$narrowType<{ twitch: NotNull }>()
		.execute();
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

/** Loads a tournament's seeding snapshot. */
export async function findSeedingSnapshotById(tournamentId: number) {
	const row = await db
		.selectFrom("Tournament")
		.select("Tournament.seedingSnapshot")
		.where("Tournament.id", "=", tournamentId)
		.executeTakeFirst();

	return row?.seedingSnapshot ?? null;
}

/** Per-user results persisted at finalization time. Empty for tournaments not yet finalized. */
export function findResultsByTournamentId(tournamentId: number) {
	return db
		.selectFrom("TournamentResult")
		.select([
			"TournamentResult.tournamentTeamId",
			"TournamentResult.userId",
			"TournamentResult.placement",
			"TournamentResult.div",
		])
		.where("TournamentResult.tournamentId", "=", tournamentId)
		.orderBy("TournamentResult.placement", "asc")
		.execute();
}

/**
 * Participants of the organization's latest finalized league, with the bracket progression that
 * tells what division (= starting bracket) each played in. Only participants eligible for a
 * division placement: have a result, team did not drop out, played at least one match. Null if
 * the organization has no finalized league.
 */
export async function findLatestFinalizedLeagueParticipants(args: {
	organizationId: number;
	namePrefix: string;
}) {
	const league = await db
		.selectFrom("Tournament")
		.innerJoin("CalendarEvent", "Tournament.id", "CalendarEvent.tournamentId")
		.innerJoin(
			"CalendarEventDate",
			"CalendarEvent.id",
			"CalendarEventDate.eventId",
		)
		.select(["Tournament.id", "Tournament.settings"])
		.where("CalendarEvent.organizationId", "=", args.organizationId)
		.where("CalendarEvent.name", "like", `${args.namePrefix}%`)
		.where("Tournament.isFinalized", "=", 1)
		.where(
			sql<number>`json_extract("Tournament"."settings", '$.isLeague')`,
			"=",
			1,
		)
		.orderBy("CalendarEventDate.startsAt", "desc")
		.limit(1)
		.executeTakeFirst();

	if (!league) return null;

	const participants = await db
		.selectFrom("TournamentResult")
		.innerJoin(
			"TournamentTeam",
			"TournamentTeam.id",
			"TournamentResult.tournamentTeamId",
		)
		.select(["TournamentResult.userId", "TournamentTeam.startingBracketIdx"])
		.distinct()
		.where("TournamentResult.tournamentId", "=", league.id)
		.where("TournamentTeam.droppedOut", "=", 0)
		.execute();

	return {
		tournamentId: league.id,
		bracketProgression: league.settings.bracketProgression,
		participants,
	};
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

export function findRelatedUsersByTournamentIds(tournamentIds: number[]) {
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

export type ForShowcase = Unwrapped<typeof findAllForShowcase>;

export function findAllForShowcase() {
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
			"CalendarEventDate.startsAt",
			"CalendarEvent.hidden",
			tournamentTeamsCount(eb).as("teamsCount"),
			tournamentMembersCount(eb).as("membersCount"),
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
						...commonUserSelect(eb, { inTournament: true }),
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
		.where("CalendarEventDate.startsAt", ">", databaseTimestampWeekAgo())
		.orderBy("CalendarEventDate.startsAt", "asc")
		.$narrowType<{ teamsCount: NotNull; membersCount: NotNull }>()
		.execute();
}

function databaseTimestampWeekAgo() {
	const now = new Date();

	now.setDate(now.getDate() - 7);

	return dateToDatabaseTimestamp(now);
}

/** Team & participant counts of one tournament as {@link findAllForShowcase} computes them, for refreshing a cached showcase tournament. */
export function findShowcaseCountsById(tournamentId: number) {
	return db
		.selectFrom("Tournament")
		.select((eb) => [
			tournamentTeamsCount(eb).as("teamsCount"),
			tournamentMembersCount(eb).as("membersCount"),
		])
		.where("Tournament.id", "=", tournamentId)
		.$narrowType<{ teamsCount: NotNull; membersCount: NotNull }>()
		.executeTakeFirst();
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
			"CalendarEventDate.startsAt",
			">",
			dateToDatabaseTimestamp(startTime),
		)
		.where("CalendarEventDate.startsAt", "<=", dateToDatabaseTimestamp(endTime))
		.where("CalendarEvent.hidden", "=", 0)
		.execute();
}

/** `ORGANIZE` and `MANAGE_MATCHES` holders keyed by tournament id, without loading the tournaments themselves. */
export async function findOrganizerPermissionsByTournamentIds(
	tournamentIds: number[],
) {
	const result = new Map<number, ReturnType<typeof organizerPermissions>>();
	if (tournamentIds.length === 0) return result;

	const [events, staff] = await Promise.all([
		db
			.selectFrom("CalendarEvent")
			.select([
				"CalendarEvent.tournamentId",
				"CalendarEvent.authorId",
				"CalendarEvent.organizationId",
			])
			.where("CalendarEvent.tournamentId", "in", tournamentIds)
			.$narrowType<{ tournamentId: NotNull }>()
			.execute(),
		db
			.selectFrom("TournamentStaff")
			.select([
				"TournamentStaff.tournamentId",
				"TournamentStaff.userId",
				"TournamentStaff.role",
			])
			.where("TournamentStaff.tournamentId", "in", tournamentIds)
			.execute(),
	]);

	const organizationIds = R.unique(
		events.map((event) => event.organizationId).filter((id) => id !== null),
	);
	const organizationMembers =
		organizationIds.length > 0
			? await db
					.selectFrom("TournamentOrganizationMember")
					.select([
						"TournamentOrganizationMember.organizationId",
						"TournamentOrganizationMember.userId",
						"TournamentOrganizationMember.role",
					])
					.where(
						"TournamentOrganizationMember.organizationId",
						"in",
						organizationIds,
					)
					.execute()
			: [];

	for (const event of events) {
		result.set(
			event.tournamentId,
			organizerPermissions({
				authorId: event.authorId,
				organizationMembers: organizationMembers.filter(
					(member) => member.organizationId === event.organizationId,
				),
				staff: staff.filter(
					(staffMember) => staffMember.tournamentId === event.tournamentId,
				),
			}),
		);
	}

	return result;
}

/** Podium placements of the given tournaments, one row per placed player. */
export async function findTopThreeResultsByTournamentIds(
	tournamentIds: number[],
) {
	if (tournamentIds.length === 0) return [];

	return db
		.selectFrom("TournamentResult")
		.innerJoin("User", "User.id", "TournamentResult.userId")
		.select((eb) => [
			"TournamentResult.placement",
			"TournamentResult.tournamentTeamId",
			...commonUserSelect(eb),
		])
		.where("TournamentResult.tournamentId", "in", tournamentIds)
		.where("TournamentResult.placement", "<=", 3)
		.execute();
}

export async function findFriendCodesByTournamentId(tournamentId: number) {
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

		const changedFormat = Progression.changedBracketProgressionFormat(
			existingSettings.bracketProgression,
			bracketProgression,
		);

		if (
			changedFormat ||
			Progression.changedStartingBrackets(
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
				preparedMaps: changedFormat ? null : undefined,
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

		// startedAt drives the match deadline, which must not run while locked: restart it now
		// (but only if it was ever set)
		await trx
			.updateTable("TournamentMatch")
			.set({
				startedAt: databaseTimestampNow(),
			})
			.where("id", "=", matchId)
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

export function findPickBanEventsByMatchId(matchId: number) {
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

export function insertPickBanEvent(
	values: Insertable<DB["TournamentMatchPickBanEvent"]>,
) {
	return db.insertInto("TournamentMatchPickBanEvent").values(values).execute();
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

/** SQLite rejects statements binding over 32,766 parameters, which a big tournament's deltas cross in one insert. */
const SUMMARY_INSERT_CHUNK_SIZE = 1000;

/**
 * Finalizes a tournament, recording the full summary: skills, seeding skills, map/player
 * result deltas, badge owners and placements. See {@link finalizeWithoutSummary} for test tournaments.
 */
export function finalize({
	tournamentId,
	summary,
	season,
	badgeReceivers = [],
	trophyReceiver,
}: {
	tournamentId: number;
	summary: TournamentSummary;
	season?: number;
	badgeReceivers?: TournamentBadgeReceivers;
	trophyReceiver?: TournamentTrophyReceiver;
}) {
	const seasonValue = season ?? null;

	return db.transaction().execute(async (trx) => {
		const skillTeamUsers: Array<{ skillId: number; userId: number }> = [];
		for (const skill of summary.skills) {
			invariant(seasonValue !== null, "Season missing for skill");
			// A skill row keys on either userId (solo) or identifier (team), never both. The
			// matchesCount subquery filters by whichever is present so it hits exactly one index:
			// `where "userId" = ? or "identifier" = ?` with a NULL parameter makes the planner
			// (stat4, NULL ~900K rows for Skill.identifier) pick a pathological MULTI-INDEX OR plan.
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
					skillTeamUsers.push({ skillId: insertedSkill.id, userId });
				}
			}
		}

		for (const chunk of R.chunk(skillTeamUsers, SUMMARY_INSERT_CHUNK_SIZE)) {
			await trx
				.insertInto("SkillTeamUser")
				.values(chunk)
				.onConflict((oc) => oc.columns(["skillId", "userId"]).doNothing())
				.execute();
		}

		// SeedingSkill has `on conflict replace` set in its migration
		for (const chunk of R.chunk(
			summary.seedingSkills,
			SUMMARY_INSERT_CHUNK_SIZE,
		)) {
			await trx
				.insertInto("SeedingSkill")
				.values(
					chunk.map((seedingSkill) => ({
						type: seedingSkill.type,
						mu: seedingSkill.mu,
						sigma: seedingSkill.sigma,
						ordinal: seedingSkill.ordinal,
						userId: seedingSkill.userId,
					})),
				)
				.execute();
		}

		if (summary.mapResultDeltas.length > 0) {
			invariant(seasonValue !== null, "Season missing for map result");
			for (const chunk of R.chunk(
				summary.mapResultDeltas,
				SUMMARY_INSERT_CHUNK_SIZE,
			)) {
				await trx
					.insertInto("MapResult")
					.values(
						chunk.map((mapResultDelta) => ({
							mode: mapResultDelta.mode,
							stageId: mapResultDelta.stageId,
							userId: mapResultDelta.userId,
							wins: mapResultDelta.wins,
							losses: mapResultDelta.losses,
							season: seasonValue,
						})),
					)
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
		}

		if (summary.playerResultDeltas.length > 0) {
			invariant(seasonValue !== null, "Season missing for player result");
			for (const chunk of R.chunk(
				summary.playerResultDeltas,
				SUMMARY_INSERT_CHUNK_SIZE,
			)) {
				await trx
					.insertInto("PlayerResult")
					.values(
						chunk.map((playerResultDelta) => ({
							ownerUserId: playerResultDelta.ownerUserId,
							otherUserId: playerResultDelta.otherUserId,
							mapWins: playerResultDelta.mapWins,
							mapLosses: playerResultDelta.mapLosses,
							setWins: playerResultDelta.setWins,
							setLosses: playerResultDelta.setLosses,
							type: playerResultDelta.type,
							season: seasonValue,
						})),
					)
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
		}

		const badgeOwners = badgeReceivers.flatMap((badgeReceiver) =>
			badgeReceiver.userIds.map((userId) => ({
				tournamentId,
				badgeId: badgeReceiver.badgeId,
				userId,
			})),
		);
		await trx.insertInto("TournamentBadgeOwner").values(badgeOwners).execute();

		if (trophyReceiver && trophyReceiver.userIds.length > 0) {
			const tier = await trophyTier(trx, {
				tournamentId,
				tournamentTeamId: summary.tournamentResults.find((result) =>
					trophyReceiver.userIds.includes(result.userId),
				)?.tournamentTeamId,
			});

			await trx
				.insertInto("TrophyOwner")
				.values(
					trophyReceiver.userIds.map((userId) => ({
						tournamentId,
						trophyId: trophyReceiver.trophyId,
						userId,
						tier,
					})),
				)
				.onConflict((oc) =>
					oc.columns(["tournamentId", "userId", "trophyId"]).doNothing(),
				)
				.execute();
		}

		const tournamentResults = summary.tournamentResults
			.map((tournamentResult) => ({
				tournamentResult,
				setResults: summary.setResults.get(tournamentResult.userId),
			}))
			.filter(({ setResults }) => !setResults?.every((result) => !result))
			.map(({ tournamentResult, setResults }) => ({
				tournamentId,
				userId: tournamentResult.userId,
				placement: tournamentResult.placement,
				participantCount: tournamentResult.participantCount,
				tournamentTeamId: tournamentResult.tournamentTeamId,
				setResults: JSON.stringify(setResults ?? []),
				div: tournamentResult.div,
			}));

		for (const chunk of R.chunk(tournamentResults, SUMMARY_INSERT_CHUNK_SIZE)) {
			await trx.insertInto("TournamentResult").values(chunk).execute();
		}

		await trx
			.updateTable("Tournament")
			.set({ isFinalized: 1 })
			.where("id", "=", tournamentId)
			.execute();
	});
}

/** Marks a test tournament as finalized without recording any summary stats. See {@link finalize}. */
export function finalizeWithoutSummary(tournamentId: number) {
	return db
		.updateTable("Tournament")
		.set({ isFinalized: 1 })
		.where("id", "=", tournamentId)
		.execute();
}

/** How close to its start time a tournament counts as happening right now. */
const TOURNAMENT_ONGOING_WINDOW_IN_SECONDS = 24 * 60 * 60;

/** Tournaments whose calendar event name contains the query, hidden excluded, most likely matches first. */
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
	const now = databaseTimestampNow();
	const distanceFromNow = sql<number>`abs("CalendarEventDate"."startsAt" - ${now})`;
	// window function: next up is the next of all matches, not only of those within the limit
	const nextUpStartsAt = sql<number>`min(case when "CalendarEventDate"."startsAt" - ${now} >= ${TOURNAMENT_ONGOING_WINDOW_IN_SECONDS} then "CalendarEventDate"."startsAt" end) over ()`;

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
			"CalendarEventDate.startsAt",
			tournamentLogoWithDefault(eb).as("logoUrl"),
		])
		.where("CalendarEvent.name", "like", `%${query}%`)
		.where("CalendarEvent.hidden", "=", 0)
		.orderBy(
			sql`case
				when ${distanceFromNow} < ${TOURNAMENT_ONGOING_WINDOW_IN_SECONDS} then 0
				when "CalendarEventDate"."startsAt" = ${nextUpStartsAt} then 1
				else 2
			end`,
		)
		.orderBy(distanceFromNow)
		.orderBy("Tournament.id")
		.limit(limit);

	if (minStartTime) {
		sqlQuery = sqlQuery.where(
			"CalendarEventDate.startsAt",
			">=",
			dateToDatabaseTimestamp(minStartTime),
		);
	}

	if (maxStartTime) {
		sqlQuery = sqlQuery.where(
			"CalendarEventDate.startsAt",
			"<=",
			dateToDatabaseTimestamp(maxStartTime),
		);
	}

	return sqlQuery.execute();
}

export function updateTeamSeeds({
	tournamentId,
	teamIds,
}: {
	tournamentId: number;
	teamIds: number[];
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

		const memberRows =
			teamIds.length > 0
				? await trx
						.selectFrom("TournamentTeamMember")
						.innerJoin("User", "User.id", "TournamentTeamMember.userId")
						.select([
							"TournamentTeamMember.tournamentTeamId",
							"User.id as userId",
							tournamentUsername().as("username"),
						])
						.where("TournamentTeamMember.tournamentTeamId", "in", teamIds)
						.execute()
				: [];

		const membersByTeamId = R.groupBy(
			memberRows,
			(member) => member.tournamentTeamId,
		);
		const snapshot = JSON.stringify({
			savedAt: databaseTimestampNow(),
			teams: teamIds.map((teamId) => ({
				teamId,
				members: (membersByTeamId[teamId] ?? []).map(
					({ userId, username }) => ({ userId, username }),
				),
			})),
		});
		await trx
			.updateTable("Tournament")
			.set({ seedingSnapshot: snapshot })
			.where("id", "=", tournamentId)
			.execute();
	});
}

/**
 * Records the tier of one division (= starting bracket) from its checked-in teams and sets the
 * tournament's own tier to the best of its divisions (the same thing when there is one division).
 */
export async function upsertDivisionTier({
	tournamentId,
	bracketIdx,
	tier,
}: {
	tournamentId: number;
	bracketIdx: number;
	tier: TournamentTierNumber;
}) {
	await db.transaction().execute(async (trx) => {
		await trx
			.insertInto("TournamentDivisionTier")
			.values({ tournamentId, bracketIdx, tier })
			.onConflict((oc) =>
				oc.columns(["tournamentId", "bracketIdx"]).doUpdateSet({ tier }),
			)
			.execute();

		const best = await trx
			.selectFrom("TournamentDivisionTier")
			.select(({ fn }) =>
				fn.min<TournamentTierNumber>("TournamentDivisionTier.tier").as("tier"),
			)
			.where("TournamentDivisionTier.tournamentId", "=", tournamentId)
			.executeTakeFirstOrThrow();

		await trx
			.updateTable("Tournament")
			.set({ tier: best.tier })
			.where("id", "=", tournamentId)
			.execute();
	});
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
		.where("CalendarEventDate.startsAt", "<", dateToDatabaseTimestamp(now))
		.where("CalendarEventDate.startsAt", ">", dateToDatabaseTimestamp(cutoff))
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

/** Tier of the winning team's division, falling back to the tournament's tier when unknown or never tiered. */
async function trophyTier(
	trx: Transaction<DB>,
	{
		tournamentId,
		tournamentTeamId,
	}: { tournamentId: number; tournamentTeamId?: number },
) {
	const divisionTier = tournamentTeamId
		? await trx
				.selectFrom("TournamentDivisionTier")
				.innerJoin(
					"TournamentTeam",
					"TournamentTeam.tournamentId",
					"TournamentDivisionTier.tournamentId",
				)
				.select("TournamentDivisionTier.tier")
				.where("TournamentTeam.id", "=", tournamentTeamId)
				.where(
					sql<SqlBool>`"TournamentDivisionTier"."bracketIdx" = coalesce("TournamentTeam"."startingBracketIdx", 0)`,
				)
				.executeTakeFirst()
		: undefined;

	if (divisionTier) return divisionTier.tier;

	const tournament = await trx
		.selectFrom("Tournament")
		.select("tier")
		.where("id", "=", tournamentId)
		.executeTakeFirst();

	return tournament?.tier ?? null;
}
