import type { ExpressionBuilder, NotNull, SqlBool } from "kysely";
import { sql } from "kysely";
import * as R from "remeda";
import { db } from "~/db/sql";
import type { DB, Tables, TablesInsertable } from "~/db/tables";
import type { CustomTheme, UserPreferences } from "~/db/tables-json";
import { actorId } from "~/features/auth/core/user.server";
import {
	BEST_TIER_NUMBER,
	type TournamentTierNumber,
	WORST_TIER_NUMBER,
} from "~/features/tournament/core/tiering";
import type {
	BuildSort,
	ResultSource,
} from "~/features/user-page/user-page-constants";
import { userRoles } from "~/modules/permissions/mapper.server";
import { isSupporter } from "~/modules/permissions/utils";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import invariant from "~/utils/invariant";
import {
	asJson,
	commonUserSelect,
	concatUserSubmittedImagePrefix,
	customAvatarUrl,
	jsonArrayFrom,
	tournamentLogoOrNull,
	userByIdentifierQuery,
	userChatNameHue,
	userProfileWeapons,
} from "~/utils/kysely.server";
import { logger } from "~/utils/logger";
import { bskyUrl, twitchUrl, youtubeUrl } from "~/utils/urls";
import type { ChatUser } from "../chat/chat-types";
import { sortBadgesByFavorites } from "./core/badge-sorting.server";
import { findWidgetById } from "./core/widgets/portfolio";
import { WIDGET_LOADERS } from "./core/widgets/portfolio-loaders.server";
import type { LoadedWidget } from "./core/widgets/types";
import { SPL2_JOIN_ORDER_CUTOFF } from "./user-page-constants";

export function findIdByIdentifier(identifier: string) {
	return userByIdentifierQuery(identifier).executeTakeFirst();
}

/** Country codes of the given users keyed by user id, users without a country set absent. */
export async function findCountriesByUserIds(userIds: number[]) {
	if (userIds.length === 0) return new Map<number, string>();

	const rows = await db
		.selectFrom("User")
		.select(["User.id", "User.country"])
		.where("User.id", "in", userIds)
		.where("User.country", "is not", null)
		.$narrowType<{ country: NotNull }>()
		.execute();

	return new Map(rows.map((row) => [row.id, row.country]));
}

/** Plus tiers of the given users keyed by user id, users without a tier absent. */
export async function findPlusTiersByUserIds(userIds: number[]) {
	if (userIds.length === 0) return new Map<number, number>();

	const rows = await db
		.selectFrom("PlusTier")
		.select(["PlusTier.userId", "PlusTier.tier"])
		.where("PlusTier.userId", "in", userIds)
		.execute();

	return new Map(rows.map((row) => [row.userId, row.tier]));
}

export async function findBuildFieldsByIdentifier(identifier: string) {
	const row = await userByIdentifierQuery(identifier)
		.select(({ eb }) => [
			"User.buildSorting",
			jsonArrayFrom(
				eb
					.selectFrom("UserWeapon")
					.select("UserWeapon.weaponSplId")
					.whereRef("UserWeapon.userId", "=", "User.id")
					.orderBy("UserWeapon.order", "asc"),
			).as("weapons"),
		])
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return {
		...row,
		weapons: row.weapons.map((row) => row.weaponSplId),
	};
}

export function findLayoutDataByIdentifier(
	identifier: string,
	loggedInUserId?: number,
) {
	return userByIdentifierQuery(identifier)
		.leftJoin("PlusTier", "PlusTier.userId", "User.id")
		.select((eb) => [
			...commonUserSelect(eb),
			"User.pronouns",
			"User.country",
			"User.inGameName",
			"PlusTier.tier as plusTier",
			"User.commissionText",
			"User.commissionsOpen",
			asJson(
				sql<CustomTheme | null>`IIF(COALESCE("User"."patronTier", 0) >= 2, "User"."customTheme", null)`,
			).as("customTheme"),
			eb
				.selectFrom("TournamentResult")
				.whereRef("TournamentResult.userId", "=", "User.id")
				.select(({ fn }) => fn.countAll<number>().as("count"))
				.as("tournamentResultsCount"),
			eb
				.selectFrom("CalendarEventResultPlayer")
				.whereRef("CalendarEventResultPlayer.userId", "=", "User.id")
				.select(({ fn }) => fn.countAll<number>().as("count"))
				.as("calendarEventResultsCount"),
			eb
				.selectFrom("Build")
				.select(({ fn }) => fn.countAll<number>().as("count"))
				.whereRef("Build.ownerId", "=", "User.id")
				.where((eb) =>
					eb.or(
						[
							eb("Build.isPrivate", "=", 0),
							loggedInUserId ? eb("Build.ownerId", "=", loggedInUserId) : null,
						].filter((filter) => filter !== null),
					),
				)
				.as("buildsCount"),
			eb
				.selectFrom("VideoMatchPlayer")
				.innerJoin(
					"VideoMatch",
					"VideoMatch.id",
					"VideoMatchPlayer.videoMatchId",
				)
				.select(({ fn }) =>
					fn.count<number>("VideoMatch.videoId").distinct().as("count"),
				)
				.whereRef("VideoMatchPlayer.playerUserId", "=", "User.id")
				.as("vodsCount"),
			// authored and tagged art counted via an indexed union: an OR spanning
			// Art and ArtUserMetadata would make SQLite scan the whole Art table
			eb
				.selectFrom("Art")
				.innerJoin("UserSubmittedImage", "UserSubmittedImage.id", "Art.imgId")
				.select(({ fn }) => fn.countAll<number>().as("count"))
				.where("Art.id", "in", (innerEb) =>
					innerEb
						.selectFrom("Art")
						.select("Art.id")
						.whereRef("Art.authorId", "=", "User.id")
						.union(
							innerEb
								.selectFrom("ArtUserMetadata")
								.select("ArtUserMetadata.artId as id")
								.whereRef("ArtUserMetadata.userId", "=", "User.id"),
						),
				)
				.as("artCount"),
		])
		.$narrowType<{
			calendarEventResultsCount: NotNull;
			tournamentResultsCount: NotNull;
			buildsCount: NotNull;
			vodsCount: NotNull;
			artCount: NotNull;
		}>()
		.executeTakeFirst();
}

