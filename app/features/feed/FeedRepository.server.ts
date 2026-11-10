import { type ExpressionBuilder, sql } from "kysely";
import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import type { ChatMessageAuthor } from "~/features/chat/chat-types";
import {
	calendarEventNameMatchesSeries,
	calendarEventStartTime,
	commonUserSelect,
	concatUserSubmittedImagePrefix,
	jsonArrayFrom,
	tournamentLogoWithDefault,
	tournamentRegisteredTeamCount,
	userChatNameHue,
	visibleThroughAssociationTo,
	visibleTo,
} from "~/utils/kysely.server";
import type { Unwrapped } from "~/utils/types";
import { FEED_RIVALRY_MIN_SETS } from "./feed-constants";

const MAX_ROWS = 200;
/** Longer than any scrim post's flexibility, bounds the open posts by `startsAt` so its index is used */
const SCRIM_POST_MAX_RANGE_SECONDS = 24 * 60 * 60;
const TOP_TEAMMATES_COUNT = 10;

/** The LFG post types the feed matches against each other */
export type FeedLFGPostType = "PLAYER_FOR_TEAM" | "TEAM_FOR_PLAYER";

export function findUsersByIds(userIds: number[]) {
	if (userIds.length === 0) return Promise.resolve([]);

	return db
		.selectFrom("User")
		.select((eb) => commonUserSelect(eb))
		.where("User.id", "in", userIds)
		.execute();
}

export function findTournamentsByIds(tournamentIds: number[]) {
	if (tournamentIds.length === 0) return Promise.resolve([]);

	return db
		.selectFrom("CalendarEvent")
		.leftJoin(
			"TournamentOrganization",
			"TournamentOrganization.id",
			"CalendarEvent.organizationId",
		)
		.select((eb) => [
			"CalendarEvent.tournamentId",
			"CalendarEvent.name",
			"CalendarEvent.organizationId",
			"TournamentOrganization.name as organizationName",
			tournamentLogoWithDefault(eb).as("logoUrl"),
			calendarEventStartTime(eb).as("startsAt"),
		])
		.where("CalendarEvent.tournamentId", "in", tournamentIds)
		.$narrowType<{ tournamentId: number }>()
		.execute();
}

export function findTournamentTeamsByIds(tournamentTeamIds: number[]) {
	if (tournamentTeamIds.length === 0) return Promise.resolve([]);

	return db
		.selectFrom("TournamentTeam")
		.leftJoin("AllTeam", "AllTeam.id", "TournamentTeam.teamId")
		.select((eb) => [
			"TournamentTeam.id",
			"TournamentTeam.name",
			"TournamentTeam.seed",
			"TournamentTeam.tournamentId",
			concatUserSubmittedImagePrefix(
				eb
					.selectFrom("UnvalidatedUserSubmittedImage")
					.select("UnvalidatedUserSubmittedImage.url")
					.where(
						"UnvalidatedUserSubmittedImage.id",
						"=",
						eb.fn.coalesce("TournamentTeam.avatarImgId", "AllTeam.avatarImgId"),
					)
					.$asScalar(),
			).as("avatarUrl"),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentTeamMember")
					.innerJoin("User", "User.id", "TournamentTeamMember.userId")
					.select((memberEb) => commonUserSelect(memberEb))
					.whereRef(
						"TournamentTeamMember.tournamentTeamId",
						"=",
						"TournamentTeam.id",
					)
					.orderBy("TournamentTeamMember.createdAt", "asc"),
			).as("members"),
		])
		.where("TournamentTeam.id", "in", tournamentTeamIds)
		.execute();
}

export function findTeamsByIds(teamIds: number[]) {
	if (teamIds.length === 0) return Promise.resolve([]);

	return db
		.selectFrom("AllTeam")
		.leftJoin(
			"UnvalidatedUserSubmittedImage",
			"UnvalidatedUserSubmittedImage.id",
			"AllTeam.avatarImgId",
		)
		.select((eb) => [
			"AllTeam.id",
			"AllTeam.name",
			"AllTeam.customUrl",
			"AllTeam.bio",
			concatUserSubmittedImagePrefix(
				eb.ref("UnvalidatedUserSubmittedImage.url"),
			).as("avatarUrl"),
			jsonArrayFrom(
				eb
					.selectFrom("AllTeamMember")
					.innerJoin("User", "User.id", "AllTeamMember.userId")
					.select((memberEb) => commonUserSelect(memberEb))
					.whereRef("AllTeamMember.teamId", "=", "AllTeam.id")
					.where("AllTeamMember.leftAt", "is", null)
					.orderBy("AllTeamMember.createdAt", "asc"),
			).as("members"),
		])
		.where("AllTeam.id", "in", teamIds)
		.execute();
}

/** Users as chat message authors, for the comments of a post. */
export function findCommentAuthorsByIds(
	userIds: number[],
): Promise<ChatMessageAuthor[]> {
	if (userIds.length === 0) return Promise.resolve([]);

	return db
		.selectFrom("User")
		.select((eb) => [...commonUserSelect(eb), "User.pronouns", userChatNameHue])
		.where("User.id", "in", userIds)
		.execute();
}

/** Latest moment anything was played in SendouQ, the "now" of the feed test page so old database snapshots look alive. */
export async function findLatestGroupMatchCreatedAt() {
	const row = await db
		.selectFrom("GroupMatch")
		.select(({ fn }) => fn.max("GroupMatch.createdAt").as("createdAt"))
		.executeTakeFirst();

	return row?.createdAt ?? null;
}

// ---------- SendouQ ----------

/** When the user's SendouQ rating of the season last changed, i.e. their latest set */
export async function findLatestSkillCreatedAt({
	userId,
	season,
}: {
	userId: number;
	season: number;
}) {
	const row = await db
		.selectFrom("Skill")
		.select(({ fn }) => fn.max("Skill.createdAt").as("createdAt"))
		.where("Skill.userId", "=", userId)
		.where("Skill.season", "=", season)
		.where("Skill.groupMatchId", "is not", null)
		.executeTakeFirst();

	return row?.createdAt ?? null;
}

/** Start times of the user's SendouQ matches and tournament games since `after` */
export async function findMatchTimesByUserId({
	userId,
	after,
}: {
	userId: number;
	after: number;
}) {
	const groupMatchRows = await db
		.selectFrom("GroupMatch")
		.innerJoin("GroupMember", (join) =>
			join.on((eb) =>
				eb.or([
					eb("GroupMember.groupId", "=", eb.ref("GroupMatch.alphaGroupId")),
					eb("GroupMember.groupId", "=", eb.ref("GroupMatch.bravoGroupId")),
				]),
			),
		)
		.select("GroupMatch.createdAt")
		.where("GroupMember.userId", "=", userId)
		.where("GroupMatch.createdAt", ">", after)
		.execute();

	const tournamentGameRows = await db
		.selectFrom("TournamentMatchGameResult")
		.innerJoin(
			"TournamentMatchGameResultParticipant",
			"TournamentMatchGameResultParticipant.matchGameResultId",
			"TournamentMatchGameResult.id",
		)
		.select("TournamentMatchGameResult.createdAt")
		.where("TournamentMatchGameResultParticipant.userId", "=", userId)
		.where("TournamentMatchGameResult.createdAt", ">", after)
		.execute();

	return [...groupMatchRows, ...tournamentGameRows].map((row) => row.createdAt);
}

export function findMapResultsByUserId({
	userId,
	season,
}: {
	userId: number;
	season: number;
}) {
	return db
		.selectFrom("MapResult")
		.select([
			"MapResult.mode",
			"MapResult.stageId",
			"MapResult.wins",
			"MapResult.losses",
		])
		.where("MapResult.userId", "=", userId)
		.where("MapResult.season", "=", season)
		.execute();
}

