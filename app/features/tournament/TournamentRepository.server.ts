import {
	type ExpressionBuilder,
	type Kysely,
	type NotNull,
	sql,
	type Transaction,
} from "kysely";
import { ordinal } from "openskill";
import * as R from "remeda";
import { crud } from "~/db/crud";
import { defineQuery, refine, sortedBy, unchanged } from "~/db/entity-query";
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
import * as TrophyRepository from "~/features/trophies/TrophyRepository.server";
import { isSupporter } from "~/modules/permissions/utils";
import { nullFilledArray } from "~/utils/arrays";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import { invariant } from "~/utils/invariant";
import {
	asBoolean,
	calendarEventStartTime,
	commonUserSelect,
	concatUserSubmittedImagePrefix,
	jsonArrayFrom,
	jsonBuildObject,
	jsonObjectFrom,
	tournamentLogoWithDefault,
	tournamentMembersCount,
	tournamentTeamsCount,
	tournamentUsername,
} from "~/utils/kysely.server";
import type { TournamentTierNumber } from "./core/tiering";
import { updatedCastedMatchesInfo } from "./tournament-utils";

const tournamentTable = crud("Tournament");
const staffTable = crud("TournamentStaff");
const tournamentTeamTable = crud("TournamentTeam");
const resultTable = crud("TournamentResult");
const skillTable = crud("Skill");
const badgeOwnerTable = crud("TournamentBadgeOwner");
const divisionTierTable = crud("TournamentDivisionTier");
const progressionOverrideTable = crud("TournamentBracketProgressionOverride");
const pickBanEventTable = crud("TournamentMatchPickBanEvent");

export const { insert: insertPickBanEvent } = pickBanEventTable;

/** How close to its start time a tournament counts as happening right now. */
const TOURNAMENT_ONGOING_WINDOW_IN_SECONDS = 24 * 60 * 60;
// one per starting bracket; older tournaments have more brackets than MAX_BRACKETS_PER_TOURNAMENT allows today
const DIVISION_TIERS_LIMIT = 100;
// a match has at most a pick and a ban per map of its longest best of, plus mode picks and bans
const PICK_BAN_EVENTS_LIMIT = 100;

/**
 * Tournaments with their calendar event's `name`, first day's `startsAt` and `logoUrl`. Hidden
 * ones, drafts and test tournaments, are left out unless a step lifts the guard: `includingHidden`.
 */