export async function findProfileByIdentifier(
	identifier: string,
	forceShowDiscordUniqueName?: boolean,
) {
	const row = await userByIdentifierQuery(identifier)
		.leftJoin("PlusTier", "PlusTier.userId", "User.id")
		.select(({ eb }) => [
			"User.twitch",
			"User.youtubeId",
			"User.battlefy",
			"User.bsky",
			"User.country",
			"User.bio",
			"User.motionSens",
			"User.stickSens",
			"User.inGameName",
			"User.customName",
			"User.discordName",
			"User.showDiscordUniqueName",
			"User.discordUniqueName",
			"User.favoriteBadgeIds",
			"User.favoriteTrophyIds",
			"User.hiddenTrophyIds",
			"User.patronTier",
			"PlusTier.tier as plusTier",
			"User.pronouns",
			"User.customAvatarImgId",
			customAvatarUrl(eb).as("customAvatarUrl"),
			userProfileWeapons(eb).as("weapons"),
			jsonArrayFrom(
				eb
					.selectFrom("TeamMemberWithSecondary")
					.innerJoin("Team", "Team.id", "TeamMemberWithSecondary.teamId")
					.leftJoin(
						"UserSubmittedImage",
						"UserSubmittedImage.id",
						"Team.avatarImgId",
					)
					.select((eb) => [
						"Team.name",
						"Team.customUrl",
						"Team.id",
						"TeamMemberWithSecondary.isMainTeam",
						"TeamMemberWithSecondary.role as userTeamRole",
						"TeamMemberWithSecondary.customRole as userTeamCustomRole",
						concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
							"avatarUrl",
						),
					])
					.whereRef("TeamMemberWithSecondary.userId", "=", "User.id"),
			).as("teams"),
			jsonArrayFrom(
				eb
					.selectFrom("SplatoonPlayer")
					.innerJoin(
						"XRankPlacement",
						"XRankPlacement.playerId",
						"SplatoonPlayer.id",
					)
					.select(({ fn }) => [
						"XRankPlacement.mode",
						fn.max<number>("XRankPlacement.power").as("power"),
						fn.min<number>("XRankPlacement.rank").as("rank"),
						"XRankPlacement.playerId",
					])
					.whereRef("SplatoonPlayer.userId", "=", "User.id")
					.groupBy(["XRankPlacement.mode"]),
			).as("topPlacements"),
		])
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	// queried separately with a constant userId instead of correlating to
	// "User"."id" so that SQLite can push the predicate down into both arms
	// of the BadgeOwner view
	const badges = await findOwnedBadgesByUserId(row.id);

	return {
		...row,
		team: row.teams.find((t) => t.isMainTeam),
		secondaryTeams: row.teams.filter((t) => !t.isMainTeam),
		teams: undefined,
		...sortBadgesByFavorites({ ...row, badges }),
		discordUniqueName:
			forceShowDiscordUniqueName || row.showDiscordUniqueName
				? row.discordUniqueName
				: null,
	};
}

/**
 * Badges owned by the user (tournament wins + patreon supporter badges).
 *
 * Kept as its own query taking a constant userId on purpose: correlating
 * to an outer "User"."id" would prevent SQLite from pushing the predicate
 * down into both arms of the BadgeOwner view, materializing the full view.
 */
export function findOwnedBadgesByUserId(userId: number) {
	return db
		.selectFrom("BadgeOwner")
		.innerJoin("Badge", "Badge.id", "BadgeOwner.badgeId")
		.select(({ fn }) => [
			fn.sum<number>("BadgeOwner.count").as("count"),
			"Badge.id",
			"Badge.displayName",
			"Badge.code",
			"Badge.hue",
		])
		.where("BadgeOwner.userId", "=", userId)
		.groupBy("BadgeOwner.badgeId")
		.execute();
}

export async function findEnabledWidgetsByIdentifier(identifier: string) {
	const row = await userByIdentifierQuery(identifier)
		.select(["User.preferences", "User.patronTier"])
		.executeTakeFirst();

	if (!row) return false;
	if (!isSupporter(row)) return false;

	return row?.preferences?.newProfileEnabled === true;
}

export async function findPreferencesByUserId(userId: number) {
	const row = await db
		.selectFrom("User")
		.select("User.preferences")
		.where("User.id", "=", userId)
		.executeTakeFirst();

	return row?.preferences ?? null;
}

export async function upsertWidgets(
	userId: number,
	widgets: Array<Tables["UserWidget"]["widget"]>,
) {
	return db.transaction().execute(async (trx) => {
		await trx.deleteFrom("UserWidget").where("userId", "=", userId).execute();

		await trx
			.insertInto("UserWidget")
			.values(
				widgets.map((widget, index) => ({
					userId,
					index,
					widget: JSON.stringify(widget),
				})),
			)
			.execute();
	});
}

export async function findStoredWidgetsByUserId(
	userId: number,
): Promise<Array<Tables["UserWidget"]["widget"]>> {
	const rows = await db
		.selectFrom("UserWidget")
		.select(["widget"])
		.where("userId", "=", userId)
		.orderBy("index", "asc")
		.execute();

	return rows.map((row) => row.widget);
}

