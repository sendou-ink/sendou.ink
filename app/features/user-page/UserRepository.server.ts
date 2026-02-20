import type { ExpressionBuilder, FunctionModule, NotNull } from "kysely";
import { sql } from "kysely";
import { jsonArrayFrom } from "kysely/helpers/sqlite";
import * as R from "remeda";
import { db, sql as dbDirect } from "~/db/sql";
import type {
	BuildSort,
	DB,
	Tables,
	TablesInsertable,
	UserPreferences,
} from "~/db/tables";
import { userRoles } from "~/modules/permissions/mapper.server";
import { isSupporter } from "~/modules/permissions/utils";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import invariant from "~/utils/invariant";
import type { CommonUser } from "~/utils/kysely.server";
import {
	COMMON_USER_FIELDS,
	concatUserSubmittedImagePrefix,
	tournamentLogoOrNull,
	userChatNameColor,
} from "~/utils/kysely.server";
import { logger } from "~/utils/logger";
import { safeNumberParse } from "~/utils/number";
import { bskyUrl, twitchUrl, youtubeUrl } from "~/utils/urls";
import type { ChatUser } from "../chat/chat-types";
import { sortBadgesByFavorites } from "./core/badge-sorting.server";
import { findWidgetById } from "./core/widgets/portfolio";
import { WIDGET_LOADERS } from "./core/widgets/portfolio-loaders.server";
import type { LoadedWidget } from "./core/widgets/types";

export const identifierToUserIdQuery = (identifier: string) =>
	db
		.selectFrom("User")
		.select("User.id")
		.where((eb) => {
			// we don't want to parse discord id's as numbers (length = 18)
			const parsedId =
				identifier.length < 10 ? safeNumberParse(identifier) : null;
			if (parsedId) {
				return eb("User.id", "=", parsedId);
			}

			if (/^\d+$/.test(identifier)) {
				return eb("User.discordId", "=", identifier);
			}

			return eb("User.customUrl", "=", identifier);
		});

export function identifierToUserId(identifier: string) {
	return identifierToUserIdQuery(identifier).executeTakeFirst();
}

export async function identifierToBuildFields(identifier: string) {
	const row = await identifierToUserIdQuery(identifier)
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
	return identifierToUserIdQuery(identifier)
		.select((eb) => [
			...COMMON_USER_FIELDS,
			"User.pronouns",
			"User.country",
			"User.inGameName",
			"User.commissionText",
			"User.commissionsOpen",
			sql<Record<
				string,
				string
			> | null>`IIF(COALESCE("User"."patronTier", 0) >= 2, "User"."css", null)`.as(
				"css",
			),
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
							eb("Build.private", "=", 0),
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
			eb
				.selectFrom("Art")
				.leftJoin("ArtUserMetadata", "ArtUserMetadata.artId", "Art.id")
				.innerJoin("UserSubmittedImage", "UserSubmittedImage.id", "Art.imgId")
				.select(({ fn }) => fn.count<number>("Art.id").distinct().as("count"))
				.where((innerEb) =>
					innerEb.or([
						innerEb("Art.authorId", "=", eb.ref("User.id")),
						innerEb("ArtUserMetadata.userId", "=", eb.ref("User.id")),
					]),
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
	const row = await identifierToUserIdQuery(identifier)
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
			"User.patronTier",
			"PlusTier.tier as plusTier",
			"User.pronouns",
			jsonArrayFrom(
				eb
					.selectFrom("UserWeapon")
					.select(["UserWeapon.weaponSplId", "UserWeapon.isFavorite"])
					.whereRef("UserWeapon.userId", "=", "User.id")
					.orderBy("UserWeapon.order", "asc"),
			).as("weapons"),
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
						concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
							"avatarUrl",
						),
					])
					.whereRef("TeamMemberWithSecondary.userId", "=", "User.id"),
			).as("teams"),
			jsonArrayFrom(
				eb
					.selectFrom("BadgeOwner")
					.innerJoin("Badge", "Badge.id", "BadgeOwner.badgeId")
					.select(({ fn }) => [
						fn.count<number>("BadgeOwner.badgeId").as("count"),
						"Badge.id",
						"Badge.displayName",
						"Badge.code",
						"Badge.hue",
					])
					.whereRef("BadgeOwner.userId", "=", "User.id")
					.groupBy(["BadgeOwner.badgeId", "BadgeOwner.userId"]),
			).as("badges"),
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

	return {
		...row,
		team: row.teams.find((t) => t.isMainTeam),
		secondaryTeams: row.teams.filter((t) => !t.isMainTeam),
		teams: undefined,
		...sortBadgesByFavorites(row),
		discordUniqueName:
			forceShowDiscordUniqueName || row.showDiscordUniqueName
				? row.discordUniqueName
				: null,
	};
}