export const tournaments = defineQuery({
	root: "Tournament",
	select: (qb) =>
		qb.select((eb) => [
			"Tournament.id",
			eventOf(eb)
				.select("CalendarEvent.name")
				.$asScalar()
				.$notNull()
				.as("name"),
			startsAtOf(eb).as("startsAt"),
			eventOf(eb)
				.select((eventEb) => tournamentLogoWithDefault(eventEb).as("logoUrl"))
				.$asScalar()
				.$notNull()
				.as("logoUrl"),
		]),
	defaultSort: [["Tournament.id", "asc"]],
	guards: {
		// the event's `hidden` mirrors the draft and test flags of the settings, cheaper than parsing them per row
		hidden: (qb) =>
			qb.where((eb) =>
				eb.exists(
					eventOf(eb)
						.select("CalendarEvent.id")
						.where("CalendarEvent.hidden", "=", 0),
				),
			),
	},
	vocabulary: ({ lift }) => ({
		/**
		 * Drafts and test tournaments too. Only for reads serving no viewer or one whose access to
		 * a draft is checked already: the shared tournament cache and the views under it
		 * (`requireTournamentVisible`), routines, permission lookups.
		 */
		includingHidden: () => lift("hidden"),
		/** Leaves out test tournaments, for a chain lifting the `hidden` guard. */
		// xxx: i mean two guars you can lift either or both would be cleaner
		excludingTests: () =>
			refine("Tournament", (qb) =>
				qb.where(settingsFlag("isTest"), "is not", 1),
			),
		leagues: () =>
			refine("Tournament", (qb) => qb.where(settingsFlag("isLeague"), "=", 1)),
		/** Tournaments whose first bracket has been started. */
		started: () =>
			refine("Tournament", (qb) =>
				qb.where((eb) =>
					eb.exists(
						eb
							.selectFrom("TournamentStage")
							.select("TournamentStage.id")
							.whereRef("TournamentStage.tournamentId", "=", "Tournament.id"),
					),
				),
			),
		ofOrganization: (organizationId: number) =>
			refine("Tournament", (qb) =>
				qb.where("Tournament.id", "in", (eb) =>
					eb
						.selectFrom("CalendarEvent")
						.select("CalendarEvent.tournamentId")
						.where("CalendarEvent.organizationId", "=", organizationId)
						.$narrowType<{ tournamentId: NotNull }>(),
				),
			),
		nameContaining: (text: string) =>
			refine("Tournament", (qb) =>
				qb.where("Tournament.id", "in", (eb) =>
					eb
						.selectFrom("CalendarEvent")
						.select("CalendarEvent.tournamentId")
						.where("CalendarEvent.name", "like", `%${text}%`)
						.$narrowType<{ tournamentId: NotNull }>(),
				),
			),
		// checked per tournament another filter found: as an `in` list it scanned every event's name
		nameStartingWith: (prefix: string) =>
			refine("Tournament", (qb) =>
				qb.where((eb) =>
					eb.exists(
						eventOf(eb)
							.select("CalendarEvent.id")
							.where("CalendarEvent.name", "like", `${prefix}%`),
					),
				),
			),
		/** Tournaments with a day starting after `after` and at or before `before`, `null` leaving that end open. */
		startingBetween: (after: Date | null, before: Date | null) => {
			if (!after && !before) return unchanged("Tournament");

			return refine("Tournament", (qb) =>
				qb.where("Tournament.id", "in", (eb) => {
					let days = eb
						.selectFrom("CalendarEventDate")
						.innerJoin(
							"CalendarEvent",
							"CalendarEvent.id",
							"CalendarEventDate.eventId",
						)
						.select("CalendarEvent.tournamentId")
						.$narrowType<{ tournamentId: NotNull }>();
					if (after) {
						days = days.where(
							"CalendarEventDate.startsAt",
							">",
							dateToDatabaseTimestamp(after),
						);
					}
					if (before) {
						days = days.where(
							"CalendarEventDate.startsAt",
							"<=",
							dateToDatabaseTimestamp(before),
						);
					}
					return days;
				}),
			);
		},
		soonestFirst: () => sortedBy("Tournament", [(eb) => startsAtOf(eb), "asc"]),
		latestFirst: () => sortedBy("Tournament", [(eb) => startsAtOf(eb), "desc"]),
		/**
		 * The ones happening right now first, then the next one coming up, then by how far from
		 * now they start.
		 */
		nearestToNowFirst: () => {
			const now = databaseTimestampNow();

			// joined rather than the startsAtOf subquery, which the sort would run four times per match
			return refine("Tournament", (qb) =>
				qb
					.innerJoin(
						"CalendarEvent as NearestEvent",
						"NearestEvent.tournamentId",
						"Tournament.id",
					)
					.innerJoin("CalendarEventDate as NearestDay", (join) =>
						join
							.onRef("NearestDay.eventId", "=", "NearestEvent.id")
							.on("NearestDay.startsAt", "=", (eb) =>
								eb
									.selectFrom("CalendarEventDate as FirstDay")
									.select((dayEb) =>
										dayEb.fn.min<number>("FirstDay.startsAt").as("startsAt"),
									)
									.whereRef("FirstDay.eventId", "=", "NearestEvent.id"),
							),
					),
			).sortedBy(
				[
					// window function: next up is the next of all matches, not only of those within the limit
					() => sql`case
						when abs("NearestDay"."startsAt" - ${now}) < ${TOURNAMENT_ONGOING_WINDOW_IN_SECONDS} then 0
						when "NearestDay"."startsAt" = min(case when "NearestDay"."startsAt" - ${now} >= ${TOURNAMENT_ONGOING_WINDOW_IN_SECONDS} then "NearestDay"."startsAt" end) over () then 1
						else 2
					end`,
					"asc",
				],
				[() => sql`abs("NearestDay"."startsAt" - ${now})`, "asc"],
			);
		},
		/** The calendar event's id (`eventId`), Discord link and tags. */
		withEvent: () =>
			refine("Tournament", (qb) =>
				qb.select((eb) => [
					eventOf(eb)
						.select("CalendarEvent.id")
						.$asScalar()
						.$notNull()
						.as("eventId"),
					eventOf(eb)
						.select("CalendarEvent.discordUrl")
						.$asScalar()
						.as("discordUrl"),
					eventOf(eb).select("CalendarEvent.tags").$asScalar().as("tags"),
				]),
			),
		/** The calendar event's description markdown, large and only shown on the info page. */
		withDescription: () =>
			refine("Tournament", (qb) =>
				qb.select((eb) =>
					eventOf(eb)
						.select("CalendarEvent.description")
						.$asScalar()
						.as("description"),
				),
			),
		withHasRules: () =>
			refine("Tournament", (qb) =>
				qb.select((eb) =>
					asBoolean(eb("Tournament.rules", "is not", null)).as("hasRules"),
				),
			),
		/** Who made the tournament, with their pronouns. */
		withAuthor: () =>
			refine("Tournament", (qb) =>
				qb.select((eb) =>
					jsonObjectFrom(
						eb
							.selectFrom("User")
							.select((userEb) => [
								...commonUserSelect(userEb),
								"User.pronouns",
							])
							.where("User.id", "=", (userEb) =>
								eventOf(userEb).select("CalendarEvent.authorId"),
							),
					)
						.$notNull()
						.as("author"),
				),
			),
		/** The organization's id, name and slug, `null` for an organization-less tournament. */
		withOrganization: () =>
			refine("Tournament", (qb) =>
				qb.select((eb) =>
					jsonObjectFrom(
						eb
							.selectFrom("TournamentOrganization")
							.select([
								"TournamentOrganization.id",
								"TournamentOrganization.name",
								"TournamentOrganization.slug",
							])
							.where("TournamentOrganization.id", "=", (organizationEb) =>
								organizationIdOf(organizationEb),
							),
					).as("organization"),
				),
			),
		/** The organization with its logo, members and series, `null` for an organization-less tournament. */
		withOrganizationDetails: () =>
			refine("Tournament", (qb) =>
				qb.select((eb) =>
					jsonObjectFrom(
						eb
							.selectFrom("TournamentOrganization")
							.leftJoin(
								"UserSubmittedImage",
								"TournamentOrganization.avatarImgId",
								"UserSubmittedImage.id",
							)
							.select((organizationEb) => [
								"TournamentOrganization.id",
								"TournamentOrganization.name",
								"TournamentOrganization.slug",
								"TournamentOrganization.isEstablished",
								concatUserSubmittedImagePrefix(
									organizationEb.ref("UserSubmittedImage.url"),
								).as("logoUrl"),
								jsonArrayFrom(
									organizationEb
										.selectFrom("TournamentOrganizationMember")
										.innerJoin(
											"User",
											"TournamentOrganizationMember.userId",
											"User.id",
										)
										.select((memberEb) => [
											"TournamentOrganizationMember.userId",
											"TournamentOrganizationMember.role",
											...commonUserSelect(memberEb),
											"User.pronouns",
										])
										.whereRef(
											"TournamentOrganizationMember.organizationId",
											"=",
											"TournamentOrganization.id",
										),
								).as("members"),
								jsonArrayFrom(
									organizationEb
										.selectFrom("TournamentOrganizationSeries")
										.select("TournamentOrganizationSeries.name")
										.whereRef(
											"TournamentOrganizationSeries.organizationId",
											"=",
											"TournamentOrganization.id",
										),
								).as("series"),
							])
							.where("TournamentOrganization.id", "=", (organizationEb) =>
								organizationIdOf(organizationEb),
							),
					).as("organization"),
				),
			),
		withStaff: () =>
			refine("Tournament", (qb) =>
				qb.select((eb) =>
					jsonArrayFrom(
						eb
							.selectFrom("TournamentStaff")
							.innerJoin("User", "TournamentStaff.userId", "User.id")
							.select((staffEb) => [
								...commonUserSelect(staffEb),
								"User.pronouns",
								"TournamentStaff.role",
							])
							.whereRef("TournamentStaff.tournamentId", "=", "Tournament.id"),
					).as("staff"),
				),
			),
		withBracketProgressionOverrides: () =>
			refine("Tournament", (qb) =>
				qb.select((eb) =>
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
				),
			),
		/** The map pool the organizer picked for the whole tournament. */
		withToSetMapPool: () =>
			refine("Tournament", (qb) =>
				qb.select((eb) =>
					jsonArrayFrom(
						eb
							.selectFrom("MapPoolMap")
							.select(["MapPoolMap.mode", "MapPoolMap.stageId"])
							.where("MapPoolMap.calendarEventId", "=", (mapEb) =>
								eventOf(mapEb).select("CalendarEvent.id"),
							),
					).as("toSetMapPool"),
				),
			),
		/** Teams that count for the tournament (see `tournamentTeamsCount`) and their players. */
		withCounts: () =>
			refine("Tournament", (qb) =>
				qb
					.select((eb) => [
						tournamentTeamsCount(eb).as("teamsCount"),
						tournamentMembersCount(eb).as("membersCount"),
					])
					.$narrowType<{ teamsCount: NotNull; membersCount: NotNull }>(),
			),
		/** Badges the tournament awards. */
		withBadges: () =>
			refine("Tournament", (qb) =>
				qb.select((eb) =>
					jsonArrayFrom(
						eb
							.selectFrom("CalendarEventBadge")
							.innerJoin("Badge", "CalendarEventBadge.badgeId", "Badge.id")
							.select([
								"Badge.id",
								"Badge.code",
								"Badge.hue",
								"Badge.displayName",
							])
							.where("CalendarEventBadge.eventId", "=", (badgeEb) =>
								eventOf(badgeEb).select("CalendarEvent.id"),
							)
							.orderBy("Badge.id", "asc"),
					).as("badges"),
				),
			),
		/** The trophy's model, `null` when the tournament awards none. */
		withTrophy: () =>
			refine("Tournament", (qb) =>
				qb.select((eb) =>
					jsonObjectFrom(
						eb
							.selectFrom("Trophy")
							.select(["Trophy.model"])
							.where("Trophy.id", "=", (trophyEb) =>
								eventOf(trophyEb).select("CalendarEvent.trophyId"),
							),
					).as("trophy"),
				),
			),
		/** The players who placed first with their team, once results are in. */
		withFirstPlacers: () =>
			refine("Tournament", (qb) =>
				qb.select((eb) =>
					jsonArrayFrom(
						eb
							.selectFrom("TournamentResult")
							.innerJoin("User", "TournamentResult.userId", "User.id")
							.innerJoin(
								"TournamentTeam",
								"TournamentResult.tournamentTeamId",
								"TournamentTeam.id",
							)
							.leftJoin("Team", "TournamentTeam.teamId", "Team.id")
							.leftJoin(
								"UserSubmittedImage as TeamAvatar",
								"Team.avatarImgId",
								"TeamAvatar.id",
							)
							.leftJoin(
								"UserSubmittedImage as TournamentTeamAvatar",
								"TournamentTeam.avatarImgId",
								"TournamentTeamAvatar.id",
							)
							.whereRef("TournamentResult.tournamentId", "=", "Tournament.id")
							.where("TournamentResult.placement", "=", 1)
							.select((placerEb) => [
								...commonUserSelect(placerEb, { inTournament: true }),
								"User.country",
								"TournamentResult.div",
								"TournamentTeam.name as teamName",
								concatUserSubmittedImagePrefix(
									placerEb.ref("TeamAvatar.url"),
								).as("teamLogoUrl"),
								concatUserSubmittedImagePrefix(
									placerEb.ref("TournamentTeamAvatar.url"),
								).as("pickupAvatarUrl"),
							]),
					).as("firstPlacers"),
				),
			),
		/** Whether any of its matches has a VOD. */
		withHasVods: () =>
			refine("Tournament", (qb) =>
				qb.select((eb) =>
					asBoolean(
						eb.exists(
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
								.select("TournamentMatchVod.matchId")
								.whereRef("TournamentStage.tournamentId", "=", "Tournament.id"),
						),
					).as("hasVods"),
				),
			),
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
		withPermissions: () =>
			refine("Tournament", (qb) =>
				qb.select((eb) => permissionHolders(eb).as("permissions")),
			).mapRows(({ permissions }) => ({
				permissions: permissionsOf(permissions),
			})),
		/** `ADMIN`, `ORGANIZE` and `MANAGE_MATCHES` only, see {@link organizerPermissions}. */
		withOrganizerPermissions: () =>
			refine("Tournament", (qb) =>
				qb.select((eb) => organizerHolders(eb).as("permissions")),
			).mapRows(({ permissions }) => ({
				permissions: organizerPermissions(permissions),
			})),
	}),
});