export async function findWidgetsByUserId(
	identifier: string,
): Promise<LoadedWidget[] | null> {
	const user = await findIdByIdentifier(identifier);

	if (!user) return null;

	const widgets = await db
		.selectFrom("UserWidget")
		.select(["widget"])
		.where("userId", "=", user.id)
		.orderBy("index", "asc")
		.execute();

	const loadedWidgets = await Promise.all(
		widgets.map(async ({ widget }) => {
			const definition = findWidgetById(widget.id);

			if (!definition) {
				logger.warn(
					`Unknown widget id found for user ${user.id}: ${widget.id}`,
				);
				return null;
			}

			const loader = WIDGET_LOADERS[widget.id as keyof typeof WIDGET_LOADERS];
			const data = loader
				? await loader(user.id, widget.settings as any)
				: widget.settings;

			return {
				id: widget.id,
				data,
				settings: widget.settings,
				slot: definition.slot,
			} as LoadedWidget;
		}),
	);

	return loadedWidgets.filter((w) => w !== null);
}

export function findByCustomUrl(customUrl: string) {
	return db
		.selectFrom("User")
		.select(["User.id", "User.discordId", "User.customUrl", "User.patronTier"])
		.where("customUrl", "=", customUrl)
		.executeTakeFirst();
}

export function findByFriendCode(friendCode: string) {
	return db
		.selectFrom("UserFriendCode")
		.innerJoin("User", "User.id", "UserFriendCode.userId")
		.select((eb) => commonUserSelect(eb))
		.where("UserFriendCode.friendCode", "=", friendCode)
		.execute();
}

export async function findUsernameById(id: number) {
	const user = await db
		.selectFrom("User")
		.select("User.username")
		.where("User.id", "=", id)
		.executeTakeFirst();

	return user?.username ?? null;
}

export async function findLeanById(id: number) {
	const user = await db
		.selectFrom("User")
		.leftJoin("PlusTier", "PlusTier.userId", "User.id")
		.where("User.id", "=", id)
		.select(({ eb }) => [
			...commonUserSelect(eb),
			"User.createdAt",
			"User.customTheme",
			"User.isArtist",
			"User.isVideoAdder",
			"User.isTournamentOrganizer",
			"User.isApiAccesser",
			"User.patronTier",
			"User.languages",
			"User.inGameName",
			"User.preferences",
			"PlusTier.tier as plusTier",
			eb
				.selectFrom("UserFriendCode")
				.select("UserFriendCode.friendCode")
				.where("UserFriendCode.userId", "=", id)
				.orderBy("UserFriendCode.createdAt", "desc")
				.limit(1)
				.as("friendCode"),
		])
		.executeTakeFirst();

	if (!user) return;

	return {
		...R.omit(user, [
			"isArtist",
			"isVideoAdder",
			"isTournamentOrganizer",
			"isApiAccesser",
		]),
		roles: userRoles(user),
	};
}

export function findModInfoById(id: number) {
	return db
		.selectFrom("User")
		.select((eb) => [
			"User.discordUniqueName",
			"User.isVideoAdder",
			"User.isArtist",
			"User.isTournamentOrganizer",
			"User.plusSkippedForSeasonNth",
			"User.createdAt",
			jsonArrayFrom(
				eb
					.selectFrom("ModNote")
					.innerJoin("User", "User.id", "ModNote.authorId")
					.select((eb) => [
						"ModNote.id as noteId",
						"ModNote.text",
						"ModNote.createdAt",
						...commonUserSelect(eb),
					])
					.where("ModNote.isDeleted", "=", 0)
					.where("ModNote.userId", "=", id)
					.orderBy("ModNote.createdAt", "desc"),
			).as("modNotes"),
			jsonArrayFrom(
				eb
					.selectFrom("BanLog")
					.innerJoin("User", "User.id", "BanLog.bannedByUserId")
					.select((eb) => [
						"BanLog.banned",
						"BanLog.bannedReason",
						"BanLog.createdAt",
						...commonUserSelect(eb),
					])
					.where("BanLog.userId", "=", id)
					.orderBy("BanLog.createdAt", "desc"),
			).as("banLogs"),
		])
		.where("User.id", "=", id)
		.executeTakeFirst();
}

export function findAllPatrons() {
	return db
		.selectFrom("User")
		.select(["User.id", "User.discordId", "User.username", "User.patronTier"])
		.where("User.patronTier", "is not", null)
		.orderBy("User.patronTier", "desc")
		.orderBy("User.patronStartedAt", "asc")
		.execute();
}

export function findAllPlusServerMembers() {
	return db
		.selectFrom("User")
		.innerJoin("PlusTier", "PlusTier.userId", "User.id")
		.select([
			"User.id as userId",
			"User.discordId",
			"PlusTier.tier as plusTier",
		])
		.execute();
}

export async function existingUserIds(userIds: Array<number>) {
	if (userIds.length === 0) return [];

	const rows = await db
		.selectFrom("User")
		.select("User.id")
		.where("User.id", "in", userIds)
		.execute();

	return rows.map((row) => row.id);
}

export async function findChatUsersByUserIds(userIds: number[]) {
	const users = await db
		.selectFrom("User")
		.select((eb) => [...commonUserSelect(eb), "User.pronouns", userChatNameHue])
		.where("User.id", "in", userIds)
		.execute();

	const result: Record<number, ChatUser> = {};

	for (const user of users) {
		result[user.id] = user;
	}

	return result;
}

export interface ResultsFilters {
	showHighlightsOnly?: boolean;
	tournamentName?: string;
	teamName?: string;
	mateUserId?: number;
	minTier?: TournamentTierNumber;
	maxTier?: TournamentTierNumber;
	maxPlacement?: number;
	fromYear?: number;
	toYear?: number;
	source?: ResultSource;
	minParticipantCount?: number;
}

const withMaxEventStartTime = (eb: ExpressionBuilder<DB, "CalendarEvent">) =>
	eb
		.selectFrom("CalendarEventDate")
		.select(({ fn }) => [fn.max("CalendarEventDate.startsAt").as("startsAt")])
		.whereRef("CalendarEventDate.eventId", "=", "CalendarEvent.id")
		.as("startsAt");