/** The users' most played opponent this season among the ones where neither side has a clear lead in sets */
export function findTopCloseRivalryOfUsers({
	userIds,
	season,
}: {
	userIds: number[];
	season: number;
}) {
	return (
		db
			.selectFrom("PlayerResult")
			.select([
				"PlayerResult.ownerUserId",
				"PlayerResult.otherUserId",
				"PlayerResult.setWins",
				"PlayerResult.setLosses",
				"PlayerResult.mapWins",
				"PlayerResult.mapLosses",
			])
			.where("PlayerResult.ownerUserId", "in", userIds)
			.where("PlayerResult.season", "=", season)
			.where("PlayerResult.type", "=", "ENEMY")
			.where(
				(eb) =>
					eb("PlayerResult.setWins", "+", eb.ref("PlayerResult.setLosses")),
				">=",
				FEED_RIVALRY_MIN_SETS,
			)
			// close = the set gap is at most 1 or a fifth of the sets played
			.where(
				sql<boolean>`abs("PlayerResult"."setWins" - "PlayerResult"."setLosses") <= max(1, ("PlayerResult"."setWins" + "PlayerResult"."setLosses") / 5)`,
			)
			.orderBy(
				(eb) =>
					eb("PlayerResult.setWins", "+", eb.ref("PlayerResult.setLosses")),
				"desc",
			)
			.limit(1)
			.executeTakeFirst()
	);
}

/** The SendouQ teammates of the user who aren't in `excludedUserIds`, by sets played together. */
/** The SendouQ teammates of the user by sets played together, most first. */
export function findTopTeammatesByUserId(userId: number) {
	return db
		.selectFrom("PlayerResult")
		.select(({ fn }) => [
			"PlayerResult.otherUserId",
			fn.sum<number>("PlayerResult.setWins").as("setWins"),
			fn.sum<number>("PlayerResult.setLosses").as("setLosses"),
		])
		.where("PlayerResult.ownerUserId", "=", userId)
		.where("PlayerResult.type", "=", "MATE")
		.where("PlayerResult.otherUserId", "!=", userId)
		.groupBy("PlayerResult.otherUserId")
		.orderBy(
			(eb) =>
				eb(
					eb.fn.sum("PlayerResult.setWins"),
					"+",
					eb.fn.sum("PlayerResult.setLosses"),
				),
			"desc",
		)
		.limit(TOP_TEAMMATES_COUNT)
		.execute();
}

/** How many maps each player played on each weapon in SendouQ matches created in `[from, to)` */
export function findWeaponPicksByUser({
	from,
	to,
}: {
	from: number;
	to: number;
}) {
	return db
		.selectFrom("ReportedWeapon")
		.innerJoin("GroupMatch", "GroupMatch.id", "ReportedWeapon.groupMatchId")
		.select(({ fn }) => [
			"ReportedWeapon.userId",
			"ReportedWeapon.weaponSplId",
			fn.countAll<number>().as("count"),
		])
		.where("GroupMatch.createdAt", ">=", from)
		.where("GroupMatch.createdAt", "<", to)
		.groupBy(["ReportedWeapon.userId", "ReportedWeapon.weaponSplId"])
		.execute();
}

/** Lobbies that ended after `after` with who played in them and their top three, latest first. */
export function findAllLobbiesEndedAfter(after: number) {
	return db
		.selectFrom("Lobby")
		.select((eb) => [
			"Lobby.id",
			"Lobby.name",
			"Lobby.endedAt",
			"Lobby.hostUserId",
			eb
				.selectFrom("LobbySet")
				.select((setEb) => setEb.fn.countAll<number>().as("c"))
				.whereRef("LobbySet.lobbyId", "=", "Lobby.id")
				.where("LobbySet.confirmedAt", "is not", null)
				.as("setCount"),
			eb
				.selectFrom("LobbyResult")
				.select((countEb) => countEb.fn.countAll<number>().as("c"))
				.whereRef("LobbyResult.lobbyId", "=", "Lobby.id")
				.as("playerCount"),
			jsonArrayFrom(
				eb
					.selectFrom("LobbyResult")
					.select("LobbyResult.userId")
					.whereRef("LobbyResult.lobbyId", "=", "Lobby.id"),
			).as("players"),
			jsonArrayFrom(
				eb
					.selectFrom("LobbyResult")
					.innerJoin("User", "User.id", "LobbyResult.userId")
					.select((resultEb) => [
						...commonUserSelect(resultEb),
						"LobbyResult.placement",
					])
					.whereRef("LobbyResult.lobbyId", "=", "Lobby.id")
					.orderBy("LobbyResult.placement", "asc")
					.limit(3),
			).as("top"),
		])
		.where("Lobby.endedAt", ">", after)
		.orderBy("Lobby.endedAt", "desc")
		.$narrowType<{ endedAt: number }>()
		.execute();
}

// ---------- Tournaments ----------

/** Bracket matches of a tournament team, in bracket order. */
export function findTournamentMatchesByTeamId({
	tournamentId,
	tournamentTeamId,
}: {
	tournamentId: number;
	tournamentTeamId: number;
}) {
	return db
		.selectFrom("TournamentMatch")
		.innerJoin(
			"TournamentStage",
			"TournamentStage.id",
			"TournamentMatch.stageId",
		)
		.innerJoin(
			"TournamentRound",
			"TournamentRound.id",
			"TournamentMatch.roundId",
		)
		.innerJoin(
			"TournamentGroup",
			"TournamentGroup.id",
			"TournamentMatch.groupId",
		)
		.select([
			"TournamentMatch.id",
			"TournamentMatch.opponentOne",
			"TournamentMatch.opponentTwo",
			"TournamentMatch.winnerSide",
			"TournamentStage.name as bracketName",
			"TournamentStage.type as bracketType",
			"TournamentRound.number as roundNumber",
			"TournamentGroup.number as groupNumber",
		])
		.where("TournamentStage.tournamentId", "=", tournamentId)
		.where((eb) =>
			eb.or([
				// opponent ids live inside the JSON columns
				eb(
					sql`"TournamentMatch"."opponentOne" ->> '$.id'`,
					"=",
					tournamentTeamId,
				),
				eb(
					sql`"TournamentMatch"."opponentTwo" ->> '$.id'`,
					"=",
					tournamentTeamId,
				),
			]),
		)
		.orderBy("TournamentMatch.id", "asc")
		.execute();
}

export function findFinishedMatchesByTournamentIds(tournamentIds: number[]) {
	if (tournamentIds.length === 0) return Promise.resolve([]);

	return db
		.selectFrom("TournamentMatch")
		.innerJoin(
			"TournamentStage",
			"TournamentStage.id",
			"TournamentMatch.stageId",
		)
		.select([
			"TournamentStage.tournamentId",
			"TournamentMatch.opponentOne",
			"TournamentMatch.opponentTwo",
			"TournamentMatch.winnerSide",
		])
		.where("TournamentStage.tournamentId", "in", tournamentIds)
		.where("TournamentMatch.winnerSide", "is not", null)
		.execute();
}

export function findSeedsByTournamentTeamIds(tournamentTeamIds: number[]) {
	if (tournamentTeamIds.length === 0) return Promise.resolve([]);

	return db
		.selectFrom("TournamentTeam")
		.select(["TournamentTeam.id", "TournamentTeam.seed"])
		.where("TournamentTeam.id", "in", tournamentTeamIds)
		.execute();
}

/** Everyone registered to a tournament starting after `after`, soonest first. */
export function findAllUpcomingRegistrations(after: number) {
	return db
		.selectFrom("TournamentTeamMember")
		.innerJoin(
			"TournamentTeam",
			"TournamentTeam.id",
			"TournamentTeamMember.tournamentTeamId",
		)
		.innerJoin(
			"CalendarEvent",
			"CalendarEvent.tournamentId",
			"TournamentTeam.tournamentId",
		)
		.select((eb) => [
			"TournamentTeamMember.userId",
			"TournamentTeamMember.createdAt as registeredAt",
			"TournamentTeam.id as tournamentTeamId",
			"TournamentTeam.tournamentId",
			calendarEventStartTime(eb).$asScalar().$notNull().as("startsAt"),
			eb
				.selectFrom("TournamentTeam as Registered")
				.select((countEb) => countEb.fn.countAll<number>().as("c"))
				.whereRef("Registered.tournamentId", "=", "TournamentTeam.tournamentId")
				.as("teamCount"),
		])
		.where("CalendarEvent.id", "in", upcomingCalendarEventIds(after))
		.where("CalendarEvent.hidden", "=", 0)
		.where((eb) => eb(calendarEventStartTime(eb).$asScalar(), ">", after))
		.orderBy("startsAt", "asc")
		.execute();
}