// xxx: from LiveStreamRepository?
/** Live streams of checked-in participants and of the tournament's cast Twitch accounts. */
export async function findStreamsByTournamentId(tournamentId: number) {
	const participantStreams = await db
		.selectFrom("LiveStream")
		.innerJoin("User", "User.twitch", "LiveStream.twitch")
		.innerJoin("TournamentTeamMember", "TournamentTeamMember.userId", "User.id")
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
		.where("TournamentTeam.isPlaceholder", "=", false)
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
		.execute();

	const castStreams = await db
		.selectFrom("LiveStream")
		.select([
			"LiveStream.twitch",
			"LiveStream.viewerCount",
			"LiveStream.thumbnailUrl",
		])
		.where(
			sql<boolean>`"LiveStream"."twitch" IN (SELECT value FROM json_each((SELECT "castTwitchAccounts" FROM "Tournament" WHERE "Tournament"."id" = ${tournamentId})))`,
		)
		.execute();

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

/** Tournaments whose name contains the query, the ones happening now or next up first. */
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
	// key-first, so the sort's window function runs over the matches' ids, not over their full rows
	const { items } = await tournaments()
		.nameContaining(query)
		.startingBetween(minStartTime ?? null, maxStartTime ?? null)
		.nearestToNowFirst()
		.paginate({ after: null, size: limit });

	return items;
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
	const league = await tournaments()
		.where({ isFinalized: true })
		.leagues()
		.ofOrganization(args.organizationId)
		.nameStartingWith(args.namePrefix)
		.latestFirst()
		.withColumns(["settings"])
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
		.where("TournamentTeam.droppedOut", "=", false)
		.execute();

	return {
		tournamentId: league.id,
		name: league.name,
		bracketProgression: league.settings.bracketProgression,
		participants,
	};
}