const maxEventStartTimeExpr = sql<number>`(select max(${sql.ref("CalendarEventDate.startsAt")}) from ${sql.table("CalendarEventDate")} where ${sql.ref("CalendarEventDate.eventId")} = ${sql.ref("CalendarEvent.id")})`;

const maxEventStartTimeAtLeastExpr = (year: number) =>
	sql<boolean>`${maxEventStartTimeExpr} >= ${yearStartsAt(year)}`;

const maxEventStartTimeAtMostExpr = (year: number) =>
	sql<boolean>`${maxEventStartTimeExpr} <= ${yearEndsAt(year)}`;

const NEVER_MATCHES = sql<boolean>`0`;

const isTierFiltered = ({
	minTier = BEST_TIER_NUMBER,
	maxTier = WORST_TIER_NUMBER,
}: ResultsFilters) =>
	minTier !== BEST_TIER_NUMBER || maxTier !== WORST_TIER_NUMBER;

/** Results reported on a calendar event have no tier, so filtering by tier excludes them. */
const includesCalendarEventResults = (filters: ResultsFilters) =>
	filters.source !== "SENDOU" && !isTierFiltered(filters);

const includesTournamentResults = (filters: ResultsFilters) =>
	filters.source !== "EXTERNAL";

const yearStartsAt = (year: number) =>
	dateToDatabaseTimestamp(new Date(Date.UTC(year, 0, 1)));

const yearEndsAt = (year: number) =>
	dateToDatabaseTimestamp(new Date(Date.UTC(year + 1, 0, 1))) - 1;

const baseCalendarEventResultsQuery = (
	userId: number,
	filters: ResultsFilters,
) => {
	let query = db
		.selectFrom("CalendarEventResultPlayer")
		.innerJoin(
			"CalendarEventResultTeam",
			"CalendarEventResultTeam.id",
			"CalendarEventResultPlayer.teamId",
		)
		.innerJoin(
			"CalendarEvent",
			"CalendarEvent.id",
			"CalendarEventResultTeam.eventId",
		)
		.leftJoin("UserResultHighlight", (join) =>
			join
				.onRef("UserResultHighlight.teamId", "=", "CalendarEventResultTeam.id")
				.on("UserResultHighlight.userId", "=", userId),
		)
		.where("CalendarEventResultPlayer.userId", "=", userId);

	if (!includesCalendarEventResults(filters)) {
		return query.where(NEVER_MATCHES);
	}

	if (filters.showHighlightsOnly) {
		query = query.where("UserResultHighlight.userId", "is not", null);
	}

	if (filters.tournamentName) {
		query = query.where(
			nameLikeExpr("CalendarEvent.name", filters.tournamentName),
		);
	}

	if (filters.teamName) {
		query = query.where(
			nameLikeExpr("CalendarEventResultTeam.name", filters.teamName),
		);
	}

	if (filters.mateUserId) {
		const mateUserId = filters.mateUserId;
		query = query.where((eb) =>
			eb.exists(
				eb
					.selectFrom("CalendarEventResultPlayer as MatePlayer")
					.select("MatePlayer.userId")
					.whereRef("MatePlayer.teamId", "=", "CalendarEventResultTeam.id")
					.where("MatePlayer.userId", "=", mateUserId),
			),
		);
	}

	if (filters.maxPlacement) {
		query = query.where(
			"CalendarEventResultTeam.placement",
			"<=",
			filters.maxPlacement,
		);
	}

	if (filters.minParticipantCount) {
		query = query.where(
			"CalendarEvent.participantCount",
			">=",
			filters.minParticipantCount,
		);
	}

	if (filters.fromYear) {
		query = query.where(maxEventStartTimeAtLeastExpr(filters.fromYear));
	}

	if (filters.toYear) {
		query = query.where(maxEventStartTimeAtMostExpr(filters.toYear));
	}

	return query;
};

/** Tier of the division the result was placed in, falling back to the tournament's own tier. */
const RESULT_TIER = sql<
	Tables["Tournament"]["tier"]
>`coalesce("TournamentDivisionTier"."tier", "Tournament"."tier")`;

const baseTournamentResultsQuery = (
	userId: number,
	filters: ResultsFilters,
) => {
	let query = db
		.selectFrom("TournamentResult")
		.innerJoin(
			"TournamentTeam",
			"TournamentTeam.id",
			"TournamentResult.tournamentTeamId",
		)
		.innerJoin(
			"CalendarEvent",
			"CalendarEvent.tournamentId",
			"TournamentResult.tournamentId",
		)
		.innerJoin("Tournament", "Tournament.id", "TournamentResult.tournamentId")
		.leftJoin("TournamentDivisionTier", (join) =>
			join
				.onRef(
					"TournamentDivisionTier.tournamentId",
					"=",
					"TournamentResult.tournamentId",
				)
				.on(
					sql<SqlBool>`"TournamentDivisionTier"."bracketIdx" = coalesce("TournamentTeam"."startingBracketIdx", 0)`,
				),
		)
		.where("TournamentResult.userId", "=", userId);

	if (!includesTournamentResults(filters)) {
		return query.where(NEVER_MATCHES);
	}

	if (filters.showHighlightsOnly) {
		query = query.where("TournamentResult.isHighlight", "=", 1);
	}

	if (filters.tournamentName) {
		query = query.where(
			nameLikeExpr("CalendarEvent.name", filters.tournamentName),
		);
	}

	if (filters.teamName) {
		query = query.where(nameLikeExpr("TournamentTeam.name", filters.teamName));
	}

	if (filters.mateUserId) {
		const mateUserId = filters.mateUserId;
		query = query.where((eb) =>
			eb.exists(
				eb
					.selectFrom("TournamentResult as MateResult")
					.select("MateResult.userId")
					.whereRef(
						"MateResult.tournamentTeamId",
						"=",
						"TournamentResult.tournamentTeamId",
					)
					.where("MateResult.userId", "=", mateUserId),
			),
		);
	}

	if (isTierFiltered(filters)) {
		query = query
			.where(RESULT_TIER, ">=", filters.minTier ?? BEST_TIER_NUMBER)
			.where(RESULT_TIER, "<=", filters.maxTier ?? WORST_TIER_NUMBER);
	}

	if (filters.maxPlacement) {
		query = query.where(
			"TournamentResult.placement",
			"<=",
			filters.maxPlacement,
		);
	}

	if (filters.minParticipantCount) {
		query = query.where(
			"TournamentResult.participantCount",
			">=",
			filters.minParticipantCount,
		);
	}

	if (filters.fromYear) {
		query = query.where(maxEventStartTimeAtLeastExpr(filters.fromYear));
	}

	if (filters.toYear) {
		query = query.where(maxEventStartTimeAtMostExpr(filters.toYear));
	}

	return query;
};