/** Teams of two or more on the LFG of a tournament starting after `after`, with when their roster last changed. */
export function findAllLookingTournamentTeams(after: number) {
	return db
		.selectFrom("TournamentTeam")
		.innerJoin(
			"CalendarEvent",
			"CalendarEvent.tournamentId",
			"TournamentTeam.tournamentId",
		)
		.select((eb) => [
			"TournamentTeam.id",
			"TournamentTeam.tournamentId",
			"TournamentTeam.lfgNote",
			eb
				.selectFrom("TournamentTeamMember")
				.select((memberEb) =>
					memberEb.fn
						.max("TournamentTeamMember.createdAt")
						.as("rosterChangedAt"),
				)
				.whereRef(
					"TournamentTeamMember.tournamentTeamId",
					"=",
					"TournamentTeam.id",
				)
				.$asScalar()
				.$notNull()
				.as("rosterChangedAt"),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentTeamMember")
					.select("TournamentTeamMember.userId")
					.whereRef(
						"TournamentTeamMember.tournamentTeamId",
						"=",
						"TournamentTeam.id",
					),
			).as("members"),
		])
		.where("TournamentTeam.isLooking", "=", 1)
		.where("CalendarEvent.id", "in", upcomingCalendarEventIds(after))
		.where("CalendarEvent.hidden", "=", 0)
		.where((eb) => eb(calendarEventStartTime(eb).$asScalar(), ">", after))
		.where(
			(eb) =>
				eb
					.selectFrom("TournamentTeamMember")
					.select((countEb) => countEb.fn.countAll().as("c"))
					.whereRef(
						"TournamentTeamMember.tournamentTeamId",
						"=",
						"TournamentTeam.id",
					),
			">=",
			2,
		)
		.orderBy("rosterChangedAt", "desc")
		.limit(MAX_ROWS)
		.execute();
}

export type OrganizationTournament = NonNullable<
	Awaited<ReturnType<typeof findLatestOrganizationTournamentStartingBetween>>
>;

/** The organization tournament announced last that starts in the range. */
export function findLatestOrganizationTournamentStartingBetween({
	from,
	to,
}: {
	from: number;
	to: number;
}) {
	return organizationTournaments()
		.where((eb) => eb.between(calendarEventStartTime(eb).$asScalar(), from, to))
		.orderBy("Tournament.id", "desc")
		.limit(1)
		.executeTakeFirst();
}

/** Organization tournaments added to the calendar after `after`, latest first. */
export function findAllOrganizationTournamentsAddedAfter(after: number) {
	return organizationTournaments()
		.where("CalendarEvent.createdAt", ">", after)
		.orderBy("CalendarEvent.createdAt", "desc")
		.$narrowType<{ createdAt: number }>()
		.execute();
}

function organizationTournaments() {
	return db
		.selectFrom("CalendarEvent")
		.innerJoin("Tournament", "Tournament.id", "CalendarEvent.tournamentId")
		.innerJoin(
			"TournamentOrganization",
			"TournamentOrganization.id",
			"CalendarEvent.organizationId",
		)
		.select((eb) => [
			"Tournament.id as tournamentId",
			"Tournament.settings",
			"CalendarEvent.createdAt",
			"TournamentOrganization.id as organizationId",
			"TournamentOrganization.name as organizationName",
			"TournamentOrganization.slug as organizationSlug",
			concatUserSubmittedImagePrefix(
				eb
					.selectFrom("UnvalidatedUserSubmittedImage")
					.select("UnvalidatedUserSubmittedImage.url")
					.whereRef(
						"UnvalidatedUserSubmittedImage.id",
						"=",
						"TournamentOrganization.avatarImgId",
					)
					.$asScalar(),
			).as("organizationAvatarUrl"),
			calendarEventStartTime(eb).$asScalar().$notNull().as("startsAt"),
			eb
				.selectFrom("TournamentTeam")
				.select((countEb) => countEb.fn.countAll<number>().as("c"))
				.whereRef("TournamentTeam.tournamentId", "=", "Tournament.id")
				.as("teamCount"),
		])
		.where("CalendarEvent.hidden", "=", 0);
}

/** Organizations whose tournaments that started after `after` the user has a result in. */
export async function findOrganizationIdsPlayedByUserId({
	userId,
	after,
}: {
	userId: number;
	after: number;
}) {
	const rows = await db
		.selectFrom("TournamentResult")
		.innerJoin(
			"CalendarEvent",
			"CalendarEvent.tournamentId",
			"TournamentResult.tournamentId",
		)
		.select("CalendarEvent.organizationId")
		.distinct()
		.where("TournamentResult.userId", "=", userId)
		.where("CalendarEvent.organizationId", "is not", null)
		.where((eb) => eb(calendarEventStartTime(eb).$asScalar(), ">", after))
		.$narrowType<{ organizationId: number }>()
		.execute();

	return rows.map((row) => row.organizationId);
}

export function findSeriesWithLeaderboard() {
	return db
		.selectFrom("TournamentOrganizationSeries")
		.select([
			"TournamentOrganizationSeries.id",
			"TournamentOrganizationSeries.name",
			"TournamentOrganizationSeries.organizationId",
			"TournamentOrganizationSeries.substringMatches",
		])
		.where("TournamentOrganizationSeries.showLeaderboard", "=", 1)
		.execute();
}

/** An organization's visible events with results matching any of the series name substrings, started between `from` and `to`. */
export function findSeriesEventsWithResults({
	organizationId,
	substringMatches,
	from,
	to,
}: {
	organizationId: number;
	substringMatches: string[];
	from: number;
	to: number;
}) {
	return db
		.selectFrom("CalendarEvent")
		.select((eb) => [
			"CalendarEvent.id as eventId",
			"CalendarEvent.tournamentId",
			calendarEventStartTime(eb).$asScalar().$notNull().as("startsAt"),
		])
		.where("CalendarEvent.organizationId", "=", organizationId)
		.where("CalendarEvent.hidden", "=", 0)
		.where(calendarEventNameMatchesSeries(substringMatches))
		.where((eb) => eb.between(calendarEventStartTime(eb).$asScalar(), from, to))
		.where((eb) =>
			eb.or([
				eb.exists(
					eb
						.selectFrom("TournamentResult")
						.select("TournamentResult.tournamentId")
						.whereRef(
							"TournamentResult.tournamentId",
							"=",
							"CalendarEvent.tournamentId",
						),
				),
				eb.exists(
					eb
						.selectFrom("CalendarEventResultTeam")
						.select("CalendarEventResultTeam.id")
						.whereRef(
							"CalendarEventResultTeam.eventId",
							"=",
							"CalendarEvent.id",
						),
				),
			]),
		)
		.execute();
}

/** Everyone with a result in any of the tournaments or in any of the hand-reported calendar events */
export async function findResultUserIds({
	tournamentIds,
	calendarEventIds,
}: {
	tournamentIds: number[];
	calendarEventIds: number[];
}) {
	const tournamentRows =
		tournamentIds.length > 0
			? await db
					.selectFrom("TournamentResult")
					.select("TournamentResult.userId")
					.distinct()
					.where("TournamentResult.tournamentId", "in", tournamentIds)
					.execute()
			: [];
	const calendarEventRows =
		calendarEventIds.length > 0
			? await db
					.selectFrom("CalendarEventResultTeam")
					.innerJoin(
						"CalendarEventResultPlayer",
						"CalendarEventResultPlayer.teamId",
						"CalendarEventResultTeam.id",
					)
					.select("CalendarEventResultPlayer.userId")
					.distinct()
					.where("CalendarEventResultTeam.eventId", "in", calendarEventIds)
					.where("CalendarEventResultPlayer.userId", "is not", null)
					.execute()
			: [];

	return [...tournamentRows, ...calendarEventRows].map((row) => row.userId!);
}

export function findOrganizationById(organizationId: number) {
	return db
		.selectFrom("TournamentOrganization")
		.select((eb) => [
			"TournamentOrganization.name",
			"TournamentOrganization.slug",
			concatUserSubmittedImagePrefix(
				eb
					.selectFrom("UnvalidatedUserSubmittedImage")
					.select("UnvalidatedUserSubmittedImage.url")
					.whereRef(
						"UnvalidatedUserSubmittedImage.id",
						"=",
						"TournamentOrganization.avatarImgId",
					)
					.$asScalar(),
			).as("avatarUrl"),
		])
		.where("TournamentOrganization.id", "=", organizationId)
		.executeTakeFirst();
}

/** The latest tournament match VoDs, latest first. */
export function findLatestTournamentMatchVods() {
	return db
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
		.select([
			"TournamentMatchVod.userId",
			"TournamentMatchVod.platform",
			"TournamentMatchVod.account",
			"TournamentMatchVod.platformVideoId",
			"TournamentMatchVod.viewCount",
			"TournamentMatch.opponentOne",
			"TournamentMatch.opponentTwo",
			"TournamentStage.tournamentId",
		])
		.orderBy("TournamentMatchVod.id", "desc")
		.limit(MAX_ROWS)
		.execute();
}

