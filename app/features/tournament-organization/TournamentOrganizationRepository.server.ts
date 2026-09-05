import { isFuture } from "date-fns";
import { type ExpressionBuilder, type NotNull, sql } from "kysely";
import * as R from "remeda";
import { db } from "~/db/sql";
import type { DB, Tables, TablesInsertable } from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";
import {
	TIER_HISTORY_LENGTH,
	type TournamentTierNumber,
	updateTierHistory,
} from "~/features/tournament/core/tiering";
import {
	databaseTimestampNow,
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import {
	commonUserSelect,
	concatUserSubmittedImagePrefix,
	jsonArrayFrom,
	tournamentLogoWithDefault,
} from "~/utils/kysely.server";
import { toDBBoolean } from "~/utils/sql";
import { mySlugify } from "~/utils/urls";
import { TOURNAMENT_SERIES_EVENTS_PER_PAGE } from "./tournament-organization-constants";

interface CreateArgs {
	ownerId: number;
	name: string;
}

export function insert(args: CreateArgs) {
	return db.transaction().execute(async (trx) => {
		const org = await trx
			.insertInto("TournamentOrganization")
			.values({
				name: args.name,
				slug: mySlugify(args.name),
			})
			.returning(["id", "slug"])
			.executeTakeFirstOrThrow();

		await trx
			.insertInto("TournamentOrganizationMember")
			.values({
				organizationId: org.id,
				userId: args.ownerId,
				role: "ADMIN",
			})
			.execute();

		return org;
	});
}

export async function findBySlug(slug: string) {
	const organization = await db
		.selectFrom("TournamentOrganization")
		.leftJoin(
			"UserSubmittedImage",
			"UserSubmittedImage.id",
			"TournamentOrganization.avatarImgId",
		)
		.select(({ eb }) => [
			"TournamentOrganization.id",
			"TournamentOrganization.name",
			"TournamentOrganization.description",
			"TournamentOrganization.socials",
			"TournamentOrganization.slug",
			"TournamentOrganization.isEstablished",
			"TournamentOrganization.avatarImgId",
			concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
				"avatarUrl",
			),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentOrganizationMember")
					.innerJoin("User", "User.id", "TournamentOrganizationMember.userId")
					.select((eb) => [
						"TournamentOrganizationMember.role",
						"TournamentOrganizationMember.roleDisplayName",
						...commonUserSelect(eb),
					])
					.whereRef(
						"TournamentOrganizationMember.organizationId",
						"=",
						"TournamentOrganization.id",
					)
					.orderBy(
						sql`coalesce(TournamentOrganizationMember.roleDisplayName, TournamentOrganizationMember.role)`,
						"asc",
					)
					.orderBy("User.username", "asc"),
			).as("members"),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentOrganizationSeries")
					.select([
						"TournamentOrganizationSeries.id",
						"TournamentOrganizationSeries.name",
						"TournamentOrganizationSeries.substringMatches",
						"TournamentOrganizationSeries.showLeaderboard",
						"TournamentOrganizationSeries.description",
						"TournamentOrganizationSeries.tierHistory",
					])
					.whereRef(
						"TournamentOrganizationSeries.organizationId",
						"=",
						"TournamentOrganization.id",
					),
			).as("series"),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentOrganizationBadge")
					.innerJoin("Badge", "Badge.id", "TournamentOrganizationBadge.badgeId")
					.select(["Badge.id", "Badge.displayName", "Badge.code", "Badge.hue"])
					.whereRef(
						"TournamentOrganizationBadge.organizationId",
						"=",
						"TournamentOrganization.id",
					),
			).as("badges"),
		])
		.where("TournamentOrganization.slug", "=", slug)
		.executeTakeFirst();

	if (!organization) return null;

	const orgAdminUserIds = organization.members
		.filter((member) => member.role === "ADMIN")
		.map((member) => member.id);

	return {
		...organization,
		permissions: {
			EDIT: orgAdminUserIds,
			BAN: orgAdminUserIds,
		},
	};
}