const escapeLikePattern = (value: string) =>
	value.replace(/[\\%_]/g, (char) => `\\${char}`);

const nameLikeExpr = (column: string, name: string) => {
	const pattern = `%${escapeLikePattern(name)}%`;
	return sql<boolean>`${sql.ref(column)} like ${pattern} escape '\\'`;
};

export function findResultsByUserId(
	userId: number,
	{
		limit,
		offset,
		...filters
	}: ResultsFilters & {
		limit?: number;
		offset?: number;
	} = {},
) {
	const calendarEventResultsQuery = baseCalendarEventResultsQuery(
		userId,
		filters,
	).select(({ eb, fn }) => [
		"CalendarEvent.id as eventId",
		sql<number>`null`.as("tournamentId"),
		"CalendarEventResultTeam.placement",
		"CalendarEvent.participantCount",
		sql<Tables["TournamentResult"]["setResults"]>`null`.as("setResults"),
		sql<string | null>`null`.as("div"),
		sql<string | null>`null`.as("logoUrl"),
		"CalendarEvent.name as eventName",
		"CalendarEventResultTeam.id as teamId",
		"CalendarEventResultTeam.name as teamName",
		fn<number | null>("iif", ["UserResultHighlight.userId", sql`1`, sql`0`]).as(
			"isHighlight",
		),
		sql<number | null>`null`.as("tier"),
		withMaxEventStartTime(eb),
		jsonArrayFrom(
			eb
				.selectFrom("CalendarEventResultPlayer")
				.leftJoin("User", "User.id", "CalendarEventResultPlayer.userId")
				.select((eb) => [
					...commonUserSelect(eb),
					"CalendarEventResultPlayer.name",
				])
				.whereRef(
					"CalendarEventResultPlayer.teamId",
					"=",
					"CalendarEventResultTeam.id",
				)
				.where((eb) =>
					eb.or([
						eb("CalendarEventResultPlayer.userId", "is", null),
						eb("CalendarEventResultPlayer.userId", "!=", userId),
					]),
				),
		).as("mates"),
	]);

	const tournamentResultsQuery = baseTournamentResultsQuery(
		userId,
		filters,
	).select(({ eb }) => [
		sql<number>`null`.as("eventId"),
		"TournamentResult.tournamentId",
		"TournamentResult.placement",
		"TournamentResult.participantCount",
		"TournamentResult.setResults",
		"TournamentResult.div",
		tournamentLogoOrNull(eb).as("logoUrl"),
		"CalendarEvent.name as eventName",
		"TournamentTeam.id as teamId",
		"TournamentTeam.name as teamName",
		"TournamentResult.isHighlight",
		RESULT_TIER.as("tier"),
		withMaxEventStartTime(eb),
		jsonArrayFrom(
			eb
				.selectFrom("TournamentResult as TournamentResult2")
				.innerJoin("User", "User.id", "TournamentResult2.userId")
				.select((eb) => [
					...commonUserSelect(eb),
					sql<string | null>`null`.as("name"),
				])
				.whereRef(
					"TournamentResult2.tournamentTeamId",
					"=",
					"TournamentResult.tournamentTeamId",
				)
				.where("TournamentResult2.userId", "!=", userId),
		).as("mates"),
	]);

	let query = calendarEventResultsQuery
		.unionAll(tournamentResultsQuery)
		.orderBy("startsAt", "desc")
		.$narrowType<{ startsAt: NotNull }>();

	if (limit !== undefined) {
		query = query.limit(limit);
	}

	if (offset !== undefined) {
		query = query.offset(offset);
	}

	return query.execute();
}

export async function countResultsByUserId(
	userId: number,
	filters: ResultsFilters = {},
) {
	const calendarEventResultsQuery = baseCalendarEventResultsQuery(
		userId,
		filters,
	).select(({ fn }) => [fn.countAll<number>().as("count")]);

	const tournamentResultsQuery = baseTournamentResultsQuery(
		userId,
		filters,
	).select(({ fn }) => [fn.countAll<number>().as("count")]);

	const [calendarEventResults, tournamentResults] = await Promise.all([
		calendarEventResultsQuery.executeTakeFirst(),
		tournamentResultsQuery.executeTakeFirst(),
	]);

	return (calendarEventResults?.count ?? 0) + (tournamentResults?.count ?? 0);
}

export async function hasHighlightedResultsByUserId(userId: number) {
	const highlightedTournamentResult = await db
		.selectFrom("TournamentResult")
		.where("userId", "=", userId)
		.where("isHighlight", "=", 1)
		.select("userId")
		.limit(1)
		.executeTakeFirst();

	if (highlightedTournamentResult) {
		return true;
	}

	const highlightedCalendarEventResult = await db
		.selectFrom("UserResultHighlight")
		.where("userId", "=", userId)
		.select(["userId"])
		.limit(1)
		.executeTakeFirst();

	return !!highlightedCalendarEventResult;
}