/** Owners of the badges of tournaments that started after `after`, latest tournament first. */
export function findAllTournamentBadgeOwnersStartedAfter(after: number) {
	return db
		.selectFrom("CalendarEventDate")
		.innerJoin("CalendarEvent", "CalendarEvent.id", "CalendarEventDate.eventId")
		.innerJoin(
			"TournamentBadgeOwner",
			"TournamentBadgeOwner.tournamentId",
			"CalendarEvent.tournamentId",
		)
		.innerJoin("Badge", "Badge.id", "TournamentBadgeOwner.badgeId")
		.select((eb) => [
			"TournamentBadgeOwner.userId",
			"TournamentBadgeOwner.tournamentId",
			"Badge.code",
			"Badge.displayName",
			"Badge.hue",
			calendarEventStartTime(eb).$asScalar().$notNull().as("startsAt"),
			eb
				.selectFrom("TournamentBadgeOwner as Owner")
				.select((countEb) =>
					countEb.fn.count<number>("Owner.userId").distinct().as("c"),
				)
				.whereRef("Owner.badgeId", "=", "Badge.id")
				.as("ownerCount"),
		])
		.where("CalendarEventDate.startsAt", ">", after)
		.orderBy("CalendarEventDate.startsAt", "desc")
		.execute();
}

/** The owners of the trophies of the latest tournaments, latest first. */
export function findLatestTrophyOwners() {
	return db
		.selectFrom("TrophyOwner")
		.innerJoin("Trophy", "Trophy.id", "TrophyOwner.trophyId")
		.select([
			"TrophyOwner.userId",
			"TrophyOwner.tournamentId",
			"TrophyOwner.tier",
			"Trophy.id as trophyId",
			"Trophy.name",
			"Trophy.model",
			"Trophy.code",
		])
		.orderBy("TrophyOwner.tournamentId", "desc")
		.limit(MAX_ROWS)
		.execute();
}

/** Trophies added (not edits of existing ones) after `after` with who made them, latest first. */
export function findAllNewTrophiesAcceptedAfter(after: number) {
	return db
		.selectFrom("PendingTrophy")
		.innerJoin("Trophy", "Trophy.model", "PendingTrophy.model")
		.leftJoin(
			"TournamentOrganization",
			"TournamentOrganization.id",
			"Trophy.organizationId",
		)
		.select([
			"Trophy.id",
			"Trophy.name",
			"Trophy.model",
			"Trophy.code",
			"Trophy.creatorId",
			"TournamentOrganization.name as organizationName",
			"PendingTrophy.acceptedAt",
		])
		.where("PendingTrophy.targetTrophyId", "is", null)
		.where("PendingTrophy.acceptedAt", ">", after)
		.where("Trophy.creatorId", "is not", null)
		.orderBy("PendingTrophy.acceptedAt", "desc")
		.limit(MAX_ROWS)
		.$narrowType<{ creatorId: number; acceptedAt: number }>()
		.execute();
}

/** Who saved which upcoming tournaments and when, of `userIds` or of everyone when left out. */
export function findAllUpcomingTournamentSaves({
	after,
	userIds,
}: {
	after: number;
	userIds?: number[];
}) {
	let query = db
		.selectFrom("SavedCalendarEvent")
		.innerJoin(
			"CalendarEvent",
			"CalendarEvent.id",
			"SavedCalendarEvent.calendarEventId",
		)
		.select([
			"SavedCalendarEvent.userId",
			"SavedCalendarEvent.createdAt",
			"CalendarEvent.tournamentId",
		])
		.where("CalendarEvent.id", "in", upcomingCalendarEventIds(after))
		.where("CalendarEvent.hidden", "=", 0)
		.where("CalendarEvent.tournamentId", "is not", null)
		.$narrowType<{ tournamentId: number }>();

	if (userIds) {
		if (userIds.length === 0) return Promise.resolve([]);
		query = query.where("SavedCalendarEvent.userId", "in", userIds);
	}

	return query.orderBy("SavedCalendarEvent.createdAt", "asc").execute();
}

/** Staff of the tournaments starting after `after`, soonest first. */
export function findAllUpcomingStaff(after: number) {
	return db
		.selectFrom("TournamentStaff")
		.innerJoin(
			"CalendarEvent",
			"CalendarEvent.tournamentId",
			"TournamentStaff.tournamentId",
		)
		.select((eb) => [
			"TournamentStaff.userId",
			"TournamentStaff.tournamentId",
			"TournamentStaff.role",
			"TournamentStaff.createdAt",
			calendarEventStartTime(eb).$asScalar().$notNull().as("startsAt"),
		])
		.where("CalendarEvent.id", "in", upcomingCalendarEventIds(after))
		.where("CalendarEvent.hidden", "=", 0)
		.where((eb) => eb(calendarEventStartTime(eb).$asScalar(), ">", after))
		.orderBy("startsAt", "asc")
		.execute();
}

/** Finalized public tournaments that started in the range (optionally on a day of the year, `MM-DD` in UTC), best tier and most teams first. */
export function findBiggestFinalizedTournaments({
	from,
	to,
	monthDay,
	limit,
}: {
	from: number;
	to: number;
	monthDay?: string;
	limit: number;
}) {
	let query = publicTournaments()
		.select((eb) => [
			"Tournament.id as tournamentId",
			"Tournament.tier",
			tournamentRegisteredTeamCount(eb).$asScalar().$notNull().as("teamCount"),
			calendarEventStartTime(eb).$asScalar().$notNull().as("startsAt"),
		])
		.where("Tournament.isFinalized", "=", 1)
		.where((eb) =>
			eb.between(calendarEventStartTime(eb).$asScalar(), from, to),
		);

	if (monthDay) {
		query = query.where(
			(eb) =>
				sql<string>`strftime('%m-%d', ${calendarEventStartTime(eb).$asScalar()}, 'unixepoch')`,
			"=",
			monthDay,
		);
	}

	return query
		.orderBy(sql`"Tournament"."tier" is null`)
		.orderBy("Tournament.tier", "asc")
		.orderBy("teamCount", "desc")
		.limit(limit)
		.execute();
}

/** The best placed team of each of the top three placements of a tournament. */
export function findPodiumTeamIdsByTournamentId(tournamentId: number) {
	return db
		.selectFrom("TournamentResult")
		.select(["TournamentResult.placement", "TournamentResult.tournamentTeamId"])
		.where("TournamentResult.tournamentId", "=", tournamentId)
		.where("TournamentResult.placement", "<=", 3)
		.groupBy([
			"TournamentResult.placement",
			"TournamentResult.tournamentTeamId",
		])
		.orderBy("TournamentResult.placement", "asc")
		.execute();
}

/** Public tournaments whose registration closed in the range, before they started. */
export function findTournamentsWithRegistrationClosedBetween({
	from,
	to,
}: {
	from: number;
	to: number;
}) {
	const regClosesAt = sql<number>`cast("Tournament"."settings" ->> 'regClosesAt' as integer)`;

	return publicTournaments()
		.select((eb) => [
			"Tournament.id as tournamentId",
			regClosesAt.as("regClosesAt"),
			calendarEventStartTime(eb).$asScalar().$notNull().as("startsAt"),
			tournamentRegisteredTeamCount(eb).$asScalar().$notNull().as("teamCount"),
		])
		.where(regClosesAt, ">=", from)
		.where(regClosesAt, "<=", to)
		.orderBy("regClosesAt", "desc")
		.limit(MAX_ROWS)
		.execute();
}

/** Registered teams of a tournament with their members, placeholder and dropped out teams left out. */
export async function findRegisteredTeamsByTournamentId(tournamentId: number) {
	const rows = await db
		.selectFrom("TournamentTeam")
		.select("TournamentTeam.id")
		.where("TournamentTeam.tournamentId", "=", tournamentId)
		.where("TournamentTeam.isPlaceholder", "=", 0)
		.where("TournamentTeam.droppedOut", "=", 0)
		.execute();

	return findTournamentTeamsByIds(rows.map((row) => row.id));
}

