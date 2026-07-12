import { sub } from "date-fns";
import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import { databaseTimestampToDate } from "~/utils/dates";
import { logger } from "~/utils/logger";

export interface Fixtures {
	heavyUser: { id: number; identifier: string } | null;
	userCustomUrl: string | null;
	friendCode: string | null;
	twitchUsernames: string[] | null;
	heavyBuildUserId: number | null;
	buildId: number | null;
	heavyWeaponSplId: MainWeaponId | null;
	sq: { userId: number; season: number } | null;
	heavyGroupMatchId: number | null;
	heavyGroupIds: [number, number] | null;
	heavyStageModeCombo: { stageId: StageId; mode: ModeShort } | null;
	heavyTournamentId: number | null;
	heavyTournamentMatchId: number | null;
	tournamentMatchGameResultId: number | null;
	heavyTournamentTeamId: number | null;
	tournamentTeamPair: [number, number] | null;
	tournamentTeamInviteCode: string | null;
	recentTournamentIds: number[] | null;
	parentTournamentId: number | null;
	heavyTeam: { id: number; customUrl: string; memberUserId: number } | null;
	heavyCalendarEventId: number | null;
	resultsEventId: number | null;
	calendarAuthorId: number | null;
	calendarWindow: { startTime: Date; endTime: Date } | null;
	scrimWindow: { startTime: Date; endTime: Date } | null;
	heavyScrimPostId: number | null;
	scrimUserIds: number[] | null;
	heavyOrg: {
		id: number;
		slug: string;
		memberUserId: number;
		seriesSubstring: string;
		eventMonth: number;
		eventYear: number;
		windowStart: number;
		windowEnd: number;
	} | null;
	plusVoting: { month: number; year: number; voterId: number } | null;
	plusSuggestionMonthYear: { month: number; year: number } | null;
	plusTierOneUser: { id: number; plusTier: number } | null;
	heavyFriendPair: { userId: number; otherUserId: number } | null;
	friendRequest: { id: number; receiverId: number } | null;
	heavyBadgeId: number | null;
	badgeOwnerUserId: number | null;
	badgeAuthorId: number | null;
	badgeManagerUserId: number | null;
	manyUserIds: number[] | null;
	notification: { userId: number; type: Tables["Notification"]["type"] } | null;
	heavyAssociation: {
		id: number;
		memberUserId: number;
		inviteCode: string;
	} | null;
	lfgAuthorId: number | null;
	lfgTournament: { tournamentId: number; teamId: number } | null;
	subsTournamentId: number | null;
	auditTournamentId: number | null;
	xrank: {
		userId: number;
		playerId: number;
		mode: ModeShort;
		region: Tables["XRankPlacement"]["region"];
		month: number;
		year: number;
	} | null;
	heavyArtUserId: number | null;
	heavyArtTagId: number | null;
	imageSubmitterId: number | null;
	imageId: number | null;
	vod: { userId: number; videoId: number } | null;
	apiTokenUserId: number | null;
	logInLinkCode: string | null;
	modNoteId: number | null;
}

/**
 * Resolves "worst-case" benchmark arguments by sampling the heaviest rows from
 * the database (user with most tournament results, tournament with most teams
 * and so on). Fields resolve to null when the source table is empty which
 * causes the dependent benchmark cases to be skipped.
 */