export function findByUserId(
	userId: number,
	{
		roles = [],
	}: {
		/** If set, filters organizations by user's org member role */
		roles?: Array<Tables["TournamentOrganizationMember"]["role"]>;
	} = {},
) {
	return db
		.selectFrom("TournamentOrganizationMember")
		.innerJoin(
			"TournamentOrganization",
			"TournamentOrganization.id",
			"TournamentOrganizationMember.organizationId",
		)
		.leftJoin(
			"UserSubmittedImage",
			"UserSubmittedImage.id",
			"TournamentOrganization.avatarImgId",
		)
		.select(({ eb }) => [
			"TournamentOrganization.id",
			"TournamentOrganization.name",
			"TournamentOrganization.slug",
			"TournamentOrganization.isEstablished",
			"TournamentOrganizationMember.role",
			"TournamentOrganizationMember.roleDisplayName",
			concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
				"logoUrl",
			),
		])
		.where("TournamentOrganizationMember.userId", "=", userId)
		.$if(roles.length > 0, (qb) =>
			qb.where("TournamentOrganizationMember.role", "in", roles),
		)
		.orderBy("TournamentOrganization.id", "asc")
		.execute();
}

export function searchByName({
	query,
	limit,
}: {
	query: string;
	limit: number;
}) {
	return db
		.selectFrom("TournamentOrganization")
		.leftJoin(
			"UserSubmittedImage",
			"UserSubmittedImage.id",
			"TournamentOrganization.avatarImgId",
		)
		.select(({ eb }) => [
			"TournamentOrganization.id",
			"TournamentOrganization.name",
			"TournamentOrganization.slug",
			concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
				"avatarUrl",
			),
		])
		.where(({ eb, ref }) =>
			eb(
				sql`unaccent(${ref("TournamentOrganization.name")})`,
				"like",
				sql`unaccent(${`%${query}%`})`,
			),
		)
		.orderBy("TournamentOrganization.name", "asc")
		.limit(limit)
		.execute();
}

export function findOneById(id: number) {
	return db
		.selectFrom("TournamentOrganization")
		.leftJoin(
			"UserSubmittedImage",
			"UserSubmittedImage.id",
			"TournamentOrganization.avatarImgId",
		)
		.select(({ eb }) => [
			"TournamentOrganization.id",
			"TournamentOrganization.name",
			"TournamentOrganization.slug",
			concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
				"avatarUrl",
			),
		])
		.where("TournamentOrganization.id", "=", id)
		.executeTakeFirst();
}

interface FindEventsByMonthArgs {
	month: number;
	year: number;
	organizationId: number;
}