export function findSeriesByOrganizationId(organizationId: number) {
	return db
		.selectFrom("TournamentOrganizationSeries")
		.select([
			"TournamentOrganizationSeries.name",
			"TournamentOrganizationSeries.substringMatches",
		])
		.where("TournamentOrganizationSeries.organizationId", "=", organizationId)
		.execute();
}

/** How many of an organization's events matching any of the name substrings the user has won, up to `before`. */
export async function countSeriesWinsOfUser({
	userId,
	organizationId,
	substringMatches,
	before,
}: {
	userId: number;
	organizationId: number;
	substringMatches: string[];
	before: number;
}) {
	const row = await db
		.selectFrom("TournamentResult")
		.innerJoin(
			"CalendarEvent",
			"CalendarEvent.tournamentId",
			"TournamentResult.tournamentId",
		)
		.select((eb) =>
			eb.fn
				.count<number>("TournamentResult.tournamentId")
				.distinct()
				.as("count"),
		)
		.where("TournamentResult.userId", "=", userId)
		.where("TournamentResult.placement", "=", 1)
		.where("CalendarEvent.organizationId", "=", organizationId)
		.where(calendarEventNameMatchesSeries(substringMatches))
		.where((eb) => eb(calendarEventStartTime(eb).$asScalar(), "<=", before))
		.executeTakeFirstOrThrow();

	return row.count;
}

function publicBuilds() {
	return db
		.selectFrom("Build")
		.select((eb) => [
			"Build.id",
			"Build.ownerId",
			"Build.title",
			"Build.description",
			"Build.modes",
			"Build.headGearSplId",
			"Build.clothesGearSplId",
			"Build.shoesGearSplId",
			"Build.abilities",
			"Build.updatedAt",
			jsonArrayFrom(
				eb
					.selectFrom("BuildWeapon")
					.select("BuildWeapon.weaponSplId")
					.whereRef("BuildWeapon.buildId", "=", "Build.id")
					.orderBy("BuildWeapon.weaponSplId", "asc"),
			).as("weapons"),
			eb
				.selectFrom("SplatoonPlayer")
				.select(
					sql<number | null>`"SplatoonPlayer"."peakXp" ->> '$.overall'`.as(
						"xp",
					),
				)
				.whereRef("SplatoonPlayer.userId", "=", "Build.ownerId")
				.limit(1)
				.as("peakXp"),
		])
		.where("Build.isPrivate", "=", 0);
}

function upcomingCalendarEventIds(after: number) {
	return db
		.selectFrom("CalendarEventDate")
		.select("CalendarEventDate.eventId")
		.where("CalendarEventDate.startsAt", ">", after);
}

function publicTournaments() {
	return db
		.selectFrom("CalendarEvent")
		.innerJoin("Tournament", "Tournament.id", "CalendarEvent.tournamentId")
		.where("CalendarEvent.hidden", "=", 0)
		.where(sql<boolean>`coalesce("Tournament"."settings" ->> 'isTest', 0) = 0`);
}

// ---------- Teams & scrims ----------

/** Joins to teams that still have the member, after `after`, latest first. */
export function findAllTeamJoinsAfter(after: number) {
	return db
		.selectFrom("AllTeamMember")
		.innerJoin("AllTeam", "AllTeam.id", "AllTeamMember.teamId")
		.select([
			"AllTeamMember.userId",
			"AllTeamMember.teamId",
			"AllTeamMember.createdAt",
			"AllTeamMember.role",
		])
		.where("AllTeamMember.leftAt", "is", null)
		.where("AllTeam.deletedAt", "is", null)
		.where("AllTeamMember.createdAt", ">", after)
		.orderBy("AllTeamMember.createdAt", "desc")
		.execute();
}

/** Teams created after `after` that still exist, latest first. */
export function findAllCreatedTeamsAfter(after: number) {
	return db
		.selectFrom("AllTeam")
		.innerJoin("AllTeamMember", "AllTeamMember.teamId", "AllTeam.id")
		.select([
			"AllTeam.id",
			"AllTeam.createdAt",
			"AllTeamMember.userId as ownerUserId",
		])
		.where("AllTeamMember.isOwner", "=", 1)
		.where("AllTeam.deletedAt", "is", null)
		.where("AllTeam.createdAt", ">", after)
		.orderBy("AllTeam.createdAt", "desc")
		.execute();
}

/** The latest week where at least `minMembers` of one team filled their availability. */
export function findLatestTeamAvailabilityWeek({
	before,
	minMembers,
	teamIds,
}: {
	before: number;
	minMembers: number;
	/** Only these teams, any team when not given */
	teamIds?: number[];
}) {
	let query = db
		.selectFrom("AvailabilityWeek")
		.innerJoin(
			"AllTeamMember",
			"AllTeamMember.userId",
			"AvailabilityWeek.userId",
		)
		.select(({ fn }) => [
			"AllTeamMember.teamId",
			"AvailabilityWeek.weekStartsAt",
			fn.count<number>("AvailabilityWeek.userId").distinct().as("filledCount"),
			fn.max("AvailabilityWeek.updatedAt").as("updatedAt"),
		])
		.where("AllTeamMember.leftAt", "is", null)
		.where("AvailabilityWeek.weekStartsAt", "<=", before);

	if (teamIds) {
		if (teamIds.length === 0) return Promise.resolve(undefined);
		query = query.where("AllTeamMember.teamId", "in", teamIds);
	}

	return query
		.groupBy(["AllTeamMember.teamId", "AvailabilityWeek.weekStartsAt"])
		.having(
			({ fn }) => fn.count("AvailabilityWeek.userId").distinct(),
			">=",
			minMembers,
		)
		.orderBy("AvailabilityWeek.weekStartsAt", "desc")
		.orderBy("filledCount", "desc")
		.limit(1)
		.executeTakeFirst();
}

/** The latest added team event that hasn't started by `now`, with who it's for, not authored by `excludeAuthorId`. */
export function findLatestAddedUpcomingTeamEvent({
	now,
	excludeAuthorId,
	teamIds,
}: {
	now: number;
	excludeAuthorId: number;
	/** Only these teams, any team when not given */
	teamIds?: number[];
}) {
	let query = db
		.selectFrom("TeamEvent")
		.select((eb) => [
			"TeamEvent.id",
			"TeamEvent.teamId",
			"TeamEvent.authorId",
			"TeamEvent.name",
			"TeamEvent.startsAt",
			"TeamEvent.endsAt",
			"TeamEvent.createdAt",
			jsonArrayFrom(
				eb
					.selectFrom("TeamEventMember")
					.innerJoin("User", "User.id", "TeamEventMember.userId")
					.select((memberEb) => commonUserSelect(memberEb))
					.whereRef("TeamEventMember.teamEventId", "=", "TeamEvent.id"),
			).as("members"),
		])
		.where("TeamEvent.startsAt", ">", now)
		.where("TeamEvent.createdAt", "<=", now)
		.where("TeamEvent.authorId", "is not", null)
		.where("TeamEvent.authorId", "!=", excludeAuthorId)
		.$narrowType<{ authorId: number }>();

	if (teamIds) {
		if (teamIds.length === 0) return Promise.resolve(undefined);
		query = query.where("TeamEvent.teamId", "in", teamIds);
	}

	return query
		.orderBy("TeamEvent.createdAt", "desc")
		.limit(1)
		.executeTakeFirst();
}

/**
 * Team scrim posts still open for requests at `now` that the viewer can see or has requested: not
 * canceled, nothing accepted, not started yet ("looking now" posts until `lookingNowFrom`). Posts the
 * viewer is in or of `excludedTeamIds` are left out, as are ones created before `createdAfter`
 * unless the viewer requested them after it.
 */