export async function resolveFixtures(): Promise<Fixtures> {
	const heavyUser = await resolveHeavyUser();
	const heavyTournamentId = await resolveHeavyTournamentId();
	const heavyGroupMatchId = await resolveHeavyGroupMatchId();
	const heavyScrimPostId = await resolveHeavyScrimPostId();

	const fixtures: Fixtures = {
		heavyUser,
		userCustomUrl: await resolveUserCustomUrl(),
		friendCode: await resolveFriendCode(),
		twitchUsernames: await resolveTwitchUsernames(),
		heavyBuildUserId: await resolveHeavyBuildUserId(),
		buildId: await resolveBuildId(),
		heavyWeaponSplId: await resolveHeavyWeaponSplId(),
		sq: await resolveSq(),
		heavyGroupMatchId,
		heavyGroupIds: await resolveHeavyGroupIds(heavyGroupMatchId),
		heavyStageModeCombo: await resolveHeavyStageModeCombo(),
		heavyTournamentId,
		heavyTournamentMatchId: await resolveHeavyTournamentMatchId(),
		tournamentMatchGameResultId: await resolveTournamentMatchGameResultId(),
		heavyTournamentTeamId:
			await resolveHeavyTournamentTeamId(heavyTournamentId),
		tournamentTeamPair: await resolveTournamentTeamPair(heavyTournamentId),
		tournamentTeamInviteCode:
			await resolveTournamentTeamInviteCode(heavyTournamentId),
		recentTournamentIds: await resolveRecentTournamentIds(),
		parentTournamentId: await resolveParentTournamentId(),
		heavyTeam: await resolveHeavyTeam(),
		heavyCalendarEventId: await resolveHeavyCalendarEventId(),
		resultsEventId: await resolveResultsEventId(),
		calendarAuthorId: await resolveCalendarAuthorId(),
		calendarWindow: await resolveCalendarWindow(),
		scrimWindow: await resolveScrimWindow(),
		heavyScrimPostId,
		scrimUserIds: await resolveScrimUserIds(heavyScrimPostId, heavyUser),
		heavyOrg: await resolveHeavyOrg(),
		plusVoting: await resolvePlusVoting(),
		plusSuggestionMonthYear: await resolvePlusSuggestionMonthYear(),
		plusTierOneUser: await resolvePlusTierOneUser(),
		heavyFriendPair: await resolveHeavyFriendPair(),
		friendRequest: await resolveFriendRequest(),
		heavyBadgeId: await resolveHeavyBadgeId(),
		badgeOwnerUserId: await resolveBadgeOwnerUserId(),
		badgeAuthorId: await resolveBadgeAuthorId(),
		badgeManagerUserId: await resolveBadgeManagerUserId(),
		manyUserIds: await resolveManyUserIds(heavyTournamentId),
		notification: await resolveNotification(),
		heavyAssociation: await resolveHeavyAssociation(),
		lfgAuthorId: await resolveLfgAuthorId(),
		lfgTournament: await resolveLfgTournament(),
		subsTournamentId: (await resolveSubsTournamentId()) ?? heavyTournamentId,
		auditTournamentId: (await resolveAuditTournamentId()) ?? heavyTournamentId,
		xrank: await resolveXRank(),
		heavyArtUserId: await resolveHeavyArtUserId(),
		heavyArtTagId: await resolveHeavyArtTagId(),
		imageSubmitterId: await resolveImageSubmitterId(),
		imageId: await resolveImageId(),
		vod: await resolveVod(),
		apiTokenUserId: await resolveApiTokenUserId(),
		logInLinkCode: await resolveLogInLinkCode(),
		modNoteId: await resolveModNoteId(),
	};

	const nullFixtures = Object.entries(fixtures)
		.filter(([, value]) => value === null)
		.map(([key]) => key);
	if (nullFixtures.length > 0) {
		logger.warn(
			`Fixtures resolved to null (dependent cases skipped): ${nullFixtures.join(", ")}`,
		);
	}

	return fixtures;
}

async function resolveHeavyUser() {
	const row = await db
		.selectFrom("TournamentResult")
		.select(({ fn }) => ["userId", fn.countAll<number>().as("count")])
		.groupBy("userId")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();
	if (row) return { id: row.userId, identifier: String(row.userId) };

	const fallback = await db
		.selectFrom("User")
		.select("id")
		.orderBy("id", "asc")
		.limit(1)
		.executeTakeFirst();
	if (!fallback) return null;

	return { id: fallback.id, identifier: String(fallback.id) };
}

async function resolveUserCustomUrl() {
	const row = await db
		.selectFrom("User")
		.select("customUrl")
		.where("customUrl", "is not", null)
		.orderBy("id", "asc")
		.limit(1)
		.executeTakeFirst();

	return row?.customUrl ?? null;
}