/** Maps the organizers prepared ahead of time, by bracket. Only shown to the organizers. */
export async function findPreparedMapsById(tournamentId: number) {
	const tournament = await tournaments()
		.where({ id: tournamentId })
		.includingHidden()
		.withColumns(["preparedMaps"])
		.executeTakeFirst();

	return tournament?.preparedMaps ?? undefined;
}

/**
 * Members of teams that have not checked in nor dropped out, for every tournament whose first day starts inside the window.
 * One row per member per tournament; the caller narrows the window to the check-in period.
 */
export function findPendingCheckInsStartingBetween({
	startsAfter,
	startsBefore,
}: {
	startsAfter: Date;
	startsBefore: Date;
}) {
	return (
		db
			.selectFrom("TournamentTeamMember")
			.innerJoin(
				"TournamentTeam",
				"TournamentTeamMember.tournamentTeamId",
				"TournamentTeam.id",
			)
			.innerJoin("Tournament", "TournamentTeam.tournamentId", "Tournament.id")
			.innerJoin("CalendarEvent", "CalendarEvent.tournamentId", "Tournament.id")
			.innerJoin(
				"CalendarEventDate",
				"CalendarEvent.id",
				"CalendarEventDate.eventId",
			)
			.select((eb) => [
				"TournamentTeamMember.userId",
				"Tournament.id as tournamentId",
				tournamentLogoWithDefault(eb).as("logoUrl"),
			])
			// a multi-day tournament checks in before its first day only
			.where("CalendarEventDate.startsAt", "=", (eb) =>
				calendarEventStartTime(eb),
			)
			.where(
				"CalendarEventDate.startsAt",
				">",
				dateToDatabaseTimestamp(startsAfter),
			)
			.where(
				"CalendarEventDate.startsAt",
				"<=",
				dateToDatabaseTimestamp(startsBefore),
			)
			.where("CalendarEvent.hidden", "=", 0)
			.where("Tournament.isFinalized", "=", false)
			.where("TournamentTeam.droppedOut", "=", false)
			.where("TournamentTeam.isPlaceholder", "=", false)
			.where(settingsFlag("isTest"), "is not", 1)
			.where(settingsFlag("isLeague"), "is not", 1)
			.where(settingsFlag("isDraft"), "is not", 1)
			.where((eb) =>
				eb.not(
					eb.exists(
						eb
							.selectFrom("TournamentTeamCheckIn")
							.select("TournamentTeamCheckIn.tournamentTeamId")
							.whereRef(
								"TournamentTeamCheckIn.tournamentTeamId",
								"=",
								"TournamentTeam.id",
							)
							.where("TournamentTeamCheckIn.bracketIdx", "is", null),
					),
				),
			)
			.orderBy("CalendarEventDate.startsAt")
			.execute()
	);
}