export function findOpenScrimPostsForViewer({
	viewerId,
	excludedTeamIds,
	now,
	lookingNowFrom,
	createdAfter,
}: {
	viewerId: number;
	excludedTeamIds: number[];
	now: number;
	lookingNowFrom: number;
	createdAfter: number;
}) {
	let query = scrimPostFeedQuery()
		.select((eb) => [
			viewerRequestedAt(eb, viewerId).as("viewerRequestedAt"),
			visibleThroughAssociationTo({ entity: "ScrimPost", viewerId, now }).as(
				"isViaAssociation",
			),
		])
		.where(
			"ScrimPost.startsAt",
			">=",
			Math.min(lookingNowFrom, now - SCRIM_POST_MAX_RANGE_SECONDS),
		)
		.where((eb) =>
			eb.or([
				eb(
					eb.fn.coalesce("ScrimPost.rangeEndsAt", "ScrimPost.startsAt"),
					">",
					now,
				),
				eb.and([
					eb("ScrimPost.isScheduledForFuture", "=", 0),
					eb("ScrimPost.startsAt", ">=", lookingNowFrom),
				]),
			]),
		)
		.where((eb) =>
			eb.not(
				eb.exists(
					eb
						.selectFrom("ScrimPostRequest")
						.select("ScrimPostRequest.id")
						.whereRef("ScrimPostRequest.scrimPostId", "=", "ScrimPost.id")
						.where("ScrimPostRequest.isAccepted", "=", 1),
				),
			),
		)
		.where((eb) =>
			eb.not(
				eb.exists(
					eb
						.selectFrom("ScrimPostUser")
						.select("ScrimPostUser.scrimPostId")
						.whereRef("ScrimPostUser.scrimPostId", "=", "ScrimPost.id")
						.where("ScrimPostUser.userId", "=", viewerId),
				),
			),
		)
		.where((eb) => {
			const requestedAt = viewerRequestedAt(eb, viewerId);

			return eb.or([
				eb.and([
					eb("ScrimPost.createdAt", ">=", createdAfter),
					visibleTo({ entity: "ScrimPost", viewerId, now }),
				]),
				eb(requestedAt, ">=", createdAfter),
			]);
		});

	if (excludedTeamIds.length > 0) {
		query = query.where("ScrimPost.teamId", "not in", excludedTeamIds);
	}

	return query.orderBy("ScrimPost.createdAt", "desc").limit(MAX_ROWS).execute();
}

/** The latest team scrim post starting between `from` and `to` of anyone, for the feed test page. */
export function findLatestUpcomingScrimPost({
	from,
	to,
}: {
	from: number;
	to: number;
}) {
	return scrimPostFeedQuery()
		.where("ScrimPost.startsAt", ">", from)
		.where("ScrimPost.startsAt", "<", to)
		.orderBy("ScrimPost.createdAt", "desc")
		.limit(1)
		.executeTakeFirst();
}

/** Accepted, non-canceled scrims of the teams booked to start between `from` and `to`, with the team ids of both sides. */
export function findAcceptedScrimsOfTeams({
	teamIds,
	from,
	to,
}: {
	teamIds: number[];
	from: number;
	to: number;
}) {
	if (teamIds.length === 0) return Promise.resolve([]);

	return db
		.selectFrom("ScrimPost")
		.innerJoin(
			"ScrimPostRequest",
			"ScrimPostRequest.scrimPostId",
			"ScrimPost.id",
		)
		.select((eb) => [
			"ScrimPost.teamId as postTeamId",
			"ScrimPostRequest.teamId as requestTeamId",
			eb.fn
				.coalesce("ScrimPostRequest.startsAt", "ScrimPost.startsAt")
				.as("startsAt"),
		])
		.where("ScrimPostRequest.isAccepted", "=", 1)
		.where("ScrimPost.canceledAt", "is", null)
		.where("ScrimPost.startsAt", ">=", from)
		.where("ScrimPost.startsAt", "<", to)
		.where((eb) =>
			eb.or([
				eb("ScrimPost.teamId", "in", teamIds),
				eb("ScrimPostRequest.teamId", "in", teamIds),
			]),
		)
		.execute();
}

/** The LUTI divs of the current members of the teams who have one. */
export function findMemberLutiDivsByTeamIds(teamIds: number[]) {
	if (teamIds.length === 0) return Promise.resolve([]);

	return db
		.selectFrom("AllTeamMember")
		.innerJoin("User", "User.id", "AllTeamMember.userId")
		.select(["AllTeamMember.teamId", "User.div"])
		.where("AllTeamMember.teamId", "in", teamIds)
		.where("AllTeamMember.leftAt", "is", null)
		.where("User.div", "is not", null)
		.$narrowType<{ div: string }>()
		.execute();
}

export type FeedScrimPost = Unwrapped<
	ReturnType<typeof scrimPostFeedQuery>["execute"]
>;

function scrimPostFeedQuery() {
	return db
		.selectFrom("ScrimPost")
		.select((eb) => [
			"ScrimPost.id",
			"ScrimPost.teamId",
			"ScrimPost.startsAt",
			"ScrimPost.rangeEndsAt",
			"ScrimPost.isScheduledForFuture",
			"ScrimPost.createdAt",
			"ScrimPost.text",
			"ScrimPost.maxDiv",
			"ScrimPost.minDiv",
			eb
				.selectFrom("ScrimPostRequest")
				.select((countEb) => countEb.fn.countAll<number>().as("c"))
				.whereRef("ScrimPostRequest.scrimPostId", "=", "ScrimPost.id")
				.$asScalar()
				.$notNull()
				.as("requestCount"),
		])
		.where("ScrimPost.canceledAt", "is", null)
		.where("ScrimPost.teamId", "is not", null)
		.$narrowType<{ teamId: number }>();
}

function viewerRequestedAt(
	eb: ExpressionBuilder<Tables, "ScrimPost">,
	viewerId: number,
) {
	return eb
		.selectFrom("ScrimPostRequest")
		.innerJoin(
			"ScrimPostRequestUser",
			"ScrimPostRequestUser.scrimPostRequestId",
			"ScrimPostRequest.id",
		)
		.select("ScrimPostRequest.createdAt")
		.whereRef("ScrimPostRequest.scrimPostId", "=", "ScrimPost.id")
		.where("ScrimPostRequestUser.userId", "=", viewerId)
		.limit(1);
}

/** The latest scrim with at least `minMaps` reported maps, with its maps and both teams. */
export function findLatestReportedScrim({
	before,
	minMaps,
	teamIds,
}: {
	before: number;
	minMaps: number;
	/** Only scrims these teams played in, any scrim when not given */
	teamIds?: number[];
}) {
	if (teamIds?.length === 0) return Promise.resolve(undefined);

	let query = db
		.selectFrom("ScrimPost")
		.select((eb) => [
			"ScrimPost.id",
			"ScrimPost.teamId",
			eb
				.selectFrom("ScrimPostRequest")
				.select("ScrimPostRequest.teamId")
				.whereRef("ScrimPostRequest.scrimPostId", "=", "ScrimPost.id")
				.where("ScrimPostRequest.isAccepted", "=", 1)
				.limit(1)
				.as("opponentTeamId"),
			eb
				.selectFrom("ScrimMap")
				.select((maxEb) => maxEb.fn.max("ScrimMap.reportedAt").as("at"))
				.whereRef("ScrimMap.scrimPostId", "=", "ScrimPost.id")
				.as("reportedAt"),
			jsonArrayFrom(
				eb
					.selectFrom("ScrimMap")
					.select(["ScrimMap.mode", "ScrimMap.stageId", "ScrimMap.winnerSide"])
					.whereRef("ScrimMap.scrimPostId", "=", "ScrimPost.id")
					.where("ScrimMap.winnerSide", "is not", null)
					.orderBy("ScrimMap.index", "asc"),
			).as("maps"),
		])
		.where("ScrimPost.teamId", "is not", null)
		.where((eb) =>
			eb(
				eb
					.selectFrom("ScrimMap")
					.select((countEb) => countEb.fn.countAll<number>().as("c"))
					.whereRef("ScrimMap.scrimPostId", "=", "ScrimPost.id")
					.where("ScrimMap.winnerSide", "is not", null)
					.where("ScrimMap.reportedAt", "<", before),
				">=",
				minMaps,
			),
		);

	if (teamIds) {
		query = query.where((eb) =>
			eb.or([
				eb("ScrimPost.teamId", "in", teamIds),
				eb.exists(
					eb
						.selectFrom("ScrimPostRequest")
						.select("ScrimPostRequest.id")
						.whereRef("ScrimPostRequest.scrimPostId", "=", "ScrimPost.id")
						.where("ScrimPostRequest.isAccepted", "=", 1)
						.where("ScrimPostRequest.teamId", "in", teamIds),
				),
			]),
		);
	}

	return query
		.orderBy("reportedAt", "desc")
		.limit(1)
		.$narrowType<{ teamId: number }>()
		.executeTakeFirst();
}

/**
 * Posts of the type bumped in `[from, to)` that the viewer can see on the LFG page: not their own
 * and not limited to a Plus tier above theirs. Newest first, with the ids of the post's team members.
 */