async function resolveFriendCode() {
	const row = await db
		.selectFrom("UserFriendCode")
		.select("friendCode")
		.limit(1)
		.executeTakeFirst();

	return row?.friendCode ?? null;
}

async function resolveTwitchUsernames() {
	const rows = await db
		.selectFrom("User")
		.select("twitch")
		.where("twitch", "is not", null)
		.limit(20)
		.execute();
	const usernames = rows.flatMap((row) => (row.twitch ? [row.twitch] : []));

	return usernames.length > 0 ? usernames : null;
}

async function resolveHeavyBuildUserId() {
	const row = await db
		.selectFrom("Build")
		.select(({ fn }) => ["ownerId", fn.countAll<number>().as("count")])
		.groupBy("ownerId")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();

	return row?.ownerId ?? null;
}

async function resolveBuildId() {
	const row = await db
		.selectFrom("Build")
		.select("id")
		.orderBy("id", "desc")
		.limit(1)
		.executeTakeFirst();

	return row?.id ?? null;
}

async function resolveHeavyWeaponSplId() {
	const row = await db
		.selectFrom("BuildWeapon")
		.select(({ fn }) => [
			"canonicalWeaponSplId",
			fn.countAll<number>().as("count"),
		])
		.groupBy("canonicalWeaponSplId")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();

	return row?.canonicalWeaponSplId ?? null;
}

async function resolveSq() {
	const seasonRow = await db
		.selectFrom("Skill")
		.select(({ fn }) => ["season", fn.countAll<number>().as("count")])
		.groupBy("season")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();
	if (!seasonRow) return null;

	const userRow = await db
		.selectFrom("GroupMember")
		.select(({ fn }) => ["userId", fn.countAll<number>().as("count")])
		.groupBy("userId")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();
	if (!userRow) return null;

	return { userId: userRow.userId, season: seasonRow.season };
}

async function resolveHeavyGroupMatchId() {
	const row = await db
		.selectFrom("GroupMatchMap")
		.select(({ fn }) => ["matchId", fn.countAll<number>().as("count")])
		.groupBy("matchId")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();

	return row?.matchId ?? null;
}

async function resolveHeavyGroupIds(
	heavyGroupMatchId: number | null,
): Promise<[number, number] | null> {
	if (heavyGroupMatchId === null) return null;

	const row = await db
		.selectFrom("GroupMatch")
		.select(["alphaGroupId", "bravoGroupId"])
		.where("id", "=", heavyGroupMatchId)
		.executeTakeFirst();
	if (!row) return null;

	return [row.alphaGroupId, row.bravoGroupId];
}

async function resolveHeavyStageModeCombo() {
	const row = await db
		.selectFrom("GroupMatchMap")
		.select(({ fn }) => ["stageId", "mode", fn.countAll<number>().as("count")])
		.groupBy(["stageId", "mode"])
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();
	if (!row) return null;

	return { stageId: row.stageId, mode: row.mode };
}

async function resolveHeavyTournamentId() {
	const row = await db
		.selectFrom("TournamentTeam")
		.select(({ fn }) => ["tournamentId", fn.countAll<number>().as("count")])
		.groupBy("tournamentId")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();

	return row?.tournamentId ?? null;
}

async function resolveHeavyTournamentMatchId() {
	const row = await db
		.selectFrom("TournamentMatchGameResult")
		.select(({ fn }) => ["matchId", fn.countAll<number>().as("count")])
		.groupBy("matchId")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();

	return row?.matchId ?? null;
}

async function resolveTournamentMatchGameResultId() {
	const row = await db
		.selectFrom("TournamentMatchGameResult")
		.select("id")
		.orderBy("id", "desc")
		.limit(1)
		.executeTakeFirst();

	return row?.id ?? null;
}

async function resolveHeavyTournamentTeamId(heavyTournamentId: number | null) {
	if (heavyTournamentId === null) return null;

	const row = await db
		.selectFrom("TournamentTeamMember")
		.innerJoin(
			"TournamentTeam",
			"TournamentTeam.id",
			"TournamentTeamMember.tournamentTeamId",
		)
		.select(({ fn }) => [
			"TournamentTeamMember.tournamentTeamId",
			fn.countAll<number>().as("count"),
		])
		.where("TournamentTeam.tournamentId", "=", heavyTournamentId)
		.groupBy("TournamentTeamMember.tournamentTeamId")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();

	return row?.tournamentTeamId ?? null;
}