export async function findResultPlacementsByUserId(userId: number) {
	const tournamentResults = await db
		.selectFrom("TournamentResult")
		.select(["TournamentResult.placement"])
		.where("userId", "=", userId)
		.execute();

	const calendarEventResults = await db
		.selectFrom("CalendarEventResultPlayer")
		.innerJoin(
			"CalendarEventResultTeam",
			"CalendarEventResultTeam.id",
			"CalendarEventResultPlayer.teamId",
		)
		.select(["CalendarEventResultTeam.placement"])
		.where("CalendarEventResultPlayer.userId", "=", userId)
		.execute();

	return [
		...tournamentResults.map((r) => ({ placement: r.placement })),
		...calendarEventResults.map((r) => ({ placement: r.placement })),
	];
}

const searchSelectedFields = (eb: ExpressionBuilder<DB, "User">) =>
	[
		...commonUserSelect(eb),
		"User.inGameName",
		"User.tournamentName",
		"PlusTier.tier as plusTier",
		eb
			.fn<string | null>("iif", [
				"User.showDiscordUniqueName",
				"User.discordUniqueName",
				sql`null`,
			])
			.as("discordUniqueName"),
	] as const;
export async function search({
	query,
	limit,
}: {
	query: string;
	limit: number;
}) {
	// single scan over User with exact matches ranked first instead of two
	// separate scans (exact pass + fuzzy pass excluding exact ids)
	const exactConditions = (eb: ExpressionBuilder<DB, "User">) => [
		eb("User.username", "like", query),
		eb("User.inGameName", "like", query),
		eb("User.discordUniqueName", "like", query),
		eb("User.customUrl", "like", query),
	];

	const fuzzyQuery = `%${query}%`;
	const fuzzyConditions = (eb: ExpressionBuilder<DB, "User">) => [
		eb("User.username", "like", fuzzyQuery),
		eb("User.inGameName", "like", fuzzyQuery),
		eb("User.discordUniqueName", "like", fuzzyQuery),
	];

	const includeExactMatches = query.length > 1;

	// the trigram index needs at least 3 characters and can't replicate
	// LIKE wildcard semantics, those queries fall back to scanning User
	const canUseSearchIndex =
		query.length >= 3 && !query.includes("%") && !query.includes("_");

	let dbQuery = db
		.selectFrom("User")
		.leftJoin("PlusTier", "PlusTier.userId", "User.id")
		.select(searchSelectedFields)
		.where((eb) =>
			eb.or(
				includeExactMatches
					? [...fuzzyConditions(eb), ...exactConditions(eb)]
					: fuzzyConditions(eb),
			),
		);

	if (canUseSearchIndex) {
		// UserSearch match prefilters candidates via the trigram index (it
		// matches a superset of the LIKE conditions, which stay above as the
		// source of truth so results are identical to the fallback path)
		const ftsPhrase = `"${query.replaceAll('"', '""')}"`;
		dbQuery = dbQuery
			.innerJoin("UserSearch", "UserSearch.rowid", "User.id")
			.where(sql<boolean>`"UserSearch" match ${ftsPhrase}`);
	}

	if (includeExactMatches) {
		dbQuery = dbQuery.orderBy(
			(eb) =>
				eb
					.case()
					.when(eb.or(exactConditions(eb)))
					.then(0)
					.else(1)
					.end(),
			"asc",
		);
	}

	return (
		dbQuery
			.orderBy(
				(eb) =>
					eb
						.case()
						.when("PlusTier.tier", "is", null)
						.then(4)
						.else(eb.ref("PlusTier.tier"))
						.end(),
				"asc",
			)
			// deterministic order for ties so both query paths return the same rows
			.orderBy("User.id", "asc")
			.limit(limit)
			.execute()
	);
}

export function searchExact(args: {
	id?: number;
	discordId?: string;
	customUrl?: string;
}) {
	let query = db
		.selectFrom("User")
		.leftJoin("PlusTier", "PlusTier.userId", "User.id")
		.select(searchSelectedFields);

	let filtered = false;

	if (typeof args.id === "number") {
		filtered = true;
		query = query.where("User.id", "=", args.id);
	}

	if (typeof args.discordId === "string") {
		filtered = true;
		query = query.where("User.discordId", "=", args.discordId);
	}

	if (typeof args.customUrl === "string") {
		filtered = true;
		query = query.where("User.customUrl", "=", args.customUrl);
	}

	invariant(filtered, "No search criteria provided");

	return query.execute();
}

export async function findCurrentFriendCodeByUserId(userId: number) {
	return db
		.selectFrom("UserFriendCode")
		.select([
			"UserFriendCode.friendCode",
			"UserFriendCode.createdAt",
			"UserFriendCode.submitterUserId",
		])
		.where("userId", "=", userId)
		.orderBy("UserFriendCode.createdAt", "desc")
		.limit(1)
		.executeTakeFirst();
}

/** Returns all friend codes submitted by a user (both present and past) */
export async function findFriendCodesByUserId(userId: number) {
	return db
		.selectFrom("UserFriendCode")
		.leftJoin("User", "User.id", "UserFriendCode.submitterUserId")
		.select([
			"UserFriendCode.friendCode",
			"UserFriendCode.createdAt",
			"User.username as submitterUsername",
		])
		.where("UserFriendCode.userId", "=", userId)
		.orderBy("UserFriendCode.createdAt", "desc")
		.execute();
}

let cachedFriendCodes: Set<string> | null = null;

export async function findAllCurrentFriendCodes() {
	if (cachedFriendCodes) {
		return cachedFriendCodes;
	}

	const allFriendCodes = await db
		.selectFrom("UserFriendCode")
		.select(["UserFriendCode.friendCode", "UserFriendCode.userId"])
		.orderBy("UserFriendCode.createdAt", "desc")
		.execute();

	const seenUserIds = new Set<number>();
	const friendCodes = new Set<string>();

	for (const row of allFriendCodes) {
		if (seenUserIds.has(row.userId)) {
			continue;
		}

		seenUserIds.add(row.userId);
		friendCodes.add(row.friendCode);
	}

	cachedFriendCodes = friendCodes;

	return friendCodes;
}