export function findLFGPostsUpdatedBetween({
	type,
	viewerId,
	from,
	to,
}: {
	type: FeedLFGPostType;
	viewerId: number;
	from: number;
	to: number;
}) {
	let query = lfgPostsQuery()
		.where("LFGPost.type", "=", type)
		.where("LFGPost.authorId", "!=", viewerId)
		.where("LFGPost.updatedAt", ">=", from)
		.where("LFGPost.updatedAt", "<", to)
		.where((eb) =>
			eb.or([
				eb("LFGPost.plusTierVisibility", "is", null),
				eb(
					"LFGPost.plusTierVisibility",
					">=",
					eb
						.selectFrom("PlusTier")
						.select("PlusTier.tier")
						.where("PlusTier.userId", "=", viewerId),
				),
			]),
		);

	if (type === "TEAM_FOR_PLAYER") {
		query = query.where("LFGPost.teamId", "is not", null);
	}

	return query.orderBy("LFGPost.updatedAt", "desc").limit(MAX_ROWS).execute();
}

/** The user's LFG posts bumped at or after `after`, with the ids of each post's team members. */
export function findLFGPostsByAuthorId({
	authorId,
	after,
}: {
	authorId: number;
	after: number;
}) {
	return lfgPostsQuery()
		.where("LFGPost.authorId", "=", authorId)
		.where("LFGPost.updatedAt", ">=", after)
		.execute();
}

function lfgPostsQuery() {
	return db
		.selectFrom("LFGPost")
		.select((eb) => [
			"LFGPost.id",
			"LFGPost.type",
			"LFGPost.authorId",
			"LFGPost.teamId",
			"LFGPost.text",
			"LFGPost.timezone",
			"LFGPost.languages",
			"LFGPost.updatedAt",
			jsonArrayFrom(
				eb
					.selectFrom("TeamMemberWithSecondary")
					.select("TeamMemberWithSecondary.userId")
					.whereRef("TeamMemberWithSecondary.teamId", "=", "LFGPost.teamId"),
			).as("teamMembers"),
		]);
}

export function findWeaponPoolByUserId(userId: number) {
	return db
		.selectFrom("UserWeaponPool")
		.select(["UserWeaponPool.weaponSplId", "UserWeaponPool.isFavorite"])
		.where("UserWeaponPool.userId", "=", userId)
		.orderBy("UserWeaponPool.sortOrder", "asc")
		.execute();
}

/** The teams the users are currently members of, with when each team was created. */
/** Every current team membership with when the team was created. */
export function findAllTeamMemberships() {
	return db
		.selectFrom("AllTeamMember")
		.innerJoin("AllTeam", "AllTeam.id", "AllTeamMember.teamId")
		.select([
			"AllTeamMember.userId",
			"AllTeam.id as teamId",
			"AllTeam.createdAt",
		])
		.where("AllTeamMember.leftAt", "is", null)
		.where("AllTeam.deletedAt", "is", null)
		.execute();
}

export async function countTournamentsByTeamId(teamId: number) {
	const row = await db
		.selectFrom("TournamentTeam")
		.select((eb) =>
			eb.fn.count<number>("TournamentTeam.tournamentId").distinct().as("count"),
		)
		.where("TournamentTeam.teamId", "=", teamId)
		.executeTakeFirstOrThrow();

	return row.count;
}

// ---------- Creators ----------

/** Everyone who posted art in the range with how much, most first. */
export function findAllArtistsActiveBetween({
	from,
	to,
}: {
	from: number;
	to: number;
}) {
	return db
		.selectFrom("Art")
		.innerJoin("UserSubmittedImage", "UserSubmittedImage.id", "Art.imgId")
		.select(({ fn }) => [
			"Art.authorId",
			fn.countAll<number>().as("count"),
			fn.max("Art.createdAt").as("latestAt"),
		])
		.where("Art.createdAt", ">", from)
		.where("Art.createdAt", "<", to)
		.groupBy("Art.authorId")
		.orderBy("count", "desc")
		.limit(MAX_ROWS)
		.execute();
}

/** The artist's latest pieces posted in the range. */
export function findArtPiecesOfAuthorBetween({
	authorId,
	from,
	to,
}: {
	authorId: number;
	from: number;
	to: number;
}) {
	return db
		.selectFrom("Art")
		.innerJoin("UserSubmittedImage", "UserSubmittedImage.id", "Art.imgId")
		.select((eb) => [
			"Art.id",
			"Art.description",
			"Art.createdAt",
			concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
				"url",
			),
		])
		.where("Art.authorId", "=", authorId)
		.where("Art.createdAt", ">", from)
		.where("Art.createdAt", "<", to)
		.orderBy("Art.createdAt", "desc")
		.limit(4)
		.execute();
}

/** Art with users tagged in it posted after `after`, one row per tagged user, latest first. */
export function findAllTaggedArtAfter(after: number) {
	return db
		.selectFrom("ArtUserMetadata")
		.innerJoin("Art", "Art.id", "ArtUserMetadata.artId")
		.innerJoin("UserSubmittedImage", "UserSubmittedImage.id", "Art.imgId")
		.select((eb) => [
			"Art.id",
			"Art.authorId",
			"Art.createdAt",
			"Art.description",
			concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
				"url",
			),
			"ArtUserMetadata.userId as taggedUserId",
		])
		.where("Art.createdAt", ">", after)
		.orderBy("Art.createdAt", "desc")
		.limit(MAX_ROWS)
		.execute();
}

/** Artists who opened commissions after `after` and have art to show, latest first. */
export function findAllOpenedCommissionsAfter(after: number) {
	return db
		.selectFrom("User")
		.select((eb) => [
			"User.id",
			"User.commissionsOpenedAt",
			"User.commissionText",
			jsonArrayFrom(
				eb
					.selectFrom("Art")
					.innerJoin("UserSubmittedImage", "UserSubmittedImage.id", "Art.imgId")
					.select((artEb) => [
						"Art.description",
						"Art.createdAt",
						concatUserSubmittedImagePrefix(
							artEb.ref("UserSubmittedImage.url"),
						).as("url"),
					])
					.whereRef("Art.authorId", "=", "User.id")
					.orderBy("Art.isShowcase", "desc")
					.orderBy("Art.createdAt", "desc")
					.limit(3),
			).as("pieces"),
		])
		.where("User.commissionsOpen", "=", 1)
		.where("User.commissionText", "is not", null)
		.where("User.commissionsOpenedAt", ">", after)
		.where((eb) =>
			eb.exists(
				eb
					.selectFrom("Art")
					.innerJoin("UserSubmittedImage", "UserSubmittedImage.id", "Art.imgId")
					.select("Art.id")
					.whereRef("Art.authorId", "=", "User.id"),
			),
		)
		.orderBy("User.commissionsOpenedAt", "desc")
		.limit(MAX_ROWS)
		.$narrowType<{ commissionsOpenedAt: number; commissionText: string }>()
		.execute();
}

/** The latest public build of the users, or for the weapon by a player with high peak XP. */
/** Public builds updated after `after`, latest first. */
export function findAllPublicBuildIdsUpdatedAfter(after: number) {
	return db
		.selectFrom("Build")
		.select(["Build.id", "Build.ownerId", "Build.updatedAt"])
		.where("Build.isPrivate", "=", 0)
		.where("Build.updatedAt", ">", after)
		.orderBy("Build.updatedAt", "desc")
		.execute();
}

export function findBuildById(buildId: number) {
	return publicBuilds().where("Build.id", "=", buildId).executeTakeFirst();
}

/** For every weapon, the public build of it updated last by someone whose peak X Power is above `minPeakXp`. */
export function findLatestBuildIdsOfHighXpOwners(minPeakXp: number) {
	return (
		db
			.selectFrom("BuildWeapon")
			// with max() SQLite takes the bare buildId from the row holding the maximum
			.select((eb) => [
				"BuildWeapon.weaponSplId",
				"BuildWeapon.buildId",
				eb.fn.max("BuildWeapon.updatedAt").as("updatedAt"),
			])
			.where("BuildWeapon.sortValue", "is not", null)
			.where("BuildWeapon.ownerId", "in", (eb) =>
				eb
					.selectFrom("SplatoonPlayer")
					.select("SplatoonPlayer.userId")
					.where("SplatoonPlayer.userId", "is not", null)
					// peak XP is denormalized as JSON
					.where(sql`"SplatoonPlayer"."peakXp" ->> '$.overall'`, ">", minPeakXp)
					.$narrowType<{ userId: number }>(),
			)
			.groupBy("BuildWeapon.weaponSplId")
			.execute()
	);
}