const findEventsBaseQuery = (organizationId: number) =>
	db
		.selectFrom("CalendarEvent")
		.innerJoin(
			"CalendarEventDate",
			"CalendarEventDate.eventId",
			"CalendarEvent.id",
		)
		.select(({ eb }) => [
			"CalendarEvent.id as eventId",
			"CalendarEvent.name",
			"CalendarEvent.tournamentId",
			eb.fn.min("CalendarEventDate.startsAt").as("startsAt"),
			tournamentLogoWithDefault(eb).as("logoUrl"),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentResult")
					.innerJoin(
						"TournamentTeam",
						"TournamentTeam.id",
						"TournamentResult.tournamentTeamId",
					)
					.leftJoin("AllTeam", "TournamentTeam.teamId", "AllTeam.id")
					.leftJoin("UserSubmittedImage as u1", "AllTeam.avatarImgId", "u1.id")
					.leftJoin(
						"UserSubmittedImage as u2",
						"TournamentTeam.avatarImgId",
						"u2.id",
					)
					.select(({ eb: innerEb }) => [
						"TournamentTeam.id",
						"TournamentTeam.name",
						concatUserSubmittedImagePrefix(
							innerEb.fn.coalesce("u1.url", "u2.url"),
						).as("avatarUrl"),
						jsonArrayFrom(
							innerEb
								.selectFrom("TournamentResult as WinnerResult")
								.innerJoin("User", "User.id", "WinnerResult.userId")
								.select((winnerEb) => commonUserSelect(winnerEb))
								.whereRef(
									"WinnerResult.tournamentTeamId",
									"=",
									"TournamentTeam.id",
								)
								.where("WinnerResult.placement", "=", 1)
								.orderBy("User.id", "asc"),
						).as("members"),
					])
					.whereRef(
						"TournamentResult.tournamentId",
						"=",
						"CalendarEvent.tournamentId",
					)
					.where("TournamentResult.placement", "=", 1)
					.groupBy("TournamentTeam.id")
					.orderBy("TournamentTeam.id", "asc"),
			).as("tournamentWinners"),
			jsonArrayFrom(
				eb
					.selectFrom("CalendarEventResultTeam")
					.select(({ eb: innerEb }) => [
						"CalendarEventResultTeam.id",
						"CalendarEventResultTeam.name",
						sql<null>`null`.as("avatarUrl"),
						jsonArrayFrom(
							innerEb
								.selectFrom("CalendarEventResultPlayer")
								.innerJoin(
									"User",
									"User.id",
									"CalendarEventResultPlayer.userId",
								)
								.select((playerEb) => commonUserSelect(playerEb))
								.whereRef(
									"CalendarEventResultPlayer.teamId",
									"=",
									"CalendarEventResultTeam.id",
								)
								.orderBy("User.id", "asc"),
						).as("members"),
					])
					.whereRef("CalendarEventResultTeam.eventId", "=", "CalendarEvent.id")
					.where("CalendarEventResultTeam.placement", "=", 1)
					.orderBy("CalendarEventResultTeam.id", "asc"),
			).as("eventWinners"),
		])
		.where("CalendarEvent.organizationId", "=", organizationId)
		.where("CalendarEvent.hidden", "=", 0)
		.groupBy("CalendarEvent.id");

const mapEvent = <
	T extends {
		tournamentId: number | null;
		logoUrl: string;
	},
>(
	event: T,
) => {
	return {
		...event,
		logoUrl: !event.tournamentId ? null : event.logoUrl,
	};
};

export async function findEventsByMonth({
	month,
	year,
	organizationId,
}: FindEventsByMonthArgs) {
	const firstDayOfTheMonth = new Date(Date.UTC(year, month, 1));
	const firstDayOfTheNextMonth = new Date(Date.UTC(year, month + 1, 1));

	// a bit of margin for timezones, filtered in the frontend code
	firstDayOfTheMonth.setUTCDate(firstDayOfTheMonth.getUTCDate() - 1);
	firstDayOfTheNextMonth.setUTCDate(firstDayOfTheNextMonth.getUTCDate() + 1);

	const events = await findEventsBaseQuery(organizationId)
		.where(
			"CalendarEventDate.startsAt",
			">=",
			dateToDatabaseTimestamp(firstDayOfTheMonth),
		)
		.where(
			"CalendarEventDate.startsAt",
			"<=",
			dateToDatabaseTimestamp(firstDayOfTheNextMonth),
		)
		.orderBy("CalendarEventDate.startsAt", "asc")
		.execute();

	return events.map(mapEvent);
}

/** Every tournament series of every organization. */
export function findAllSeries() {
	return db
		.selectFrom("TournamentOrganizationSeries")
		.select([
			"TournamentOrganizationSeries.organizationId",
			"TournamentOrganizationSeries.substringMatches",
			"TournamentOrganizationSeries.tierHistory",
		])
		.execute();
}

/**
 * Team counts of each organization's started tournaments within the window, oldest first.
 * Counts what the tournament page shows: placeholder teams excluded, dropped out ones included.
 */