export async function findInGameNameByUserId(userId: number) {
	return (
		await db
			.selectFrom("User")
			.select("User.inGameName")
			.where("id", "=", userId)
			.executeTakeFirst()
	)?.inGameName;
}

export async function findPatronStartedAtByUserId(userId: number) {
	return (
		await db
			.selectFrom("User")
			.select("User.patronStartedAt")
			.where("id", "=", userId)
			.executeTakeFirst()
	)?.patronStartedAt;
}

export async function findJoinOrderByUserId(userId: number) {
	const row = await db
		.selectFrom("User")
		.select("User.joinOrder")
		.where("id", "=", userId)
		.executeTakeFirst();

	if (!row?.joinOrder) return null;

	return {
		joinOrder: row.joinOrder,
		isSpl2: row.joinOrder <= SPL2_JOIN_ORDER_CUTOFF,
	};
}

export async function findCommissionsByUserId(userId: number) {
	return await db
		.selectFrom("User")
		.select([
			"User.commissionsOpen",
			"User.commissionsOpenedAt",
			"User.commissionText",
		])
		.where("id", "=", userId)
		.executeTakeFirst();
}

export function insertFriendCode(args: TablesInsertable["UserFriendCode"]) {
	cachedFriendCodes?.add(args.friendCode);

	return db.insertInto("UserFriendCode").values(args).execute();
}

export function upsert(
	args: Pick<
		TablesInsertable["User"],
		| "discordId"
		| "discordName"
		| "discordAvatar"
		| "discordUniqueName"
		| "twitch"
		| "youtubeId"
		| "bsky"
	>,
) {
	return db
		.insertInto("User")
		.values((eb) => ({
			...args,
			createdAt: databaseTimestampNow(),
			joinOrder: eb
				.selectFrom("User")
				.select(
					eb(
						eb.fn.coalesce(eb.fn.max("joinOrder"), eb.val(0)),
						"+",
						eb.val(1),
					).as("nextJoinOrder"),
				),
		}))
		.onConflict((oc) => {
			return oc.column("discordId").doUpdateSet({
				...R.omit(args, ["discordId"]),
			});
		})
		.returning("id")
		.executeTakeFirstOrThrow();
}

type UpdateProfileArgs = Pick<
	TablesInsertable["User"],
	| "country"
	| "bio"
	| "customUrl"
	| "customName"
	| "motionSens"
	| "stickSens"
	| "pronouns"
	| "inGameName"
	| "battlefy"
	| "showDiscordUniqueName"
	| "commissionText"
	| "commissionsOpen"
> & {
	weapons: Pick<TablesInsertable["UserWeapon"], "weaponSplId" | "isFavorite">[];
	favoriteBadgeIds?: number[] | null;
	favoriteTrophyIds?: number[] | null;
	hiddenTrophyIds?: number[] | null;
	customAvatarImgId?: number | null;
};
export function updateOwnProfile(args: UpdateProfileArgs) {
	const userId = actorId();
	return db.transaction().execute(async (trx) => {
		await trx.deleteFrom("UserWeapon").where("userId", "=", userId).execute();

		// a removed or replaced custom avatar is no longer referenced by anything,
		// so its submitted image row is cleaned up
		const current = await trx
			.selectFrom("User")
			.select("User.customAvatarImgId")
			.where("id", "=", userId)
			.executeTakeFirst();
		if (
			current?.customAvatarImgId &&
			current.customAvatarImgId !== args.customAvatarImgId
		) {
			await trx
				.deleteFrom("UnvalidatedUserSubmittedImage")
				.where("id", "=", current.customAvatarImgId)
				.where("UnvalidatedUserSubmittedImage.submitterUserId", "=", userId)
				.execute();
		}

		await trx
			.insertInto("UserWeapon")
			.values(
				args.weapons.map((weapon, i) => ({
					userId,
					weaponSplId: weapon.weaponSplId,
					isFavorite: weapon.isFavorite ?? 0,
					order: i + 1,
				})),
			)
			.execute();

		return trx
			.updateTable("User")
			.set({
				country: args.country,
				bio: args.bio,
				customUrl: args.customUrl,
				customName: args.customName,
				motionSens: args.motionSens,
				stickSens: args.stickSens,
				pronouns: args.pronouns,
				inGameName: args.inGameName,
				battlefy: args.battlefy,
				favoriteBadgeIds: args.favoriteBadgeIds
					? JSON.stringify(args.favoriteBadgeIds)
					: null,
				favoriteTrophyIds: args.favoriteTrophyIds
					? JSON.stringify(args.favoriteTrophyIds)
					: null,
				hiddenTrophyIds: args.hiddenTrophyIds
					? JSON.stringify(args.hiddenTrophyIds)
					: null,
				showDiscordUniqueName: args.showDiscordUniqueName,
				commissionText: args.commissionText,
				commissionsOpen: args.commissionsOpen,
				commissionsOpenedAt:
					args.commissionsOpen === 1 ? databaseTimestampNow() : null,
				customAvatarImgId: args.customAvatarImgId ?? null,
			})
			.where("id", "=", userId)
			.returning(["User.id", "User.customUrl", "User.discordId"])
			.executeTakeFirstOrThrow();
	});
}

/** Bulk-sets each user's latest LUTI division. Used by the `ComputeLutiDivs` routine. */
export function updateManyDivs(
	updates: Array<{ userId: number; div: string }>,
) {
	if (updates.length === 0) return;

	return db.transaction().execute(async (trx) => {
		for (const { userId, div } of updates) {
			await trx
				.updateTable("User")
				.set({ div })
				.where("id", "=", userId)
				.execute();
		}
	});
}

export function updateOwnCustomTheme(css: CustomTheme | null) {
	return db
		.updateTable("User")
		.set({
			customTheme: css ? JSON.stringify(css) : null,
		})
		.where("id", "=", actorId())
		.execute();
}