// xxx: TournamentResultRepository?
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

/** Pick/ban and roll events of the match in the order they happened. */
export function findPickBanEventsByMatchId(matchId: number) {
	return pickBanEventTable.findManyBy(
		{ matchId },
		{ orderBy: [["number", "asc"]], limit: PICK_BAN_EVENTS_LIMIT },
	);
}

/** Tier of every league division (starting bracket) of the tournament that has one. */
export function findDivisionTiersByTournamentId(tournamentId: number) {
	return divisionTierTable.findManyBy(
		{ tournamentId },
		{ limit: DIVISION_TIERS_LIMIT },
	);
}

/**
 * Replaces the bracket progression. A change of format or starting brackets also resets the
 * teams' starting brackets and bracket check-ins, a change of format the prepared maps.
 */
export function updateProgression({
	tournamentId,
	bracketProgression,
}: {
	tournamentId: number;
	bracketProgression: TournamentSettings["bracketProgression"];
}) {
	return db.transaction().execute(async (trx) => {
		const tournament = await tournamentTable.findById(tournamentId, trx);
		invariant(tournament, "Tournament not found");
		const existingSettings = tournament.settings;

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
			await trx
				.deleteFrom("TournamentTeamCheckIn")
				.where("TournamentTeamCheckIn.bracketIdx", "is not", null)
				.where("TournamentTeamCheckIn.tournamentTeamId", "in", (eb) =>
					eb
						.selectFrom("TournamentTeam")
						.select("TournamentTeam.id")
						.where("TournamentTeam.tournamentId", "=", tournamentId),
				)
				.execute();

			await tournamentTeamTable.update(
				{ tournamentId },
				{ startingBracketIdx: null },
				trx,
			);
		}

		await tournamentTable.updateById(
			tournamentId,
			{
				settings: { ...existingSettings, bracketProgression },
				preparedMaps: changedFormat ? null : undefined,
			},
			trx,
		);
	});
}