async function resolveTournamentTeamPair(
	heavyTournamentId: number | null,
): Promise<[number, number] | null> {
	if (heavyTournamentId === null) return null;

	const rows = await db
		.selectFrom("TournamentTeam")
		.select("id")
		.where("tournamentId", "=", heavyTournamentId)
		.orderBy("id", "asc")
		.limit(2)
		.execute();
	if (rows.length < 2) return null;

	return [rows[0].id, rows[1].id];
}

async function resolveTournamentTeamInviteCode(
	heavyTournamentId: number | null,
) {
	if (heavyTournamentId === null) return null;

	const row = await db
		.selectFrom("TournamentTeam")
		.select("inviteCode")
		.where("tournamentId", "=", heavyTournamentId)
		.limit(1)
		.executeTakeFirst();

	return row?.inviteCode ?? null;
}

async function resolveRecentTournamentIds() {
	const rows = await db
		.selectFrom("TournamentTeam")
		.select(({ fn }) => ["tournamentId", fn.countAll<number>().as("count")])
		.groupBy("tournamentId")
		.orderBy("count", "desc")
		.limit(10)
		.execute();

	return rows.length > 0 ? rows.map((row) => row.tournamentId) : null;
}

async function resolveParentTournamentId() {
	const row = await db
		.selectFrom("Tournament")
		.select(({ fn }) => [
			"parentTournamentId",
			fn.countAll<number>().as("count"),
		])
		.where("parentTournamentId", "is not", null)
		.groupBy("parentTournamentId")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();

	return row?.parentTournamentId ?? null;
}

async function resolveHeavyTeam() {
	const row = await db
		.selectFrom("TeamMemberWithSecondary")
		.innerJoin("Team", "Team.id", "TeamMemberWithSecondary.teamId")
		.select(({ fn }) => [
			"Team.id",
			"Team.customUrl",
			fn.countAll<number>().as("count"),
		])
		.groupBy("Team.id")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();
	if (!row) return null;

	const member = await db
		.selectFrom("TeamMemberWithSecondary")
		.select("userId")
		.where("teamId", "=", row.id)
		.limit(1)
		.executeTakeFirst();
	if (!member) return null;

	return { id: row.id, customUrl: row.customUrl, memberUserId: member.userId };
}

async function resolveHeavyCalendarEventId() {
	const row = await db
		.selectFrom("CalendarEventDate")
		.select(({ fn }) => ["eventId", fn.countAll<number>().as("count")])
		.groupBy("eventId")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();

	return row?.eventId ?? null;
}

async function resolveResultsEventId() {
	const row = await db
		.selectFrom("CalendarEventResultTeam")
		.select(({ fn }) => ["eventId", fn.countAll<number>().as("count")])
		.groupBy("eventId")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();

	return row?.eventId ?? null;
}

async function resolveCalendarAuthorId() {
	const row = await db
		.selectFrom("CalendarEvent")
		.select(({ fn }) => ["authorId", fn.countAll<number>().as("count")])
		.groupBy("authorId")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();

	return row?.authorId ?? null;
}

async function resolveCalendarWindow() {
	const row = await db
		.selectFrom("CalendarEventDate")
		.select(({ fn }) => fn.max("startTime").as("maxStartTime"))
		.executeTakeFirst();
	if (typeof row?.maxStartTime !== "number") return null;

	const endTime = databaseTimestampToDate(row.maxStartTime);

	return { startTime: sub(endTime, { days: 7 }), endTime };
}

async function resolveScrimWindow() {
	const row = await db
		.selectFrom("ScrimPost")
		.select(({ fn }) => fn.max("at").as("maxAt"))
		.executeTakeFirst();
	if (typeof row?.maxAt !== "number") return null;

	const endTime = databaseTimestampToDate(row.maxAt);

	return { startTime: sub(endTime, { days: 14 }), endTime };
}

