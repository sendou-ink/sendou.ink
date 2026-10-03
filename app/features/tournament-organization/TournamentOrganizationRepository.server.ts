import { isFuture } from "date-fns";
import {
	type ExpressionBuilder,
	type NotNull,
	sql,
	type Transaction,
} from "kysely";
import * as R from "remeda";
import { crud } from "~/db/crud";
import { defineQuery, mapRows, refine } from "~/db/entity-query";
import { db } from "~/db/sql";
import type { DB, Tables, TablesInsertable } from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";
import { TIER_HISTORY_LENGTH } from "~/features/tournament/core/tiering";
import {
	databaseTimestampNow,
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import {
	calendarEventNameMatchesSeries,
	commonUserSelect,
	concatUserSubmittedImagePrefix,
	jsonArrayFrom,
	jsonObjectFrom,
	tournamentLogoWithDefault,
} from "~/utils/kysely.server";
import { mySlugify } from "~/utils/urls";
import { TOURNAMENT_SERIES_EVENTS_PER_PAGE } from "./tournament-organization-constants";

const organizationTable = crud("TournamentOrganization");
const memberTable = crud("TournamentOrganizationMember");
const seriesTable = crud("TournamentOrganizationSeries");
const badgeTable = crud("TournamentOrganizationBadge");
const bannedUserTable = crud("TournamentOrganizationBannedUser");
const unvalidatedImageTable = crud("UnvalidatedUserSubmittedImage");

// the slug follows the name and a replaced logo's image is deleted, both through `update`
export const { updateById, deleteById } = organizationTable.except(
	"name",
	"slug",
	"avatarImgId",
);

/** Tournament organizations in the order they were created. */
export const organizations = defineQuery({
	root: "TournamentOrganization",
	select: (qb) =>
		qb.select([
			"TournamentOrganization.id",
			"TournamentOrganization.name",
			"TournamentOrganization.slug",
		]),
	defaultSort: [["TournamentOrganization.id", "asc"]],
	vocabulary: () => ({
		/** Organizations whose name contains the text, accents ignored, alphabetically. */
		nameContaining: (text: string) =>
			refine("TournamentOrganization", (qb) =>
				qb.where(({ eb, ref }) =>
					eb(
						sql`unaccent(${ref("TournamentOrganization.name")})`,
						"like",
						sql`unaccent(${`%${text}%`})`,
					),
				),
			).sortedBy(["TournamentOrganization.name", "asc"]),
		/** Organizations the user is a member of with their `role` and `roleDisplayName`, only the given roles when there are some. */
		forMember: (
			userId: number,
			roles: ReadonlyArray<Tables["TournamentOrganizationMember"]["role"]> = [],
		) =>
			refine("TournamentOrganization", (qb) => {
				const memberships = qb
					.innerJoin(
						"TournamentOrganizationMember as Membership",
						"Membership.organizationId",
						"TournamentOrganization.id",
					)
					.where("Membership.userId", "=", userId)
					.select(["Membership.role", "Membership.roleDisplayName"]);

				return roles.length > 0
					? memberships.where("Membership.role", "in", roles)
					: memberships;
			}),
		/** The logo's `avatarUrl`, `null` while it awaits validation. */
		withLogo: () =>
			refine("TournamentOrganization", (qb) =>
				qb.select((eb) =>
					concatUserSubmittedImagePrefix(
						eb
							.selectFrom("UserSubmittedImage")
							.select("UserSubmittedImage.url")
							.whereRef(
								"UserSubmittedImage.id",
								"=",
								"TournamentOrganization.avatarImgId",
							)
							.$asScalar(),
					).as("avatarUrl"),
				),
			),
		/** Members with their roles, by role (the displayed name of it when set) and then by username. */
		withMembers: () =>
			refine("TournamentOrganization", (qb) =>
				qb.select((eb) =>
					jsonArrayFrom(
						eb
							.selectFrom("TournamentOrganizationMember")
							.innerJoin(
								"User",
								"User.id",
								"TournamentOrganizationMember.userId",
							)
							.select((memberEb) => [
								"TournamentOrganizationMember.role",
								"TournamentOrganizationMember.roleDisplayName",
								...commonUserSelect(memberEb),
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
				),
			),
		withSeries: () =>
			refine("TournamentOrganization", (qb) =>
				qb.select((eb) =>
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
				),
			),
		/** Badges the organization may award in its tournaments. */
		withBadges: () =>
			refine("TournamentOrganization", (qb) =>
				qb.select((eb) =>
					jsonArrayFrom(
						eb
							.selectFrom("TournamentOrganizationBadge")
							.innerJoin(
								"Badge",
								"Badge.id",
								"TournamentOrganizationBadge.badgeId",
							)
							.select([
								"Badge.id",
								"Badge.displayName",
								"Badge.code",
								"Badge.hue",
							])
							.whereRef(
								"TournamentOrganizationBadge.organizationId",
								"=",
								"TournamentOrganization.id",
							),
					).as("badges"),
				),
			),
		/** The organization's admins may edit it and ban users from its tournaments. */
		withPermissions: () =>
			mapRows(
				"TournamentOrganization",
				(row: {
					members: Array<{
						id: number;
						role: Tables["TournamentOrganizationMember"]["role"];
					}>;
				}) => {
					const adminIds = row.members
						.filter((member) => member.role === "ADMIN")
						.map((member) => member.id);

					return { permissions: { EDIT: adminIds, BAN: adminIds } };
				},
			),
	}),
});

/** Users banned by organizations, the latest ban first. Expired bans are included. */
export const bannedUsers = defineQuery({
	root: "TournamentOrganizationBannedUser",
	select: (qb) =>
		qb.select([
			"TournamentOrganizationBannedUser.privateNote",
			"TournamentOrganizationBannedUser.updatedAt",
			"TournamentOrganizationBannedUser.expiresAt",
		]),
	defaultSort: [["TournamentOrganizationBannedUser.updatedAt", "desc"]],
	vocabulary: () => ({
		// not UserRepository.withUser: importing it closes a cycle back here through the
		// portfolio widgets, and tentativeTiers reads `series` while this module still loads
		withUser: () =>
			refine("TournamentOrganizationBannedUser", (qb) =>
				qb.select((eb) =>
					jsonObjectFrom(
						eb
							.selectFrom("User")
							.select((userEb) => commonUserSelect(userEb))
							.whereRef(
								"User.id",
								"=",
								"TournamentOrganizationBannedUser.userId",
							),
					)
						.$notNull()
						.as("user"),
				),
			),
	}),
});

/** What the organization's pages show: its profile, members, series and badges, with who may edit it or ban users. */
export function organizationBySlug(slug: string) {
	return organizations()
		.where({ slug })
		.withColumns(["description", "socials", "isEstablished", "avatarImgId"])
		.withLogo()
		.withMembers()
		.withSeries()
		.withBadges()
		.withPermissions();
}

/** Whether an organization has the slug, e.g. one a new organization's name would get. */
export function existsBySlug(slug: string) {
	return organizationTable.exists({ slug });
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
					.leftJoin("Team", "TournamentTeam.teamId", "Team.id")
					.leftJoin("UserSubmittedImage as u1", "Team.avatarImgId", "u1.id")
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
				.where("TournamentTeam.isPlaceholder", "=", false)
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

export async function findPaginatedEventsBySeries({
	organizationId,
	substringMatches,
	page,
}: {
	organizationId: number;
	substringMatches: string[];
	page: number;
}) {
	// the page is resolved by id first: with the limit on the full read, the winners
	// of every event of the series would be aggregated before it applies
	const pageEventIds = db
		.selectFrom("CalendarEvent")
		.innerJoin(
			"CalendarEventDate",
			"CalendarEventDate.eventId",
			"CalendarEvent.id",
		)
		.select("CalendarEvent.id")
		.where("CalendarEvent.organizationId", "=", organizationId)
		.where("CalendarEvent.hidden", "=", 0)
		.where(calendarEventNameMatchesSeries(substringMatches))
		.groupBy("CalendarEvent.id")
		.orderBy(({ fn }) => fn.min("CalendarEventDate.startsAt"), "desc")
		.limit(TOURNAMENT_SERIES_EVENTS_PER_PAGE)
		.offset((page - 1) * TOURNAMENT_SERIES_EVENTS_PER_PAGE);

	const events = await findEventsBaseQuery(organizationId)
		.where("CalendarEvent.id", "in", pageEventIds)
		.orderBy("CalendarEventDate.startsAt", "desc")
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
		.where(calendarEventNameMatchesSeries(substringMatches))
		.groupBy("CalendarEvent.id")
		.orderBy("CalendarEventDate.startsAt", "desc")
		.execute();

	return events.map(mapEvent);
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

	const tournamentWins = await db
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
		.execute();

	const reportedWins = await db
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
		.execute();

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
		.where("ttci.isCheckOut", "=", false)
		.executeTakeFirst();

	return result?.count ?? 0;
}

/** Whether the organization has banned the user, an expired ban not counting. */
export async function isUserBannedByOrganization({
	organizationId,
	userId,
}: {
	organizationId: number;
	userId: number;
}) {
	const ban = await bannedUserTable.findOneBy({ organizationId, userId });

	if (!ban) return false;

	if (!ban.expiresAt) return true;

	return isFuture(databaseTimestampToDate(ban.expiresAt));
}

/** Creates the organization with the owner as its admin. The slug follows from the name. */
export function insert({ ownerId, name }: { ownerId: number; name: string }) {
	const slug = mySlugify(name);

	return db.transaction().execute(async (trx) => {
		const { id } = await organizationTable.insert({ name, slug }, trx);

		await memberTable.insert(
			{ organizationId: id, userId: ownerId, role: "ADMIN" },
			trx,
		);

		return { id, slug };
	});
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
		Pick<
			Tables["TournamentOrganizationSeries"],
			"description" | "name" | "showLeaderboard"
		>
	>;
	badges: number[];
}

/**
 * Replaces the organization's profile, members, series and badges. A new series starts with the
 * tiers of the finalized tournaments matching its name. Returns the slug following from the name.
 */
export function update({
	id,
	name,
	description,
	socials,
	avatarImgId,
	members,
	series: newSeries,
	badges,
}: UpdateArgs) {
	const slug = mySlugify(name);

	return db.transaction().execute(async (trx) => {
		if (avatarImgId !== undefined) {
			const current = await organizationTable.findById(id, trx);

			// a removed or replaced logo leaves its submitted image row unreferenced
			if (current?.avatarImgId && current.avatarImgId !== avatarImgId) {
				await unvalidatedImageTable.deleteById(current.avatarImgId, trx);
			}
		}

		await organizationTable.updateById(
			id,
			{ name, description, slug, socials: socials ?? null, avatarImgId },
			trx,
		);

		await memberTable.delete({ organizationId: id }, trx);
		await memberTable.insertMany(
			members.map((member) => ({ organizationId: id, ...member })),
			trx,
		);

		await seriesTable.delete({ organizationId: id }, trx);
		if (newSeries.length > 0) {
			const finalizedTournaments = await finalizedTournamentTiers(id, trx);

			await seriesTable.insertMany(
				newSeries.map((s) => {
					const substringMatches = [s.name.toLowerCase()];
					const matchingTiers = finalizedTournaments
						.filter((t) =>
							substringMatches.some((match) =>
								t.name.toLowerCase().includes(match),
							),
						)
						.flatMap((t) => (t.tier === null ? [] : [t.tier]));

					return {
						organizationId: id,
						name: s.name,
						description: s.description,
						substringMatches,
						showLeaderboard: s.showLeaderboard,
						tierHistory:
							matchingTiers.length > 0
								? matchingTiers.slice(-TIER_HISTORY_LENGTH)
								: null,
					};
				}),
				trx,
			);
		}

		await badgeTable.delete({ organizationId: id }, trx);
		await badgeTable.insertMany(
			badges.map((badgeId) => ({ organizationId: id, badgeId })),
			trx,
		);

		return { id, slug };
	});
}

/** Removes the actor from the organization's members. */
export function deleteOwnMembership(organizationId: number) {
	return memberTable.delete({ organizationId, userId: actorId() });
}

/** Bans a user from the organization, updating the ban's note and expiry if they already are. */
export function upsertBannedUser(
	args: Omit<TablesInsertable["TournamentOrganizationBannedUser"], "updatedAt">,
) {
	return bannedUserTable.upsert(args, {
		conflict: ["organizationId", "userId"],
		update: ["privateNote", "expiresAt"],
	});
}

/** Removes a user from the organization's banned list. */
export function unbanUser({
	organizationId,
	userId,
}: {
	organizationId: number;
	userId: number;
}) {
	return bannedUserTable.delete({ organizationId, userId });
}

/** Tiers of the organization's finalized tournaments, oldest first. */
function finalizedTournamentTiers(
	organizationId: number,
	trx: Transaction<DB>,
) {
	return trx
		.selectFrom("Tournament")
		.innerJoin("CalendarEvent", "CalendarEvent.tournamentId", "Tournament.id")
		.innerJoin(
			"CalendarEventDate",
			"CalendarEventDate.eventId",
			"CalendarEvent.id",
		)
		.select(["CalendarEvent.name", "Tournament.tier"])
		.where("Tournament.isFinalized", "=", true)
		.where("CalendarEvent.organizationId", "=", organizationId)
		.where("CalendarEvent.hidden", "=", 0)
		.orderBy("CalendarEventDate.startsAt", "asc")
		.execute();
}