export function findAllOrganizedTournamentTeamCounts({
	startedAfter,
}: {
	startedAfter: number;
}) {
	return db
		.selectFrom("CalendarEvent")
		.innerJoin(
			"CalendarEventDate",
			"CalendarEventDate.eventId",
			"CalendarEvent.id",
		)
		.select((eb) => [
			"CalendarEvent.name",
			"CalendarEvent.organizationId",
			eb.fn.min("CalendarEventDate.startsAt").as("startsAt"),
			eb
				.selectFrom("TournamentTeam")
				.select(({ fn }) => fn.countAll<number>().as("count"))
				.whereRef(
					"TournamentTeam.tournamentId",
					"=",
					"CalendarEvent.tournamentId",
				)
				.where("TournamentTeam.isPlaceholder", "=", 0)
				.as("teamCount"),
		])
		.$narrowType<{ organizationId: NotNull; teamCount: NotNull }>()
		.where("CalendarEvent.organizationId", "is not", null)
		.where("CalendarEvent.tournamentId", "is not", null)
		.where("CalendarEvent.hidden", "=", 0)
		.where("CalendarEventDate.startsAt", ">=", startedAfter)
		.where("CalendarEventDate.startsAt", "<=", databaseTimestampNow())
		.groupBy("CalendarEvent.id")
		.orderBy("startsAt", "asc")
		.execute();
}

export function findAllUnfinalizedEvents(organizationId: number) {
	return db
		.selectFrom("Tournament")
		.innerJoin("CalendarEvent", "CalendarEvent.tournamentId", "Tournament.id")
		.select(["Tournament.id"])
		.where("Tournament.isFinalized", "=", 0)
		.where("CalendarEvent.organizationId", "=", organizationId)
		.execute();
}

const findSeriesEventsBaseQuery = ({
	organizationId,
	substringMatches,
}: {
	organizationId: number;
	substringMatches: string[];
}) =>
	findEventsBaseQuery(organizationId)
		.where((eb) =>
			eb.or(
				substringMatches.map((match) =>
					eb("CalendarEvent.name", "like", `%${match}%`),
				),
			),
		)
		.orderBy("CalendarEventDate.startsAt", "desc");

export async function findPaginatedEventsBySeries({
	organizationId,
	substringMatches,
	page,
}: {
	organizationId: number;
	substringMatches: string[];
	page: number;
}) {
	const events = await findSeriesEventsBaseQuery({
		organizationId,
		substringMatches,
	})
		.limit(TOURNAMENT_SERIES_EVENTS_PER_PAGE)
		.offset((page - 1) * TOURNAMENT_SERIES_EVENTS_PER_PAGE)
		.execute();

	return events.map(mapEvent);
}

/**
 * Every event of the series, newest first, with only what the leaderboard and series header need:
 * the winners of {@link findPaginatedEventsBySeries} are far too costly across a whole series.
 */
export async function findAllEventsBySeries({
	organizationId,
	substringMatches,
}: {
	organizationId: number;
	substringMatches: string[];
}) {
	const events = await db
		.selectFrom("CalendarEvent")
		.innerJoin(
			"CalendarEventDate",
			"CalendarEventDate.eventId",
			"CalendarEvent.id",
		)
		.select(({ eb }) => [
			"CalendarEvent.id as eventId",
			"CalendarEvent.tournamentId",
			eb.fn.min("CalendarEventDate.startsAt").as("startsAt"),
			tournamentLogoWithDefault(eb).as("logoUrl"),
		])
		.where("CalendarEvent.organizationId", "=", organizationId)
		.where("CalendarEvent.hidden", "=", 0)
		.where((eb) =>
			eb.or(
				substringMatches.map((match) =>
					eb("CalendarEvent.name", "like", `%${match}%`),
				),
			),
		)
		.groupBy("CalendarEvent.id")
		.orderBy("CalendarEventDate.startsAt", "desc")
		.execute();

	return events.map(mapEvent);
}

/** Series belonging to any of the given organizations. */
export async function findAllSeriesByOrganizationIds(
	organizationIds: number[],
) {
	if (organizationIds.length === 0) return [];

	return db
		.selectFrom("TournamentOrganizationSeries")
		.select([
			"TournamentOrganizationSeries.id",
			"TournamentOrganizationSeries.name",
			"TournamentOrganizationSeries.organizationId",
			"TournamentOrganizationSeries.substringMatches",
		])
		.where("TournamentOrganizationSeries.organizationId", "in", organizationIds)
		.execute();
}

