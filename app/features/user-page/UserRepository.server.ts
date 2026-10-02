import type {
	AliasableExpression,
	Expression,
	ExpressionBuilder,
	NotNull,
	SelectType,
	SqlBool,
} from "kysely";
import { sql } from "kysely";
import * as R from "remeda";
import { crud } from "~/db/crud";
import { defineQuery, type Modifier, refine } from "~/db/entity-query";
import type { ForeignKeysTo, TableName } from "~/db/schema-types";
import { db } from "~/db/sql";
import type { DB, Tables, TablesInsertable } from "~/db/tables";
import type { CustomTheme, UserPreferences } from "~/db/tables-json";
import { actorId, actorIdOrNull } from "~/features/auth/core/user.server";
import { PATRON_CHIP_THEME_VARS } from "~/features/theme/theme-constants";
import {
	BEST_TIER_NUMBER,
	type TournamentTierNumber,
	WORST_TIER_NUMBER,
} from "~/features/tournament/core/tiering";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import type {
	BuildSort,
	ResultSource,
} from "~/features/user-page/user-page-constants";
import { userRoles } from "~/modules/permissions/mapper.server";
import { isSupporter } from "~/modules/permissions/utils";
import {
	databaseTimestampNow,
	dateToDatabaseTimestamp,
	dateToYYYYMMDD,
} from "~/utils/dates";
import {
	asJson,
	type CommonUser,
	commonUserSelect,
	concatUserSubmittedImagePrefix,
	jsonArrayFrom,
	jsonObjectFrom,
	matchProfileWeapons,
	tournamentLogoOrNull,
} from "~/utils/kysely.server";
import { logger } from "~/utils/logger";
import { safeNumberParse } from "~/utils/number";
import { seededRandom } from "~/utils/random";
import {
	DEFAULT_WIDGETS,
	findWidgetById,
	widgetsAvailableTo,
} from "./core/widgets/portfolio";
import { WIDGET_LOADERS } from "./core/widgets/portfolio-loaders.server";
import type { LoadedWidget } from "./core/widgets/types";

const userTable = crud("User");
const widgetTable = crud("UserWidget");
const friendCodeTable = crud("UserFriendCode");
const resultHighlightTable = crud("UserResultHighlight");
const tournamentResultTable = crud("TournamentResult");

export const { findById, findOneBy, exists } = userTable;

/** User fields beyond {@link CommonUser} that {@link withUser} can add, by name. */
const USER_EXTRAS = {
	plusTier: (eb: ExpressionBuilder<DB, "User">) =>
		eb
			.selectFrom("PlusTier")
			.select("PlusTier.tier")
			.whereRef("PlusTier.userId", "=", "User.id")
			.$asScalar()
			.$castTo<number | null>(),
	country: (eb: ExpressionBuilder<DB, "User">) => eb.ref("User.country"),
	languages: (eb: ExpressionBuilder<DB, "User">) => eb.ref("User.languages"),
	commissionsOpen: (eb: ExpressionBuilder<DB, "User">) =>
		eb.ref("User.commissionsOpen"),
	weaponPool: (eb: ExpressionBuilder<DB, "User">) => matchProfileWeapons(eb),
	card: (eb: ExpressionBuilder<DB, "User">) =>
		UserCardRepository.cardOf(eb.ref("User.id")),
} satisfies Record<
	string,
	(eb: ExpressionBuilder<DB, "User">) => AliasableExpression<unknown>
>;

type UserExtra = keyof typeof USER_EXTRAS;

type UserObject<
	T extends TableName,
	C extends keyof DB[T],
	E extends ReadonlyArray<UserExtra>,
> =
	| (CommonUser & {
			[K in E[number]]: ReturnType<(typeof USER_EXTRAS)[K]> extends Expression<
				infer V
			>
				? V
				: never;
	  })
	| (null extends SelectType<DB[T][C]> ? null : never);

/**
 * Chain step adding the user a foreign key column points at as `as`: {@link CommonUser} plus the
 * named `extras`, `null` when the column is nullable and empty. The root table and the column come
 * from the `"Table.column"` string, which must have a foreign key to `User`.
 */