/** Sends the team from the source bracket to the destination one, replacing an earlier override of the same source. */
export function upsertBracketProgressionOverride(
	args: Tables["TournamentBracketProgressionOverride"],
) {
	return progressionOverrideTable.upsert(args, {
		conflict: ["sourceBracketIdx", "tournamentTeamId"],
		update: ["destinationBracketIdx"],
	});
}

/** Replaces the tournament's staff. */
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
		await staffTable.delete({ tournamentId }, trx);
		await staffTable.insertMany(
			staff.map((staffer) => ({
				tournamentId,
				userId: staffer.userId,
				role: staffer.role,
			})),
			trx,
		);
	});
}

interface UpsertPreparedMapsArgs {
	tournamentId: number;
	maps: Omit<PreparedMaps, "createdAt" | "authorId">;
	bracketIdx: number;
}

/** Sets the bracket's prepared maps, attributed to the actor (`authorId`). */
export function upsertPreparedMaps({
	bracketIdx,
	maps,
	tournamentId,
}: UpsertPreparedMapsArgs) {
	return db.transaction().execute(async (trx) => {
		const tournament = await tournamentTable.findById(tournamentId, trx);
		invariant(tournament, "Tournament not found");

		const preparedMaps: Array<PreparedMaps | null> =
			tournament.preparedMaps ??
			nullFilledArray(tournament.settings.bracketProgression.length);

		preparedMaps[bracketIdx] = {
			...maps,
			authorId: actorId(),
			createdAt: databaseTimestampNow(),
		};

		await tournamentTable.updateById(tournamentId, { preparedMaps }, trx);
	});
}

/** Sets the Twitch accounts casting the tournament, lowercased. */
export function updateCastTwitchAccounts({
	tournamentId,
	castTwitchAccounts,
}: {
	tournamentId: number;
	castTwitchAccounts: string[];
}) {
	return tournamentTable.updateById(tournamentId, {
		castTwitchAccounts: castTwitchAccounts
			.map((account) => account.trim().toLowerCase())
			.filter(Boolean),
	});
}

/** Locks the match for the Twitch account to cast, so it isn't started before. */
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

		await tournamentTable.updateById(tournamentId, { castedMatchesInfo }, trx);
	});
}

/** Unlocks the match, restarting its deadline. */
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

		await tournamentTable.updateById(tournamentId, { castedMatchesInfo }, trx);

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

/** Records the match as being cast on the Twitch account, `null` to stop casting it. */
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

		await tournamentTable.updateById(
			tournamentId,
			{
				castedMatchesInfo: updatedCastedMatchesInfo(castedMatchesInfo, {
					matchId,
					twitchAccount,
					timestamp: databaseTimestampNow(),
				}),
			},
			trx,
		);
	});
}

/** Undoes the finalization: results, skills and badges are removed. */
export function reopenTournament(tournamentId: number) {
	return db.transaction().execute(async (trx) => {
		await resultTable.delete({ tournamentId }, trx);
		await tournamentTable.updateById(tournamentId, { isFinalized: false }, trx);
		await skillTable.delete({ tournamentId }, trx);
		await badgeOwnerTable.delete({ tournamentId }, trx);
	});
}