/**
 * Events of the series the user won, oldest first, hosted tournaments and hand-reported results
 * alike. Only finalized tournaments have results, so ongoing events are never included.
 */
export async function findAllSeriesWinsByUserId({
	organizationId,
	substringMatches,
	userId,
	excludeTournamentId,
}: {
	organizationId: number;
	substringMatches: string[];
	userId: number;
	excludeTournamentId: number;
}) {
	const isEventOfTheSeries = (eb: ExpressionBuilder<DB, "CalendarEvent">) =>
		eb.and([
			eb("CalendarEvent.organizationId", "=", organizationId),
			eb("CalendarEvent.hidden", "=", 0),
			eb.or(
				substringMatches.map((match) =>
					eb("CalendarEvent.name", "like", `%${match}%`),
				),
			),
		]);

	const [tournamentWins, reportedWins] = await Promise.all([
		db
			.selectFrom("TournamentResult")
			.innerJoin(
				"CalendarEvent",
				"CalendarEvent.tournamentId",
				"TournamentResult.tournamentId",
			)
			.innerJoin(
				"CalendarEventDate",
				"CalendarEventDate.eventId",
				"CalendarEvent.id",
			)
			.select(({ fn }) => [
				"CalendarEvent.name",
				fn.min("CalendarEventDate.startsAt").as("startsAt"),
			])
			.where("TournamentResult.userId", "=", userId)
			.where("TournamentResult.placement", "=", 1)
			.where("TournamentResult.tournamentId", "!=", excludeTournamentId)
			.where(isEventOfTheSeries)
			.groupBy("CalendarEvent.id")
			.execute(),
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
			.innerJoin(
				"CalendarEventDate",
				"CalendarEventDate.eventId",
				"CalendarEvent.id",
			)
			.select(({ fn }) => [
				"CalendarEvent.name",
				fn.min("CalendarEventDate.startsAt").as("startsAt"),
			])
			.where("CalendarEventResultPlayer.userId", "=", userId)
			.where("CalendarEventResultTeam.placement", "=", 1)
			// a tournament of the site reports its own results, counted above
			.where("CalendarEvent.tournamentId", "is", null)
			.where(isEventOfTheSeries)
			.groupBy("CalendarEvent.id")
			.execute(),
	]);

	return R.sortBy(
		[...tournamentWins, ...reportedWins].map((win) => ({
			name: win.name,
			startTime: databaseTimestampToDate(win.startsAt),
		})),
		(win) => win.startTime.getTime(),
	);
}

/**
 * Distinct players on checked-in (not checked out) teams who played at least one match of the
 * organization's tournaments starting within `[startTime, endTime]` (database timestamps, seconds).
 */
export async function countActiveParticipants({
	organizationId,
	startTime,
	endTime,
}: {
	organizationId: number;
	startTime: number;
	endTime: number;
}) {
	const result = await db
		.selectFrom("CalendarEvent as ce")
		.innerJoin("CalendarEventDate as ced", "ced.eventId", "ce.id")
		.innerJoin("Tournament as t", "t.id", "ce.tournamentId")
		.innerJoin("TournamentTeam as tt", "tt.tournamentId", "t.id")
		.innerJoin(
			"TournamentTeamCheckIn as ttci",
			"ttci.tournamentTeamId",
			"tt.id",
		)
		.innerJoin(
			"TournamentMatchGameResultParticipant as tmgrp",
			"tmgrp.tournamentTeamId",
			"tt.id",
		)
		.select(({ fn }) => fn.count<number>("tmgrp.userId").distinct().as("count"))
		.where("ce.organizationId", "=", organizationId)
		.where("ced.startsAt", ">=", startTime)
		.where("ced.startsAt", "<", endTime)
		.where("ttci.checkedInAt", "is not", null)
		.where("ttci.isCheckOut", "=", 0)
		.executeTakeFirst();

	return result?.count ?? 0;
}