export function updateOwnPreferences(newPreferences: UserPreferences) {
	const userId = actorId();
	return db.transaction().execute(async (trx) => {
		const current =
			(
				await trx
					.selectFrom("User")
					.select("User.preferences")
					.where("id", "=", userId)
					.executeTakeFirstOrThrow()
			).preferences ?? {};

		const mergedPreferences = {
			...current,
			...newPreferences,
		};

		await trx
			.updateTable("User")
			.set({
				preferences: JSON.stringify(mergedPreferences),
			})
			.where("id", "=", userId)
			.execute();
	});
}

type UpdateResultHighlightsArgs = {
	resultTeamIds: Array<number>;
	resultTournamentTeamIds: Array<number>;
};
export function updateOwnResultHighlights(args: UpdateResultHighlightsArgs) {
	const userId = actorId();
	return db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("UserResultHighlight")
			.where("userId", "=", userId)
			.execute();

		await trx
			.insertInto("UserResultHighlight")
			.values(
				args.resultTeamIds.map((teamId) => ({
					userId,
					teamId,
				})),
			)
			.execute();

		await trx
			.updateTable("TournamentResult")
			.set({
				isHighlight: 0,
			})
			.where("TournamentResult.userId", "=", userId)
			.execute();

		if (args.resultTournamentTeamIds.length > 0) {
			await trx
				.updateTable("TournamentResult")
				.set({
					isHighlight: 1,
				})
				.where("TournamentResult.userId", "=", userId)
				.where(
					"TournamentResult.tournamentTeamId",
					"in",
					args.resultTournamentTeamIds,
				)
				.execute();
		}
	});
}

export function updateOwnBuildSorting(buildSorting: BuildSort[] | null) {
	return db
		.updateTable("User")
		.set({ buildSorting: buildSorting ? JSON.stringify(buildSorting) : null })
		.where("id", "=", actorId())
		.execute();
}

export type UpdatePatronDataArgs = Array<
	Pick<Tables["User"], "discordId" | "patronTier" | "patronStartedAt">
>;
export function updatePatronData(users: UpdatePatronDataArgs) {
	return db.transaction().execute(async (trx) => {
		await trx
			.updateTable("User")
			.set({
				patronTier: null,
				patronStartedAt: null,
				patronExpiresAt: null,
			})
			.where((eb) =>
				eb.or([
					eb("patronExpiresAt", "<", dateToDatabaseTimestamp(new Date())),
					eb("patronExpiresAt", "is", null),
				]),
			)
			.execute();

		for (const user of users) {
			await trx
				.updateTable("User")
				.set({
					patronTier: user.patronTier,
					patronStartedAt: user.patronStartedAt,
					patronExpiresAt: null,
				})
				.where("User.discordId", "=", user.discordId)
				.execute();
		}
	});
}

export function updateMany(
	argsArr: Array<
		Pick<
			Tables["User"],
			"discordAvatar" | "discordName" | "discordUniqueName" | "discordId"
		>
	>,
) {
	return db.transaction().execute(async (trx) => {
		for (const updateArgs of argsArr) {
			await trx
				.updateTable("User")
				.set((eb) => ({
					discordAvatar: updateArgs.discordAvatar,
					discordName: eb.fn.coalesce(
						eb.val(updateArgs.discordName),
						"User.discordName",
					),
					discordUniqueName: eb.fn.coalesce(
						eb.val(updateArgs.discordUniqueName),
						"User.discordUniqueName",
					),
				}))
				.where("User.discordId", "=", updateArgs.discordId)
				.execute();
		}
	});
}

export async function anyUserPrefersNoScreen(
	userIds: number[],
): Promise<boolean> {
	if (userIds.length === 0) return false;

	const result = await db
		.selectFrom("User")
		.select("User.noScreen")
		.where("User.id", "in", userIds)
		.where("User.noScreen", "=", 1)
		.executeTakeFirst();

	return Boolean(result);
}

export async function findSocialLinksByUserId(userId: number) {
	const user = await db
		.selectFrom("User")
		.select([
			"User.twitch",
			"User.youtubeId",
			"User.bsky",
			"User.discordUniqueName",
		])
		.where("User.id", "=", userId)
		.executeTakeFirst();

	if (!user) return [];

	const links: Array<
		| { type: "url"; value: string }
		| { type: "popover"; platform: "discord"; value: string }
	> = [];

	if (user.twitch) {
		links.push({ type: "url", value: twitchUrl(user.twitch) });
	}
	if (user.youtubeId) {
		links.push({ type: "url", value: youtubeUrl(user.youtubeId) });
	}
	if (user.bsky) {
		links.push({ type: "url", value: bskyUrl(user.bsky) });
	}
	if (user.discordUniqueName) {
		links.push({
			type: "popover",
			platform: "discord",
			value: user.discordUniqueName,
		});
	}

	return links;
}

export function findIdsByTwitchUsernames(twitchUsernames: string[]) {
	if (twitchUsernames.length === 0) return [];

	return db
		.selectFrom("User")
		.select(["User.id", "User.twitch"])
		.where("User.twitch", "in", twitchUsernames)
		.execute();
}

/** Returns weapon pool entries with ten-star status for the given user. */
export function findWeaponPoolByUserId(userId: number) {
	return db
		.selectFrom("UserWeaponPool")
		.leftJoin("TenStarWeapon", (join) =>
			join
				.onRef("TenStarWeapon.userId", "=", "UserWeaponPool.userId")
				.onRef("TenStarWeapon.weaponSplId", "=", "UserWeaponPool.weaponSplId"),
		)
		.select([
			"UserWeaponPool.weaponSplId",
			"UserWeaponPool.isFavorite",
			sql<number>`case when "TenStarWeapon"."weaponSplId" is not null then 1 else 0 end`.as(
				"isTenStar",
			),
		])
		.where("UserWeaponPool.userId", "=", userId)
		.orderBy("UserWeaponPool.sortOrder", "asc")
		.execute();
}