export async function widgetsEnabledByIdentifier(identifier: string) {
	const row = await identifierToUserIdQuery(identifier)
		.select(["User.preferences", "User.patronTier"])
		.executeTakeFirst();

	if (!row) return false;
	if (!isSupporter(row)) return false;

	return row?.preferences?.newProfileEnabled === true;
}

export async function preferencesByUserId(userId: number) {
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

export async function storedWidgetsByUserId(
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

export async function widgetsByUserId(
	identifier: string,
): Promise<LoadedWidget[] | null> {
	const user = await identifierToUserId(identifier);

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
		.select([...COMMON_USER_FIELDS])
		.where("UserFriendCode.friendCode", "=", friendCode)
		.execute();
}

export async function findSubDefaultsByUserId(userId: number) {
	const user = await db
		.selectFrom("User")
		.select(["User.vc", "User.qWeaponPool", "User.lastSubMessage"])
		.where("User.id", "=", userId)
		.executeTakeFirst();

	if (!user) return null;

	const vcToCanVc = (vc: "YES" | "NO" | "LISTEN_ONLY"): 0 | 1 | 2 => {
		if (vc === "YES") return 1;
		if (vc === "NO") return 0;
		return 2;
	};

	const qWeaponPool = user.qWeaponPool ?? [];

	let bestWeapons = qWeaponPool
		.filter((w) => w.isFavorite === 1)
		.map((w) => w.weaponSplId);
	let okWeapons = qWeaponPool
		.filter((w) => w.isFavorite === 0)
		.map((w) => w.weaponSplId);

	if (bestWeapons.length === 0) {
		bestWeapons = okWeapons;
		okWeapons = [];
	}

	return {
		canVc: vcToCanVc(user.vc),
		bestWeapons,
		okWeapons,
		message: user.lastSubMessage,
	};
}

export async function findLeanById(id: number) {
	const user = await db
		.selectFrom("User")
		.leftJoin("PlusTier", "PlusTier.userId", "User.id")
		.where("User.id", "=", id)
		.select(({ eb }) => [
			...COMMON_USER_FIELDS,
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
					.select([
						"ModNote.id as noteId",
						"ModNote.text",
						"ModNote.createdAt",
						...COMMON_USER_FIELDS,
					])
					.where("ModNote.isDeleted", "=", 0)
					.where("ModNote.userId", "=", id)
					.orderBy("ModNote.createdAt", "desc"),
			).as("modNotes"),
			jsonArrayFrom(
				eb
					.selectFrom("BanLog")
					.innerJoin("User", "User.id", "BanLog.bannedByUserId")
					.select([
						"BanLog.banned",
						"BanLog.bannedReason",
						"BanLog.createdAt",
						...COMMON_USER_FIELDS,
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
		.orderBy("User.patronSince", "asc")
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

export async function findChatUsersByUserIds(userIds: number[]) {
	const users = await db
		.selectFrom("User")
		.select([
			"User.id",
			"User.discordId",
			"User.discordAvatar",
			"User.username",
			"User.pronouns",
			userChatNameColor,
		])
		.where("User.id", "in", userIds)
		.execute();

	const result: Record<number, ChatUser> = {};

	for (const user of users) {
		result[user.id] = user;
	}

	return result;
}

const withMaxEventStartTime = (eb: ExpressionBuilder<DB, "CalendarEvent">) => {
	return eb
		.selectFrom("CalendarEventDate")
		.select(({ fn }) => [fn.max("CalendarEventDate.startTime").as("startTime")])
		.whereRef("CalendarEventDate.eventId", "=", "CalendarEvent.id")
		.as("startTime");
};

const baseCalendarEventResultsQuery = (userId: number) =>
	db
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

const baseTournamentResultsQuery = (userId: number) =>
	db
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
		.where("TournamentResult.userId", "=", userId);

export function findResultsByUserId(
	userId: number,
	{
		showHighlightsOnly = false,
		limit,
		offset,
	}: { showHighlightsOnly?: boolean; limit?: number; offset?: number } = {},
) {
	let calendarEventResultsQuery = baseCalendarEventResultsQuery(userId).select(
		({ eb, fn }) => [
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
			fn<number | null>("iif", [
				"UserResultHighlight.userId",
				sql`1`,
				sql`0`,
			]).as("isHighlight"),
			sql<number | null>`null`.as("tier"),
			withMaxEventStartTime(eb),
			jsonArrayFrom(
				eb
					.selectFrom("CalendarEventResultPlayer")
					.leftJoin("User", "User.id", "CalendarEventResultPlayer.userId")
					.select([...COMMON_USER_FIELDS, "CalendarEventResultPlayer.name"])
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
		],
	);

	let tournamentResultsQuery = baseTournamentResultsQuery(userId).select(
		({ eb }) => [
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
			"Tournament.tier",
			withMaxEventStartTime(eb),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentResult as TournamentResult2")
					.innerJoin("User", "User.id", "TournamentResult2.userId")
					.select([...COMMON_USER_FIELDS, sql<string | null>`null`.as("name")])
					.whereRef(
						"TournamentResult2.tournamentTeamId",
						"=",
						"TournamentResult.tournamentTeamId",
					)
					.where("TournamentResult2.userId", "!=", userId),
			).as("mates"),
		],
	);

	if (showHighlightsOnly) {
		calendarEventResultsQuery = calendarEventResultsQuery.where(
			"UserResultHighlight.userId",
			"is not",
			null,
		);
		tournamentResultsQuery = tournamentResultsQuery.where(
			"TournamentResult.isHighlight",
			"=",
			1,
		);
	}

	let query = calendarEventResultsQuery
		.unionAll(tournamentResultsQuery)
		.orderBy("startTime", "desc")
		.$narrowType<{ startTime: NotNull }>();

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
	{ showHighlightsOnly = false }: { showHighlightsOnly?: boolean } = {},
) {
	let calendarEventResultsQuery = baseCalendarEventResultsQuery(userId).select(
		({ fn }) => [fn.countAll<number>().as("count")],
	);

	let tournamentResultsQuery = baseTournamentResultsQuery(userId).select(
		({ fn }) => [fn.countAll<number>().as("count")],
	);

	if (showHighlightsOnly) {
		calendarEventResultsQuery = calendarEventResultsQuery.where(
			"UserResultHighlight.userId",
			"is not",
			null,
		);
		tournamentResultsQuery = tournamentResultsQuery.where(
			"TournamentResult.isHighlight",
			"=",
			1,
		);
	}

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

const searchSelectedFields = ({ fn }: { fn: FunctionModule<DB, "User"> }) =>
	[
		...COMMON_USER_FIELDS,
		"User.inGameName",
		"PlusTier.tier as plusTier",
		fn<string | null>("iif", [
			"User.showDiscordUniqueName",
			"User.discordUniqueName",
			sql`null`,
		]).as("discordUniqueName"),
	] as const;
export async function search({
	query,
	limit,
}: {
	query: string;
	limit: number;
}) {
	let exactMatches: Array<
		CommonUser & {
			inGameName: string | null;
			plusTier: number | null;
			discordUniqueName: string | null;
		}
	> = [];
	if (query.length > 1) {
		exactMatches = await db
			.selectFrom("User")
			.leftJoin("PlusTier", "PlusTier.userId", "User.id")
			.select(searchSelectedFields)
			.where((eb) =>
				eb.or([
					eb("User.username", "like", query),
					eb("User.inGameName", "like", query),
					eb("User.discordUniqueName", "like", query),
					eb("User.customUrl", "like", query),
				]),
			)
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
			.limit(limit)
			.execute();
	}

	const fuzzyQuery = `%${query}%`;
	const fuzzyMatches = await db
		.selectFrom("User")
		.leftJoin("PlusTier", "PlusTier.userId", "User.id")
		.select(searchSelectedFields)
		.where((eb) =>
			eb
				.or([
					eb("User.username", "like", fuzzyQuery),
					eb("User.inGameName", "like", fuzzyQuery),
					eb("User.discordUniqueName", "like", fuzzyQuery),
				])
				.and(
					"User.id",
					"not in",
					exactMatches.map((match) => match.id),
				),
		)
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
		.limit(limit - exactMatches.length)
		.execute();

	return [...exactMatches, ...fuzzyMatches];
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

export async function currentFriendCodeByUserId(userId: number) {
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
export async function friendCodesByUserId(userId: number) {
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

export async function allCurrentFriendCodes() {
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

export async function inGameNameByUserId(userId: number) {
	return (
		await db
			.selectFrom("User")
			.select("User.inGameName")
			.where("id", "=", userId)
			.executeTakeFirst()
	)?.inGameName;
}

export async function patronSinceByUserId(userId: number) {
	return (
		await db
			.selectFrom("User")
			.select("User.patronSince")
			.where("id", "=", userId)
			.executeTakeFirst()
	)?.patronSince;
}

export async function commissionsByUserId(userId: number) {
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
		.values({ ...args, createdAt: databaseTimestampNow() })
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
	| "css"
	| "showDiscordUniqueName"
	| "commissionText"
	| "commissionsOpen"
> & {
	userId: number;
	weapons: Pick<TablesInsertable["UserWeapon"], "weaponSplId" | "isFavorite">[];
	favoriteBadgeIds?: number[] | null;
};
export function updateProfile(args: UpdateProfileArgs) {
	return db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("UserWeapon")
			.where("userId", "=", args.userId)
			.execute();

		if (args.weapons.length > 0) {
			await trx
				.insertInto("UserWeapon")
				.values(
					args.weapons.map((weapon, i) => ({
						userId: args.userId,
						weaponSplId: weapon.weaponSplId,
						isFavorite: weapon.isFavorite,
						order: i + 1,
					})),
				)
				.execute();
		}

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
				css: args.css,
				battlefy: args.battlefy,
				favoriteBadgeIds: args.favoriteBadgeIds
					? JSON.stringify(args.favoriteBadgeIds)
					: null,
				showDiscordUniqueName: args.showDiscordUniqueName,
				commissionText: args.commissionText,
				commissionsOpen: args.commissionsOpen,
				commissionsOpenedAt:
					args.commissionsOpen === 1 ? databaseTimestampNow() : null,
			})
			.where("id", "=", args.userId)
			.returning(["User.id", "User.customUrl", "User.discordId"])
			.executeTakeFirstOrThrow();
	});
}

export function updatePreferences(
	userId: number,
	newPreferences: UserPreferences,
) {
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
	userId: number;
	resultTeamIds: Array<number>;
	resultTournamentTeamIds: Array<number>;
};
export function updateResultHighlights(args: UpdateResultHighlightsArgs) {
	return db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("UserResultHighlight")
			.where("userId", "=", args.userId)
			.execute();

		if (args.resultTeamIds.length > 0) {
			await trx
				.insertInto("UserResultHighlight")
				.values(
					args.resultTeamIds.map((teamId) => ({
						userId: args.userId,
						teamId,
					})),
				)
				.execute();
		}

		await trx
			.updateTable("TournamentResult")
			.set({
				isHighlight: 0,
			})
			.where("TournamentResult.userId", "=", args.userId)
			.execute();

		if (args.resultTournamentTeamIds.length > 0) {
			await trx
				.updateTable("TournamentResult")
				.set({
					isHighlight: 1,
				})
				.where("TournamentResult.userId", "=", args.userId)
				.where(
					"TournamentResult.tournamentTeamId",
					"in",
					args.resultTournamentTeamIds,
				)
				.execute();
		}
	});
}

export function updateBuildSorting({
	userId,
	buildSorting,
}: {
	userId: number;
	buildSorting: BuildSort[] | null;
}) {
	return db
		.updateTable("User")
		.set({ buildSorting: buildSorting ? JSON.stringify(buildSorting) : null })
		.where("id", "=", userId)
		.execute();
}

export type UpdatePatronDataArgs = Array<
	Pick<Tables["User"], "discordId" | "patronTier" | "patronSince">
>;
export function updatePatronData(users: UpdatePatronDataArgs) {
	return db.transaction().execute(async (trx) => {
		await trx
			.updateTable("User")
			.set({
				patronTier: null,
				patronSince: null,
				patronTill: null,
			})
			.where((eb) =>
				eb.or([
					eb("patronTill", "<", dateToDatabaseTimestamp(new Date())),
					eb("patronTill", "is", null),
				]),
			)
			.execute();

		for (const user of users) {
			await trx
				.updateTable("User")
				.set({
					patronTier: user.patronTier,
					patronSince: user.patronSince,
					patronTill: null,
				})
				.where("User.discordId", "=", user.discordId)
				.execute();
		}
	});
}

// TODO: use Kysely
const updateByDiscordIdStm = dbDirect.prepare(/* sql */ `
  update
    "User"
  set
    "discordAvatar" = @discordAvatar,
    "discordName" = coalesce(@discordName, "discordName"),
    "discordUniqueName" = coalesce(@discordUniqueName, "discordUniqueName")
  where
    "discordId" = @discordId
`);
export const updateMany = dbDirect.transaction(
	(
		argsArr: Array<
			Pick<
				Tables["User"],
				"discordAvatar" | "discordName" | "discordUniqueName" | "discordId"
			>
		>,
	) => {
		for (const updateArgs of argsArr) {
			updateByDiscordIdStm.run(updateArgs);
		}
	},
);

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

export async function socialLinksByUserId(userId: number) {
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