interface UpdateArgs
	extends Pick<
		Tables["TournamentOrganization"],
		"id" | "name" | "description" | "socials"
	> {
	/** Omit to leave the current logo unchanged; `null` clears it. */
	avatarImgId?: number | null;
	members: Array<
		Pick<
			Tables["TournamentOrganizationMember"],
			"role" | "roleDisplayName" | "userId"
		>
	>;
	series: Array<
		Pick<Tables["TournamentOrganizationSeries"], "description" | "name"> & {
			showLeaderboard: boolean;
		}
	>;
	badges: number[];
}

export function update({
	id,
	name,
	description,
	socials,
	avatarImgId,
	members,
	series,
	badges,
}: UpdateArgs) {
	return db.transaction().execute(async (trx) => {
		if (avatarImgId !== undefined) {
			const current = await trx
				.selectFrom("TournamentOrganization")
				.select("avatarImgId")
				.where("id", "=", id)
				.executeTakeFirst();

			// a removed or replaced logo leaves its submitted image row unreferenced
			if (current?.avatarImgId && current.avatarImgId !== avatarImgId) {
				await trx
					.deleteFrom("UnvalidatedUserSubmittedImage")
					.where("id", "=", current.avatarImgId)
					.execute();
			}
		}

		const updatedOrg = await trx
			.updateTable("TournamentOrganization")
			.set({
				name,
				description,
				slug: mySlugify(name),
				socials: socials ? JSON.stringify(socials) : null,
				...(avatarImgId !== undefined ? { avatarImgId } : {}),
			})
			.where("id", "=", id)
			.returningAll()
			.executeTakeFirstOrThrow();

		await trx
			.deleteFrom("TournamentOrganizationMember")
			.where("organizationId", "=", id)
			.execute();

		await trx
			.insertInto("TournamentOrganizationMember")
			.values(
				members.map((member) => ({
					organizationId: id,
					...member,
				})),
			)
			.execute();

		await trx
			.deleteFrom("TournamentOrganizationSeries")
			.where("organizationId", "=", id)
			.execute();

		if (series.length > 0) {
			const insertedSeries = await trx
				.insertInto("TournamentOrganizationSeries")
				.values(
					series.map((s) => ({
						organizationId: id,
						name: s.name,
						description: s.description,
						substringMatches: JSON.stringify([s.name.toLowerCase()]),
						showLeaderboard: toDBBoolean(s.showLeaderboard),
					})),
				)
				.returning(["id", "substringMatches"])
				.execute();

			const finalizedTournaments = await trx
				.selectFrom("Tournament")
				.innerJoin(
					"CalendarEvent",
					"CalendarEvent.tournamentId",
					"Tournament.id",
				)
				.innerJoin(
					"CalendarEventDate",
					"CalendarEventDate.eventId",
					"CalendarEvent.id",
				)
				.select([
					"Tournament.id as tournamentId",
					"CalendarEvent.name",
					"Tournament.tier",
					"CalendarEventDate.startsAt",
				])
				.where("Tournament.isFinalized", "=", 1)
				.where("CalendarEvent.organizationId", "=", id)
				.where("CalendarEvent.hidden", "=", 0)
				.orderBy("CalendarEventDate.startsAt", "asc")
				.execute();

			for (const s of insertedSeries) {
				const matchingTiers = finalizedTournaments
					.filter((t) => {
						const eventNameLower = t.name.toLowerCase();
						return s.substringMatches.some((match) =>
							eventNameLower.includes(match.toLowerCase()),
						);
					})
					.filter((t) => t.tier !== null)
					.map((t) => t.tier);

				if (matchingTiers.length === 0) continue;

				const tierHistory = matchingTiers.slice(-TIER_HISTORY_LENGTH);

				await trx
					.updateTable("TournamentOrganizationSeries")
					.set({ tierHistory: JSON.stringify(tierHistory) })
					.where("id", "=", s.id)
					.execute();
			}
		}

		await trx
			.deleteFrom("TournamentOrganizationBadge")
			.where("TournamentOrganizationBadge.organizationId", "=", id)
			.execute();

		await trx
			.insertInto("TournamentOrganizationBadge")
			.values(
				badges.map((badgeId) => ({
					organizationId: id,
					badgeId,
				})),
			)
			.execute();

		return updatedOrg;
	});
}