async function resolveHeavyScrimPostId() {
	const row = await db
		.selectFrom("ScrimPostRequest")
		.select(({ fn }) => ["scrimPostId", fn.countAll<number>().as("count")])
		.groupBy("scrimPostId")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();
	if (row) return row.scrimPostId;

	const fallback = await db
		.selectFrom("ScrimPost")
		.select("id")
		.orderBy("id", "desc")
		.limit(1)
		.executeTakeFirst();

	return fallback?.id ?? null;
}

async function resolveScrimUserIds(
	heavyScrimPostId: number | null,
	heavyUser: { id: number } | null,
) {
	if (heavyScrimPostId !== null) {
		const rows = await db
			.selectFrom("ScrimPostUser")
			.select("userId")
			.where("scrimPostId", "=", heavyScrimPostId)
			.execute();
		if (rows.length > 0) return rows.map((row) => row.userId);
	}

	return heavyUser ? [heavyUser.id] : null;
}

async function resolveHeavyOrg() {
	const orgRow = await db
		.selectFrom("CalendarEvent")
		.innerJoin(
			"TournamentOrganization",
			"TournamentOrganization.id",
			"CalendarEvent.organizationId",
		)
		.select(({ fn }) => [
			"TournamentOrganization.id",
			"TournamentOrganization.slug",
			fn.countAll<number>().as("count"),
		])
		.groupBy("TournamentOrganization.id")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();
	if (!orgRow) return null;

	const member = await db
		.selectFrom("TournamentOrganizationMember")
		.select("userId")
		.where("organizationId", "=", orgRow.id)
		.limit(1)
		.executeTakeFirst();
	if (!member) return null;

	const latestEvent = await db
		.selectFrom("CalendarEvent")
		.innerJoin(
			"CalendarEventDate",
			"CalendarEventDate.eventId",
			"CalendarEvent.id",
		)
		.select(["CalendarEvent.name", "CalendarEventDate.startTime"])
		.where("CalendarEvent.organizationId", "=", orgRow.id)
		.orderBy("CalendarEventDate.startTime", "desc")
		.limit(1)
		.executeTakeFirst();
	if (!latestEvent) return null;

	const latestEventDate = databaseTimestampToDate(latestEvent.startTime);
	const windowStart = latestEvent.startTime - 90 * 24 * 60 * 60;

	return {
		id: orgRow.id,
		slug: orgRow.slug,
		memberUserId: member.userId,
		seriesSubstring: latestEvent.name.slice(0, 10),
		eventMonth: latestEventDate.getUTCMonth(),
		eventYear: latestEventDate.getUTCFullYear(),
		windowStart,
		windowEnd: latestEvent.startTime,
	};
}

async function resolvePlusVoting() {
	const row = await db
		.selectFrom("PlusVote")
		.select(["month", "year", "authorId"])
		.orderBy("year", "desc")
		.orderBy("month", "desc")
		.limit(1)
		.executeTakeFirst();
	if (!row) return null;

	return { month: row.month, year: row.year, voterId: row.authorId };
}

async function resolvePlusSuggestionMonthYear() {
	const row = await db
		.selectFrom("PlusSuggestion")
		.select(["month", "year"])
		.orderBy("year", "desc")
		.orderBy("month", "desc")
		.limit(1)
		.executeTakeFirst();
	if (!row) return null;

	return { month: row.month, year: row.year };
}

async function resolvePlusTierOneUser() {
	const row = await db
		.selectFrom("PlusTier")
		.select("userId")
		.where("tier", "=", 1)
		.limit(1)
		.executeTakeFirst();
	if (!row) return null;

	return { id: row.userId, plusTier: 1 };
}

async function resolveHeavyFriendPair() {
	const row = await db
		.selectFrom("Friendship")
		.select(({ fn }) => ["userOneId", fn.countAll<number>().as("count")])
		.groupBy("userOneId")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();
	if (!row) return null;

	const counterpart = await db
		.selectFrom("Friendship")
		.select("userTwoId")
		.where("userOneId", "=", row.userOneId)
		.limit(1)
		.executeTakeFirst();
	if (!counterpart) return null;

	return { userId: row.userOneId, otherUserId: counterpart.userTwoId };
}