/** SQLite rejects statements binding over 32,766 parameters, which a big tournament's deltas cross in one insert. */
const SUMMARY_INSERT_CHUNK_SIZE = 1000;

/**
 * Finalizes a tournament, recording the full summary: skills, seeding skills, map/player
 * result deltas, badge owners and placements. See {@link finalizeWithoutSummary} for test tournaments.
 *
 * Returns false without writing anything if the tournament was already finalized, so that
 * overlapping requests can't apply the additive summary deltas twice.
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
		if (!(await claimFinalization(trx, tournamentId))) return false;

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

		await badgeOwnerTable.insertMany(
			badgeReceivers.flatMap((badgeReceiver) =>
				badgeReceiver.userIds.map((userId) => ({
					tournamentId,
					badgeId: badgeReceiver.badgeId,
					userId,
				})),
			),
			trx,
		);

		if (trophyReceiver) {
			await TrophyRepository.insertTournamentOwners(
				[
					{
						tournamentId,
						tournamentTeamId: summary.tournamentResults.find((result) =>
							trophyReceiver.userIds.includes(result.userId),
						)?.tournamentTeamId,
						trophyId: trophyReceiver.trophyId,
						userIds: trophyReceiver.userIds,
					},
				],
				trx,
			);
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
				setResults: setResults ?? [],
				div: tournamentResult.div,
			}));

		for (const chunk of R.chunk(tournamentResults, SUMMARY_INSERT_CHUNK_SIZE)) {
			await resultTable.insertMany(chunk, trx);
		}

		return true;
	});
}

/**
 * Marks a test tournament as finalized without recording any summary stats. See {@link finalize}.
 *
 * Returns false if the tournament was already finalized.
 */
export function finalizeWithoutSummary(tournamentId: number) {
	return claimFinalization(db, tournamentId);
}