export async function findLatestVideo(before: number) {
	const video = await db
		.selectFrom("Video")
		.select([
			"Video.id",
			"Video.title",
			"Video.type",
			"Video.youtubeId",
			"Video.youtubePublishedAt",
			"Video.submitterUserId",
		])
		.where("Video.youtubePublishedAt", "<", before)
		.orderBy("Video.youtubePublishedAt", "desc")
		.limit(1)
		.executeTakeFirst();
	if (!video) return;

	const matches = await db
		.selectFrom("VideoMatch")
		.select((eb) => [
			"VideoMatch.mode",
			jsonArrayFrom(
				eb
					.selectFrom("VideoMatchPlayer")
					.select([
						"VideoMatchPlayer.playerUserId",
						"VideoMatchPlayer.playerName",
						"VideoMatchPlayer.weaponSplId",
						"VideoMatchPlayer.player",
					])
					.whereRef("VideoMatchPlayer.videoMatchId", "=", "VideoMatch.id"),
			).as("players"),
		])
		.where("VideoMatch.videoId", "=", video.id)
		.orderBy("VideoMatch.startsAt", "asc")
		.execute();

	return { ...video, matches };
}

/** The best X Rank placement of the latest month, of the users when one of them placed. */
/** The X Rank placements of sendou.ink users from the latest month there are any, best first. */
export async function findAllUserPlacementsOfLatestMonth() {
	const latest = await db
		.selectFrom("XRankPlacement")
		.select(["XRankPlacement.year", "XRankPlacement.month"])
		.orderBy("XRankPlacement.year", "desc")
		.orderBy("XRankPlacement.month", "desc")
		.limit(1)
		.executeTakeFirst();
	if (!latest) return [];

	return db
		.selectFrom("XRankPlacement")
		.innerJoin("SplatoonPlayer", "SplatoonPlayer.id", "XRankPlacement.playerId")
		.select([
			"SplatoonPlayer.userId",
			"XRankPlacement.rank",
			"XRankPlacement.power",
			"XRankPlacement.mode",
			"XRankPlacement.region",
			"XRankPlacement.weaponSplId",
			"XRankPlacement.month",
			"XRankPlacement.year",
		])
		.where("XRankPlacement.year", "=", latest.year)
		.where("XRankPlacement.month", "=", latest.month)
		.where("SplatoonPlayer.userId", "is not", null)
		.orderBy("XRankPlacement.rank", "asc")
		.$narrowType<{ userId: number }>()
		.execute();
}

/** Scanned matches with a replay code created before `before`, latest first. */
export function findAllScannedMatchIdsWithReplayCode(before: number) {
	return (
		db
			.selectFrom("IngestedMatch")
			.select(["IngestedMatch.id", "IngestedMatch.povUserId"])
			// the replay code lives inside the JSON column
			.where(sql`"IngestedMatch"."data" ->> '$.replayCode'`, "is not", null)
			.where("IngestedMatch.createdAt", "<", before)
			.orderBy("IngestedMatch.createdAt", "desc")
			.execute()
	);
}

export function findScannedMatchById(id: number) {
	return db
		.selectFrom("IngestedMatch")
		.select(["IngestedMatch.povUserId", "IngestedMatch.data"])
		.where("IngestedMatch.id", "=", id)
		.executeTakeFirst();
}

// ---------- Community ----------

/** Friendships formed after `after`, latest first. */
export function findAllFriendshipsCreatedAfter(after: number) {
	return db
		.selectFrom("Friendship")
		.select([
			"Friendship.userOneId",
			"Friendship.userTwoId",
			"Friendship.createdAt",
		])
		.where("Friendship.createdAt", ">", after)
		.orderBy("Friendship.createdAt", "desc")
		.execute();
}

/** The Plus Server tier the user is a member of, `null` when they aren't. */
export async function findPlusTierByUserId(userId: number) {
	const row = await db
		.selectFrom("PlusTier")
		.select("PlusTier.tier")
		.where("PlusTier.userId", "=", userId)
		.executeTakeFirst();

	return row?.tier ?? null;
}

/** First suggestion of each player suggested in the voting month, leaving out players already in the tier or above, latest first. */
export function findAllFirstPlusSuggestionsOfMonth({
	month,
	year,
}: {
	month: number;
	year: number;
}) {
	return db
		.selectFrom("PlusSuggestion")
		.leftJoin("PlusTier", "PlusTier.userId", "PlusSuggestion.suggestedId")
		.select([
			"PlusSuggestion.suggestedId",
			"PlusSuggestion.tier",
			"PlusSuggestion.text",
			"PlusSuggestion.createdAt",
		])
		.where("PlusSuggestion.id", "in", (eb) =>
			eb
				.selectFrom("PlusSuggestion as First")
				.select(({ fn }) => fn.min("First.id").as("id"))
				.where("First.month", "=", month)
				.where("First.year", "=", year)
				.groupBy(["First.suggestedId", "First.tier"]),
		)
		.where((eb) =>
			eb.or([
				eb("PlusTier.tier", "is", null),
				eb("PlusTier.tier", ">", eb.ref("PlusSuggestion.tier")),
			]),
		)
		.orderBy("PlusSuggestion.createdAt", "desc")
		.execute();
}

export function findFirstTournamentResultByUserId(userId: number) {
	return db
		.selectFrom("TournamentResult")
		.innerJoin(
			"CalendarEvent",
			"CalendarEvent.tournamentId",
			"TournamentResult.tournamentId",
		)
		.select((eb) => [
			"TournamentResult.tournamentId",
			"TournamentResult.placement",
			"TournamentResult.participantCount",
			"TournamentResult.tournamentTeamId",
			calendarEventStartTime(eb).$asScalar().$notNull().as("startsAt"),
		])
		.where("TournamentResult.userId", "=", userId)
		.orderBy("startsAt", "asc")
		.limit(1)
		.executeTakeFirst();
}

export function findLatestAddedUpcomingCalendarEvent(after: number) {
	return db
		.selectFrom("CalendarEvent")
		.select((eb) => [
			"CalendarEvent.id",
			"CalendarEvent.name",
			"CalendarEvent.authorId",
			"CalendarEvent.tags",
			"CalendarEvent.createdAt",
			calendarEventStartTime(eb).$asScalar().$notNull().as("startsAt"),
		])
		.where("CalendarEvent.tournamentId", "is", null)
		.where("CalendarEvent.hidden", "=", 0)
		.where((eb) => eb(calendarEventStartTime(eb).$asScalar(), ">", after))
		.orderBy("CalendarEvent.id", "desc")
		.limit(1)
		.executeTakeFirst();
}

const SITE_TOTAL_TIMES = {
	USERS: sql<{
		at: number;
	}>`(select coalesce("createdAt", 0) as "at" from "User")`,
	SQ_SETS: sql<{ at: number }>`(select "createdAt" as "at" from "GroupMatch")`,
	TOURNAMENTS: sql<{ at: number }>`(
		select min("CalendarEventDate"."startsAt") as "at"
		from "CalendarEvent"
		inner join "CalendarEventDate" on "CalendarEventDate"."eventId" = "CalendarEvent"."id"
		where "CalendarEvent"."tournamentId" is not null
		group by "CalendarEvent"."id"
	)`,
	ART: sql<{ at: number }>`(select "createdAt" as "at" from "Art")`,
};

export type SiteTotal = keyof typeof SITE_TOTAL_TIMES;

/** Users, SendouQ sets, tournaments or art pieces there were at `before`. */
export async function countSiteTotal({
	total,
	before,
}: {
	total: SiteTotal;
	before: number;
}) {
	const row = await db
		.selectFrom(SITE_TOTAL_TIMES[total].as("Total"))
		.select((eb) => eb.fn.countAll<number>().as("count"))
		.where("Total.at", "<=", before)
		.executeTakeFirstOrThrow();

	return row.count;
}

/** When the nth user, SendouQ set, tournament or art piece was created, 0 if unknown. */
export async function findNthOfSiteTotal({
	total,
	nth,
}: {
	total: SiteTotal;
	nth: number;
}) {
	const row = await db
		.selectFrom(SITE_TOTAL_TIMES[total].as("Total"))
		.select("Total.at")
		.orderBy("Total.at", "asc")
		.limit(1)
		.offset(nth - 1)
		.executeTakeFirst();

	return row?.at ?? null;
}