async function resolveFriendRequest() {
	const row = await db
		.selectFrom("FriendRequest")
		.select(["id", "receiverId"])
		.limit(1)
		.executeTakeFirst();

	return row ?? null;
}

async function resolveHeavyBadgeId() {
	const row = await db
		.selectFrom("BadgeOwner")
		.select(({ fn }) => ["badgeId", fn.countAll<number>().as("count")])
		.groupBy("badgeId")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();

	return row?.badgeId ?? null;
}

async function resolveBadgeOwnerUserId() {
	const row = await db
		.selectFrom("BadgeOwner")
		.select(({ fn }) => ["userId", fn.countAll<number>().as("count")])
		.groupBy("userId")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();

	return row?.userId ?? null;
}

async function resolveBadgeAuthorId() {
	const row = await db
		.selectFrom("Badge")
		.select("authorId")
		.where("authorId", "is not", null)
		.limit(1)
		.executeTakeFirst();

	return row?.authorId ?? null;
}

async function resolveBadgeManagerUserId() {
	const row = await db
		.selectFrom("BadgeManager")
		.select(({ fn }) => ["userId", fn.countAll<number>().as("count")])
		.groupBy("userId")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();

	return row?.userId ?? null;
}

async function resolveManyUserIds(heavyTournamentId: number | null) {
	if (heavyTournamentId !== null) {
		const rows = await db
			.selectFrom("TournamentTeamMember")
			.innerJoin(
				"TournamentTeam",
				"TournamentTeam.id",
				"TournamentTeamMember.tournamentTeamId",
			)
			.select("TournamentTeamMember.userId")
			.where("TournamentTeam.tournamentId", "=", heavyTournamentId)
			.limit(25)
			.execute();
		if (rows.length > 0) return rows.map((row) => row.userId);
	}

	const fallback = await db
		.selectFrom("User")
		.select("id")
		.orderBy("id", "asc")
		.limit(25)
		.execute();

	return fallback.length > 0 ? fallback.map((row) => row.id) : null;
}

async function resolveNotification() {
	const userRow = await db
		.selectFrom("NotificationUser")
		.select(({ fn }) => ["userId", fn.countAll<number>().as("count")])
		.groupBy("userId")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();
	if (!userRow) return null;

	const typeRow = await db
		.selectFrom("Notification")
		.select(({ fn }) => ["type", fn.countAll<number>().as("count")])
		.groupBy("type")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();
	if (!typeRow) return null;

	return { userId: userRow.userId, type: typeRow.type };
}

async function resolveHeavyAssociation() {
	const row = await db
		.selectFrom("AssociationMember")
		.innerJoin(
			"Association",
			"Association.id",
			"AssociationMember.associationId",
		)
		.select(({ fn }) => [
			"Association.id",
			"Association.inviteCode",
			fn.countAll<number>().as("count"),
		])
		.groupBy("Association.id")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();
	if (!row) return null;

	const member = await db
		.selectFrom("AssociationMember")
		.select("userId")
		.where("associationId", "=", row.id)
		.limit(1)
		.executeTakeFirst();
	if (!member) return null;

	return {
		id: row.id,
		memberUserId: member.userId,
		inviteCode: row.inviteCode,
	};
}

async function resolveLfgAuthorId() {
	const row = await db
		.selectFrom("LFGPost")
		.select(({ fn }) => ["authorId", fn.countAll<number>().as("count")])
		.groupBy("authorId")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();

	return row?.authorId ?? null;
}

async function resolveLfgTournament() {
	const row = await db
		.selectFrom("TournamentTeam")
		.select(["tournamentId", "id"])
		.where("isLooking", "=", 1)
		.orderBy("id", "desc")
		.limit(1)
		.executeTakeFirst();
	if (!row) return null;

	return { tournamentId: row.tournamentId, teamId: row.id };
}