export function deleteOwnMembership(organizationId: number) {
	return db
		.deleteFrom("TournamentOrganizationMember")
		.where("organizationId", "=", organizationId)
		.where("userId", "=", actorId())
		.execute();
}

/** Bans a user from the organization, updating the entry if they already are. */
export function upsertBannedUser(
	args: Omit<TablesInsertable["TournamentOrganizationBannedUser"], "updatedAt">,
) {
	return db
		.insertInto("TournamentOrganizationBannedUser")
		.values({ ...args, updatedAt: databaseTimestampNow() })
		.execute();
}

/** Removes a user from the organization's banned list. */
export function unbanUser({
	organizationId,
	userId,
}: {
	organizationId: number;
	userId: number;
}) {
	return db
		.deleteFrom("TournamentOrganizationBannedUser")
		.where("organizationId", "=", organizationId)
		.where("userId", "=", userId)
		.execute();
}

/** All users banned by the organization. */
export function findAllBannedUsersByOrganizationId(organizationId: number) {
	return db
		.selectFrom("TournamentOrganizationBannedUser")
		.innerJoin("User", "User.id", "TournamentOrganizationBannedUser.userId")
		.select((eb) => [
			"TournamentOrganizationBannedUser.privateNote",
			"TournamentOrganizationBannedUser.updatedAt",
			"TournamentOrganizationBannedUser.expiresAt",
			...commonUserSelect(eb),
		])
		.where(
			"TournamentOrganizationBannedUser.organizationId",
			"=",
			organizationId,
		)
		.orderBy("TournamentOrganizationBannedUser.updatedAt", "desc")
		.execute();
}

/** Whether the organization has banned the user. */
export async function isUserBannedByOrganization({
	organizationId,
	userId,
}: {
	organizationId: number;
	userId: number;
}) {
	const result = await db
		.selectFrom("TournamentOrganizationBannedUser")
		.select(["userId", "expiresAt"])
		.where("organizationId", "=", organizationId)
		.where("userId", "=", userId)
		.executeTakeFirst();

	if (!result) return false;

	if (!result.expiresAt) return true;

	return isFuture(databaseTimestampToDate(result.expiresAt));
}

/** How many organizations the user is a member of. */
export async function countOrganizationsByUserId(userId: number) {
	const result = await db
		.selectFrom("TournamentOrganizationMember")
		.select((eb) => eb.fn.count("organizationId").as("count"))
		.where("userId", "=", userId)
		.executeTakeFirstOrThrow();

	return Number(result.count);
}

/** Sets the organization's `isEstablished` flag. */
export function updateIsEstablished(
	organizationId: number,
	isEstablished: boolean,
) {
	return db
		.updateTable("TournamentOrganization")
		.set({ isEstablished: toDBBoolean(isEstablished) })
		.where("id", "=", organizationId)
		.execute();
}

export function deleteById(organizationId: number) {
	return db
		.deleteFrom("TournamentOrganization")
		.where("id", "=", organizationId)
		.execute();
}

export async function updateSeriesTierHistory({
	organizationId,
	eventName,
	newTier,
}: {
	organizationId: number;
	eventName: string;
	newTier: TournamentTierNumber;
}) {
	const series = await db
		.selectFrom("TournamentOrganizationSeries")
		.select(["id", "substringMatches", "tierHistory"])
		.where("organizationId", "=", organizationId)
		.execute();

	const eventNameLower = eventName.toLowerCase();
	const matchingSeries = series.find((s) =>
		s.substringMatches.some((match) =>
			eventNameLower.includes(match.toLowerCase()),
		),
	);

	if (!matchingSeries) return;

	const newTierHistory = updateTierHistory(matchingSeries.tierHistory, newTier);

	await db
		.updateTable("TournamentOrganizationSeries")
		.set({ tierHistory: JSON.stringify(newTierHistory) })
		.where("id", "=", matchingSeries.id)
		.execute();
}