export function withUser<
	const As extends string,
	T extends TableName,
	C extends ForeignKeysTo<T, "User">,
	const E extends ReadonlyArray<UserExtra> = [],
>(
	as: As,
	column: `${T}.${C}`,
	extras?: E,
): Modifier<T, { [K in As]: UserObject<T, C, E> }> {
	return {
		apply: (qb) =>
			qb.select((eb: ExpressionBuilder<DB, "User">) =>
				jsonObjectFrom(
					eb
						.selectFrom("User")
						.select((userEb) => [
							...commonUserSelect(userEb),
							// aliased as is, so a JSON extra is still recognized as one inside the object
							...(extras ?? []).map((extra) => {
								const expression: AliasableExpression<unknown> =
									USER_EXTRAS[extra](userEb);
								return expression.as(extra);
							}),
						])
						.whereRef("User.id", "=", sql.ref(column)),
				).as(as),
			),
		memoKey: `withUser(${as},${column},${extras ?? []})`,
	};
}

/** Users as {@link CommonUser}, by id. */
export const users = defineQuery({
	root: "User",
	select: (qb) => qb.select((eb) => commonUserSelect(eb)),
	defaultSort: [["User.id", "asc"]],
	vocabulary: () => ({
		/** The user a `/u/:identifier` URL segment names: their id, Discord id or custom url. */
		identifiedBy: (identifier: string) =>
			refine("User", (qb) =>
				qb.where((eb) => identifierFilter(eb, identifier)),
			),
		/** Members of the plus server, with their tier as `plusTier`. */
		inPlusServer: () =>
			refine("User", (qb) =>
				qb
					.innerJoin("PlusTier", "PlusTier.userId", "User.id")
					.select("PlusTier.tier as plusTier"),
			),
		/** Patrons of any tier, with their `patronTier`. */
		patrons: () =>
			refine("User", (qb) =>
				qb
					.where("User.patronTier", "is not", null)
					.select("User.patronTier")
					.$narrowType<{ patronTier: NotNull }>(),
			),
		/** Their plus server tier, `null` when they aren't a member. */
		withPlusTier: () =>
			refine("User", (qb) =>
				qb.select((eb) => USER_EXTRAS.plusTier(eb).as("plusTier")),
			),
		withCountry: () =>
			refine("User", (qb) =>
				qb.select((eb) => USER_EXTRAS.country(eb).as("country")),
			),
		/** Their custom theme, `null` unless they are a supporter, the tier it is a perk of. */
		withPatronTheme: () =>
			refine("User", (qb) =>
				qb.select(
					asJson(
						sql<CustomTheme | null>`IIF(COALESCE("User"."patronTier", 0) >= 2, "User"."customTheme", null)`,
					).as("customTheme"),
				),
			),
		/** How many entries each tab of their profile lists. Private builds count for their owner only. */
		withTabCounts: () => {
			const viewerId = actorIdOrNull();

			return refine("User", (qb) =>
				qb
					.select((eb) => [
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
							.where((buildEb) =>
								buildEb.or([
									buildEb("Build.isPrivate", "=", 0),
									...(viewerId !== null
										? [buildEb("Build.ownerId", "=", viewerId)]
										: []),
								]),
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
						// indexed union: an OR spanning Art and ArtUserMetadata would scan the whole Art table
						eb
							.selectFrom("Art")
							.innerJoin(
								"UserSubmittedImage",
								"UserSubmittedImage.id",
								"Art.imgId",
							)
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
					}>(),
			);
		},
		/** Notes staff left about them that aren't deleted, newest first, each with its author. */
		withModNotes: () =>
			refine("User", (qb) =>
				qb.select((eb) =>
					jsonArrayFrom(
						eb
							.selectFrom("ModNote")
							.innerJoin("User as Author", "Author.id", "ModNote.authorId")
							.select((noteEb) => [
								"ModNote.id as noteId",
								"ModNote.text",
								"ModNote.createdAt",
								...commonUserSelect(noteEb, { alias: "Author" }),
							])
							.where("ModNote.isDeleted", "=", 0)
							.whereRef("ModNote.userId", "=", "User.id")
							.orderBy("ModNote.createdAt", "desc"),
					).as("modNotes"),
				),
			),
		/** Their bans and unbans by staff, newest first, each with who did it. Automatic bans have no entry. */
		withBanLogs: () =>
			refine("User", (qb) =>
				qb.select((eb) =>
					jsonArrayFrom(
						eb
							.selectFrom("BanLog")
							.innerJoin("User as Staff", "Staff.id", "BanLog.bannedByUserId")
							.select((banLogEb) => [
								"BanLog.banned",
								"BanLog.bannedReason",
								"BanLog.createdAt",
								...commonUserSelect(banLogEb, { alias: "Staff" }),
							])
							.whereRef("BanLog.userId", "=", "User.id")
							.orderBy("BanLog.createdAt", "desc"),
					).as("banLogs"),
				),
			),
	}),
});

/** The user as the session knows them: roles, team and the settings every page reads. Runs on every request. */
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
			jsonObjectFrom(
				eb
					.selectFrom("TeamMember")
					.innerJoin("Team", "Team.id", "TeamMember.teamId")
					.leftJoin(
						"UserSubmittedImage",
						"UserSubmittedImage.id",
						"Team.avatarImgId",
					)
					.select(({ ref }) => [
						"Team.name",
						"Team.customUrl",
						concatUserSubmittedImagePrefix(ref("UserSubmittedImage.url")).as(
							"avatarUrl",
						),
					])
					.where("TeamMember.userId", "=", id),
			).as("team"),
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

export async function findStoredWidgetsByUserId(
	userId: number,
): Promise<Array<Tables["UserWidget"]["widget"]>> {
	const rows = await db
		.selectFrom("UserWidget")
		.innerJoin("User", "User.id", "UserWidget.userId")
		.select(["UserWidget.widget", "User.patronTier"])
		.where("UserWidget.userId", "=", userId)
		.orderBy("UserWidget.index", "asc")
		.execute();

	if (rows.length === 0) return DEFAULT_WIDGETS;

	return widgetsAvailableTo(
		rows.map((row) => row.widget),
		isSupporter({ patronTier: rows[0]!.patronTier }),
	);
}

export async function findWidgetsByUserId(
	userId: number,
): Promise<LoadedWidget[]> {
	const widgets = await findStoredWidgetsByUserId(userId);

	const loadedWidgets = await Promise.all(
		widgets.map(async (widget) => {
			const definition = findWidgetById(widget.id);

			if (!definition) {
				logger.warn(`Unknown widget id found for user ${userId}: ${widget.id}`);
				return null;
			}

			const loader = WIDGET_LOADERS[widget.id as keyof typeof WIDGET_LOADERS];
			const data = loader
				? await loader(userId, widget.settings as any)
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

/** Patrons for the footer marquee, reshuffled each UTC day and slimmed to the fields the chip renders. */
export async function findAllPatronsForFooter() {
	const rows = await users().patrons().withPatronTheme().execute();

	const patrons = rows.map((row) => ({
		id: row.id,
		discordId: row.discordId,
		username: row.username,
		customTheme: row.customTheme
			? R.pick(row.customTheme, PATRON_CHIP_THEME_VARS)
			: null,
	}));

	const { seededShuffle } = seededRandom(dateToYYYYMMDD(new Date()));

	return seededShuffle(patrons);
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

// xxx: maybe TournamentResultRepository?

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

export async function findResultsByUserId(
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
	const page =
		limit !== undefined
			? await findResultPageKeys(userId, filters, { limit, offset })
			: null;

	const calendarEventResultsQuery = baseCalendarEventResultsQuery(
		userId,
		filters,
	)
		.$if(page !== null, (qb) =>
			qb.where("CalendarEventResultTeam.id", "in", page!.calendarEventTeamIds),
		)
		.select(({ eb, fn }) => [
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
					.select((mateEb) => [
						...commonUserSelect(mateEb),
						"CalendarEventResultPlayer.name",
					])
					.whereRef(
						"CalendarEventResultPlayer.teamId",
						"=",
						"CalendarEventResultTeam.id",
					)
					.where((mateEb) =>
						mateEb.or([
							mateEb("CalendarEventResultPlayer.userId", "is", null),
							mateEb("CalendarEventResultPlayer.userId", "!=", userId),
						]),
					),
			).as("mates"),
		]);

	const tournamentResultsQuery = baseTournamentResultsQuery(userId, filters)
		.$if(page !== null, (qb) =>
			qb.where(
				"TournamentResult.tournamentTeamId",
				"in",
				page!.tournamentTeamIds,
			),
		)
		.select(({ eb }) => [
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
					.select((mateEb) => [
						...commonUserSelect(mateEb),
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

	return calendarEventResultsQuery
		.unionAll(tournamentResultsQuery)
		.orderBy("startsAt", "desc")
		.$narrowType<{ startsAt: NotNull }>()
		.execute();
}

/**
 * Identities of the results on one page, newest first. Resolved on their own because the
 * per-row columns of {@link findResultsByUserId} (mates, logos) would otherwise be computed
 * for the user's every result before the sort and limit.
 */
async function findResultPageKeys(
	userId: number,
	filters: ResultsFilters,
	{ limit, offset }: { limit: number; offset?: number },
) {
	const rows = await baseCalendarEventResultsQuery(userId, filters)
		.select((eb) => [
			sql<number | null>`"CalendarEventResultTeam"."id"`.as(
				"calendarEventTeamId",
			),
			sql<number | null>`null`.as("tournamentTeamId"),
			withMaxEventStartTime(eb),
		])
		.unionAll(
			baseTournamentResultsQuery(userId, filters).select((eb) => [
				sql<number | null>`null`.as("calendarEventTeamId"),
				sql<number | null>`"TournamentResult"."tournamentTeamId"`.as(
					"tournamentTeamId",
				),
				withMaxEventStartTime(eb),
			]),
		)
		.orderBy("startsAt", "desc")
		.limit(limit)
		.$if(offset !== undefined, (qb) => qb.offset(offset!))
		.execute();

	return {
		calendarEventTeamIds: rows.flatMap((row) =>
			row.calendarEventTeamId !== null ? [row.calendarEventTeamId] : [],
		),
		tournamentTeamIds: rows.flatMap((row) =>
			row.tournamentTeamId !== null ? [row.tournamentTeamId] : [],
		),
	};
}

export async function countResultsByUserId(
	userId: number,
	filters: ResultsFilters = {},
) {
	const calendarEventResults = await baseCalendarEventResultsQuery(
		userId,
		filters,
	)
		.select(({ fn }) => [fn.countAll<number>().as("count")])
		.executeTakeFirst();

	const tournamentResults = await baseTournamentResultsQuery(userId, filters)
		.select(({ fn }) => [fn.countAll<number>().as("count")])
		.executeTakeFirst();

	return (calendarEventResults?.count ?? 0) + (tournamentResults?.count ?? 0);
}

export async function hasHighlightedResultsByUserId(userId: number) {
	return (
		(await tournamentResultTable.exists({ userId, isHighlight: 1 })) ||
		resultHighlightTable.exists({ userId })
	);
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
		"User.discordUniqueName",
	] as const;
export async function search({
	query,
	limit,
}: {
	query: string;
	limit: number;
}) {
	// one scan over User with exact matches ranked first instead of an exact pass + a fuzzy pass
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

	// the trigram index needs 3+ characters and can't do LIKE wildcards; those queries scan User
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
		// the trigram index prefilters a superset; the LIKE conditions above stay the source of truth
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

/** The friend code the user submitted last. */
export async function findCurrentFriendCodeByUserId(userId: number) {
	const [current] = await friendCodeTable.findManyBy(
		{ userId },
		{ limit: 1, orderBy: [["createdAt", "desc"]] },
	);

	return current;
}

/** All friend codes a user has ever submitted. */
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

export async function anyUserPrefersNoScreen(
	userIds: number[],
): Promise<boolean> {
	if (userIds.length === 0) return false;

	return (
		(await users().whereIdIn(userIds).where({ noScreen: true }).count()) > 0
	);
}

export function insertFriendCode(args: TablesInsertable["UserFriendCode"]) {
	cachedFriendCodes?.add(args.friendCode);

	return friendCodeTable.insert(args);
}

/** Replaces the user's widgets, i.e. their profile layout, keeping the given order. */
export function upsertWidgets(
	userId: number,
	widgets: Array<Tables["UserWidget"]["widget"]>,
) {
	return db.transaction().execute(async (trx) => {
		await widgetTable.delete({ userId }, trx);

		await widgetTable.insertMany(
			widgets.map((widget, index) => ({ userId, index, widget })),
			trx,
		);
	});
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
		| "youtubeName"
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
	| "customUrl"
	| "customName"
	| "pronouns"
	| "inGameName"
	| "commissionText"
	| "commissionsOpen"
> & {
	favoriteTrophyIds?: number[] | null;
	hiddenTrophyIds?: number[] | null;
	customAvatarImgId?: number | null;
};
/** Updates the actor's profile, deleting the custom avatar image it no longer uses. */
export function updateOwnProfile(args: UpdateProfileArgs) {
	const userId = actorId();
	return db.transaction().execute(async (trx) => {
		const current = await userTable.findById(userId, trx);
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

		await userTable.updateById(
			userId,
			{
				country: args.country,
				customUrl: args.customUrl,
				customName: args.customName,
				pronouns: args.pronouns,
				inGameName: args.inGameName,
				favoriteTrophyIds: args.favoriteTrophyIds ?? null,
				hiddenTrophyIds: args.hiddenTrophyIds ?? null,
				commissionText: args.commissionText,
				commissionsOpen: args.commissionsOpen,
				commissionsOpenedAt: args.commissionsOpen
					? databaseTimestampNow()
					: null,
				customAvatarImgId: args.customAvatarImgId ?? null,
			},
			trx,
		);
	});
}

/** Bulk-sets each user's latest LUTI division. Used by the `ComputeLutiDivs` routine. */
export function updateManyDivs(
	updates: Array<{ userId: number; div: string; divSeason: number | null }>,
) {
	if (updates.length === 0) return;

	return db.transaction().execute(async (trx) => {
		for (const { userId, div, divSeason } of updates) {
			await userTable.updateById(userId, { div, divSeason }, trx);
		}
	});
}

export function updateOwnCustomTheme(css: CustomTheme | null) {
	return userTable.updateById(actorId(), { customTheme: css });
}

/** Merges the given preferences into the actor's current ones. */
export function updateOwnPreferences(newPreferences: UserPreferences) {
	const userId = actorId();
	return db.transaction().execute(async (trx) => {
		const current = (await userTable.findById(userId, trx))?.preferences;

		await userTable.updateById(
			userId,
			{ preferences: { ...current, ...newPreferences } },
			trx,
		);
	});
}

type UpdateResultHighlightsArgs = {
	resultTeamIds: Array<number>;
	resultTournamentTeamIds: Array<number>;
};
export function updateOwnResultHighlights(args: UpdateResultHighlightsArgs) {
	const userId = actorId();
	return db.transaction().execute(async (trx) => {
		await resultHighlightTable.delete({ userId }, trx);

		await resultHighlightTable.insertMany(
			args.resultTeamIds.map((teamId) => ({ userId, teamId })),
			trx,
		);

		await tournamentResultTable.update({ userId }, { isHighlight: 0 }, trx);

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
	return userTable.updateById(actorId(), { buildSorting });
}

export type UpdatePatronDataArgs = Array<
	Pick<Tables["User"], "discordId" | "patronTier" | "patronStartedAt">
>;
export function updatePatronData(patrons: UpdatePatronDataArgs) {
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

		for (const patron of patrons) {
			await userTable.update(
				{ discordId: patron.discordId },
				{
					patronTier: patron.patronTier,
					patronStartedAt: patron.patronStartedAt,
					patronExpiresAt: null,
				},
				trx,
			);
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

function identifierFilter(
	eb: ExpressionBuilder<DB, "User">,
	identifier: string,
) {
	// we don't want to parse discord id's as numbers (length = 18)
	const parsedId = identifier.length < 10 ? safeNumberParse(identifier) : null;
	if (parsedId) {
		return eb("User.id", "=", parsedId);
	}

	if (/^\d+$/.test(identifier)) {
		return eb("User.discordId", "=", identifier);
	}

	return eb("User.customUrl", "=", identifier);
}