async function resolveSubsTournamentId() {
	const row = await db
		.selectFrom("TournamentSub")
		.select(({ fn }) => ["tournamentId", fn.countAll<number>().as("count")])
		.groupBy("tournamentId")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();

	return row?.tournamentId ?? null;
}

async function resolveAuditTournamentId() {
	const row = await db
		.selectFrom("TournamentAuditLog")
		.select(({ fn }) => ["tournamentId", fn.countAll<number>().as("count")])
		.groupBy("tournamentId")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();

	return row?.tournamentId ?? null;
}

async function resolveXRank() {
	const playerRow = await db
		.selectFrom("XRankPlacement")
		.innerJoin("SplatoonPlayer", "SplatoonPlayer.id", "XRankPlacement.playerId")
		.select(({ fn }) => [
			"XRankPlacement.playerId",
			"SplatoonPlayer.userId",
			fn.countAll<number>().as("count"),
		])
		.where("SplatoonPlayer.userId", "is not", null)
		.groupBy("XRankPlacement.playerId")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();
	if (!playerRow || playerRow.userId === null) return null;

	const monthRow = await db
		.selectFrom("XRankPlacement")
		.select(({ fn }) => [
			"mode",
			"region",
			"month",
			"year",
			fn.countAll<number>().as("count"),
		])
		.groupBy(["mode", "region", "month", "year"])
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();
	if (!monthRow) return null;

	return {
		userId: playerRow.userId,
		playerId: playerRow.playerId,
		mode: monthRow.mode,
		region: monthRow.region,
		month: monthRow.month,
		year: monthRow.year,
	};
}

async function resolveHeavyArtUserId() {
	const row = await db
		.selectFrom("Art")
		.select(({ fn }) => ["authorId", fn.countAll<number>().as("count")])
		.groupBy("authorId")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();

	return row?.authorId ?? null;
}

async function resolveHeavyArtTagId() {
	const row = await db
		.selectFrom("TaggedArt")
		.select(({ fn }) => ["tagId", fn.countAll<number>().as("count")])
		.groupBy("tagId")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();

	return row?.tagId ?? null;
}

async function resolveImageSubmitterId() {
	const row = await db
		.selectFrom("UnvalidatedUserSubmittedImage")
		.select(({ fn }) => ["submitterUserId", fn.countAll<number>().as("count")])
		.groupBy("submitterUserId")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();

	return row?.submitterUserId ?? null;
}

async function resolveImageId() {
	const row = await db
		.selectFrom("UnvalidatedUserSubmittedImage")
		.select("id")
		.orderBy("id", "desc")
		.limit(1)
		.executeTakeFirst();

	return row?.id ?? null;
}

async function resolveVod() {
	const videoRow = await db
		.selectFrom("VideoMatch")
		.select(({ fn }) => ["videoId", fn.countAll<number>().as("count")])
		.groupBy("videoId")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();
	if (!videoRow) return null;

	const playerRow = await db
		.selectFrom("VideoMatchPlayer")
		.select("playerUserId")
		.where("playerUserId", "is not", null)
		.limit(1)
		.executeTakeFirst();

	const submitterRow = await db
		.selectFrom("Video")
		.select("submitterUserId")
		.where("id", "=", videoRow.videoId)
		.executeTakeFirst();

	const userId = playerRow?.playerUserId ?? submitterRow?.submitterUserId;
	if (typeof userId !== "number") return null;

	return { userId, videoId: videoRow.videoId };
}

async function resolveApiTokenUserId() {
	const row = await db
		.selectFrom("ApiToken")
		.select("userId")
		.limit(1)
		.executeTakeFirst();

	return row?.userId ?? null;
}

async function resolveLogInLinkCode() {
	const row = await db
		.selectFrom("LogInLink")
		.select("code")
		.limit(1)
		.executeTakeFirst();

	return row?.code ?? null;
}

async function resolveModNoteId() {
	const row = await db
		.selectFrom("ModNote")
		.select("id")
		.orderBy("id", "desc")
		.limit(1)
		.executeTakeFirst();

	return row?.id ?? null;
}