/** Saves the seeds in the order of `teamIds` and snapshots the rosters they were saved with. */
export function updateTeamSeeds({
	tournamentId,
	teamIds,
}: {
	tournamentId: number;
	teamIds: number[];
}) {
	return db.transaction().execute(async (trx) => {
		await tournamentTeamTable.update({ tournamentId }, { seed: null }, trx);

		for (const [i, teamId] of teamIds.entries()) {
			await tournamentTeamTable.updateById(teamId, { seed: i + 1 }, trx);
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
		const snapshot = {
			savedAt: databaseTimestampNow(),
			teams: teamIds.map((teamId) => ({
				teamId,
				members: (membersByTeamId[teamId] ?? []).map(
					({ userId, username }) => ({ userId, username }),
				),
			})),
		};
		await tournamentTable.updateById(
			tournamentId,
			{ seedingSnapshot: snapshot },
			trx,
		);
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
		await divisionTierTable.upsert(
			{ tournamentId, bracketIdx, tier },
			{ conflict: ["tournamentId", "bracketIdx"], update: ["tier"] },
			trx,
		);

		const best = await trx
			.selectFrom("TournamentDivisionTier")
			.select(({ fn }) =>
				fn.min<TournamentTierNumber>("TournamentDivisionTier.tier").as("tier"),
			)
			.where("TournamentDivisionTier.tournamentId", "=", tournamentId)
			.executeTakeFirstOrThrow();

		await tournamentTable.updateById(tournamentId, { tier: best.tier }, trx);
	});
}

/**
 * Flips `isFinalized` on, atomically. False means another finalization got there first, in which
 * case the caller must not apply any summary of its own.
 */
async function claimFinalization(
	trx: Kysely<DB> | Transaction<DB>,
	tournamentId: number,
) {
	const result = await trx
		.updateTable("Tournament")
		.set({ isFinalized: true })
		.where("id", "=", tournamentId)
		.where("isFinalized", "=", false)
		.executeTakeFirst();

	return result.numUpdatedRows > 0n;
}

async function castedMatchesInfoByTournamentId(
	trx: Transaction<DB>,
	tournamentId: number,
): Promise<CastedMatchesInfo> {
	const tournament = await tournamentTable.findById(tournamentId, trx);
	invariant(tournament, "Tournament not found");

	return (
		tournament.castedMatchesInfo ?? { castedMatches: [], lockedMatches: [] }
	);
}

/** The tournament's calendar event, to select one of its columns from. Correlates on `"Tournament"."id"`. */
function eventOf(eb: ExpressionBuilder<DB, "Tournament">) {
	return eb
		.selectFrom("CalendarEvent")
		.whereRef("CalendarEvent.tournamentId", "=", "Tournament.id");
}

function organizationIdOf(eb: ExpressionBuilder<DB, "Tournament">) {
	return eventOf(eb).select("CalendarEvent.organizationId");
}

/** When the tournament's first day starts. Correlates on `"Tournament"."id"`. */
function startsAtOf(eb: ExpressionBuilder<DB, "Tournament">) {
	return eb
		.selectFrom("CalendarEventDate")
		.innerJoin("CalendarEvent", "CalendarEvent.id", "CalendarEventDate.eventId")
		.select((dateEb) =>
			dateEb.fn.min<number>("CalendarEventDate.startsAt").as("startsAt"),
		)
		.whereRef("CalendarEvent.tournamentId", "=", "Tournament.id")
		.$asScalar()
		.$notNull();
}

function settingsFlag(flag: "isDraft" | "isTest" | "isLeague") {
	return sql<
		number | null
	>`json_extract("Tournament"."settings", ${`$.${flag}`})`;
}

/** Who holds a role on the tournament: its author, staff and organization members. */
function permissionHolders(eb: ExpressionBuilder<DB, "Tournament">) {
	return jsonBuildObject({
		authorId: authorIdOf(eb),
		isEstablished: eb
			.selectFrom("TournamentOrganization")
			.select("TournamentOrganization.isEstablished")
			.where("TournamentOrganization.id", "=", (organizationEb) =>
				organizationIdOf(organizationEb),
			)
			.$asScalar(),
		staff: staffRolesOf(eb),
		organizationMembers: jsonArrayFrom(
			organizationMembersOf(eb)
				.innerJoin("User", "TournamentOrganizationMember.userId", "User.id")
				.select([
					"TournamentOrganizationMember.userId",
					"TournamentOrganizationMember.role",
					"User.isTournamentOrganizer",
					"User.patronTier",
				]),
		),
	});
}

/** {@link permissionHolders} without what only `EDIT_EVENT_INFO` and `EDIT_IN_GAME_NAMES` need. */
function organizerHolders(eb: ExpressionBuilder<DB, "Tournament">) {
	return jsonBuildObject({
		authorId: authorIdOf(eb),
		staff: staffRolesOf(eb),
		organizationMembers: jsonArrayFrom(
			organizationMembersOf(eb).select([
				"TournamentOrganizationMember.userId",
				"TournamentOrganizationMember.role",
			]),
		),
	});
}

function authorIdOf(eb: ExpressionBuilder<DB, "Tournament">) {
	return eventOf(eb).select("CalendarEvent.authorId").$asScalar().$notNull();
}

function staffRolesOf(eb: ExpressionBuilder<DB, "Tournament">) {
	return jsonArrayFrom(
		eb
			.selectFrom("TournamentStaff")
			.select(["TournamentStaff.userId", "TournamentStaff.role"])
			.whereRef("TournamentStaff.tournamentId", "=", "Tournament.id"),
	);
}

function organizationMembersOf(eb: ExpressionBuilder<DB, "Tournament">) {
	return eb
		.selectFrom("TournamentOrganizationMember")
		.where("TournamentOrganizationMember.organizationId", "=", (memberEb) =>
			organizationIdOf(memberEb),
		);
}

function permissionsOf(holders: {
	authorId: number;
	isEstablished: DBBoolean | null;
	staff: Array<{ userId: number; role: Tables["TournamentStaff"]["role"] }>;
	organizationMembers: Array<{
		userId: number;
		role: TournamentOrganizationRole;
		isTournamentOrganizer: boolean;
		patronTier: number | null;
	}>;
}) {
	const isEstablished = Boolean(holders.isEstablished);
	const membersWithRole = (roles: Array<TournamentOrganizationRole>) =>
		holders.organizationMembers
			.filter((member) => roles.includes(member.role))
			.map((member) => member.userId);

	return {
		...organizerPermissions({
			authorId: holders.authorId,
			organizationMembers: holders.organizationMembers,
			staff: holders.staff,
		}),
		EDIT_EVENT_INFO: R.unique([
			holders.authorId,
			...holders.organizationMembers
				.filter(
					(member) =>
						member.role === "ADMIN" &&
						(isEstablished ||
							member.isTournamentOrganizer ||
							isSupporter(member)),
				)
				.map((member) => member.userId),
		]),
		EDIT_IN_GAME_NAMES: isEstablished
			? membersWithRole(["ADMIN", "ORGANIZER"])
			: [],
	};
}
