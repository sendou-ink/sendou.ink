import { sub } from "date-fns";
import type {
	Expression,
	ExpressionBuilder,
	NotNull,
	Transaction,
} from "kysely";
import { sql } from "kysely";
import * as R from "remeda";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
import type { TournamentSettings } from "~/db/tables-json";
import { EXCLUDED_TAGS } from "~/features/calendar/calendar-constants";
import * as ChatRepository from "~/features/chat/ChatRepository.server";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import * as Series from "~/features/tournament-organization/core/Series";
import { getTentativeTier } from "~/features/tournament-organization/core/tentativeTiers.server";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";
import {
	databaseTimestampNow,
	databaseTimestampToDate,
	databaseTimestampToJavascriptTimestamp,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import invariant from "~/utils/invariant";
import {
	commonUserSelect,
	concatUserSubmittedImagePrefix,
	jsonArrayFrom,
	jsonObjectFrom,
	tournamentLogoWithDefault,
	tournamentMembersCount,
	tournamentTeamsCount,
} from "~/utils/kysely.server";
import { calendarEventPage, tournamentPage } from "~/utils/urls";
import {
	modesIncluded,
	normalizedTeamCount,
	tournamentIsRanked,
} from "../tournament/tournament-utils";
import type { CalendarEvent } from "./calendar-types";
import { calendarEventSorter } from "./calendar-utils";

const RECENT_TOURNAMENTS_SHOWN = 10;

function hasBadge(eb: ExpressionBuilder<DB, "CalendarEventDate">) {
	return eb
		.exists(
			eb
				.selectFrom("CalendarEventBadge")
				.select("CalendarEventBadge.eventId")
				.whereRef(
					"CalendarEventBadge.eventId",
					"=",
					"CalendarEventDate.eventId",
				),
		)
		.as("hasBadge");
}

const withMapPool = (eb: ExpressionBuilder<DB, "CalendarEvent">) => {
	return jsonArrayFrom(
		eb
			.selectFrom("MapPoolMap")
			.select(["MapPoolMap.stageId", "MapPoolMap.mode"])
			.whereRef("MapPoolMap.calendarEventId", "=", "CalendarEvent.id"),
	).as("mapPool");
};

const withTieBreakerMapPool = (eb: ExpressionBuilder<DB, "CalendarEvent">) => {
	return jsonArrayFrom(
		eb
			.selectFrom("MapPoolMap")
			.select(["MapPoolMap.stageId", "MapPoolMap.mode"])
			.whereRef(
				"MapPoolMap.tieBreakerCalendarEventId",
				"=",
				"CalendarEvent.id",
			),
	).as("tieBreakerMapPool");
};

const withBadgePrizes = (eb: ExpressionBuilder<DB, "CalendarEvent">) => {
	return jsonArrayFrom(
		eb
			.selectFrom("CalendarEventBadge")
			.innerJoin("Badge", "CalendarEventBadge.badgeId", "Badge.id")
			.select(["Badge.id", "Badge.code", "Badge.hue", "Badge.displayName"])
			.whereRef("CalendarEventBadge.eventId", "=", "CalendarEvent.id"),
	).as("badgePrizes");
};

const withTrophy = (eb: ExpressionBuilder<DB, "CalendarEvent">) => {
	return jsonObjectFrom(
		eb
			.selectFrom("Trophy")
			.select(["Trophy.id", "Trophy.name", "Trophy.model"])
			.whereRef("Trophy.id", "=", "CalendarEvent.trophyId"),
	).as("trophy");
};

function tournamentOrganization(organizationId: Expression<number | null>) {
	return jsonObjectFrom(
		db
			.selectFrom("TournamentOrganization")
			.leftJoin(
				"UserSubmittedImage",
				"TournamentOrganization.avatarImgId",
				"UserSubmittedImage.id",
			)
			.select((eb) => [
				"TournamentOrganization.id",
				"TournamentOrganization.name",
				"TournamentOrganization.slug",
				"TournamentOrganization.isEstablished",
				concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
					"logoUrl",
				),
			])
			.whereRef("TournamentOrganization.id", "=", organizationId),
	);
}

interface FindAllBetweenTwoTimestampsArgs {
	startTime: Date;
	endTime: Date;
}

export async function findAllBetweenTwoTimestamps(
	args: FindAllBetweenTwoTimestampsArgs,
) {
	const rows = await findAllBetweenTwoTimestampsQuery(args);
	return findAllBetweenTwoTimestampsMapped(rows);
}

const withOrganization = (eb: ExpressionBuilder<DB, "CalendarEvent">) =>
	jsonObjectFrom(
		eb
			.selectFrom("TournamentOrganization")
			.select(["TournamentOrganization.name", "TournamentOrganization.slug"])
			.whereRef(
				"TournamentOrganization.id",
				"=",
				"CalendarEvent.organizationId",
			),
	);

function findAllBetweenTwoTimestampsQuery({
	startTime,
	endTime,
}: FindAllBetweenTwoTimestampsArgs) {
	return db
		.selectFrom("CalendarEvent")
		.innerJoin(
			"CalendarEventDate",
			"CalendarEvent.id",
			"CalendarEventDate.eventId",
		)
		.leftJoin("Tournament", "CalendarEvent.tournamentId", "Tournament.id")
		.select((eb) => [
			"CalendarEvent.id as eventId",
			"CalendarEvent.authorId",
			"CalendarEvent.organizationId",
			"Tournament.id as tournamentId",
			"Tournament.settings as tournamentSettings",
			"Tournament.mapPickingStyle",
			"Tournament.tier",
			"CalendarEvent.name",
			"CalendarEvent.tags",
			"CalendarEventDate.startsAt",
			// grouped to the closest :00 or :30 so a :59 start can't game its way to the top
			sql<number>`(("CalendarEventDate"."startsAt" + 900) / 1800) * 1800`.as(
				"normalizedStartsAt",
			),
			withOrganization(eb).as("organization"),
			tournamentTeamsCount(eb).as("teamsCount"),
			tournamentMembersCount(eb).as("membersCount"),
			tournamentLogoWithDefault(eb).as("logoUrl"),
			jsonArrayFrom(
				eb
					.selectFrom("MapPoolMap")
					.select(["MapPoolMap.mode"])
					.whereRef("MapPoolMap.calendarEventId", "=", "CalendarEvent.id"),
			).as("toSetMapPool"),
			jsonArrayFrom(
				eb
					.selectFrom("CalendarEventBadge")
					.innerJoin("Badge", "CalendarEventBadge.badgeId", "Badge.id")
					.select(["Badge.id", "Badge.code", "Badge.hue", "Badge.displayName"])
					.whereRef(
						"CalendarEventBadge.eventId",
						"=",
						"CalendarEventDate.eventId",
					)
					.orderBy("Badge.id", "asc"),
			).as("badges"),
			jsonObjectFrom(
				eb
					.selectFrom("Trophy")
					.select(["Trophy.model"])
					.whereRef("Trophy.id", "=", "CalendarEvent.trophyId"),
			).as("trophy"),
		])
		.where("CalendarEvent.hidden", "=", 0)
		.where(
			"CalendarEventDate.startsAt",
			">=",
			dateToDatabaseTimestamp(startTime),
		)
		.where("CalendarEventDate.startsAt", "<=", dateToDatabaseTimestamp(endTime))
		.$narrowType<{ teamsCount: NotNull; membersCount: NotNull }>()
		.execute();
}

function findAllBetweenTwoTimestampsMapped(
	rows: Awaited<ReturnType<typeof findAllBetweenTwoTimestampsQuery>>,
): Array<{
	at: number;
	events: Array<CalendarEvent>;
}> {
	const mapped: Array<CalendarEvent & { startsAt: number }> = rows.map(
		(row) => {
			const tags = row.tags ?? [];

			const isPastEvent =
				databaseTimestampToDate(row.startsAt) < sub(new Date(), { days: 1 });
			const tentativeTier =
				row.tier === null &&
				row.organizationId !== null &&
				row.tournamentId !== null &&
				!isPastEvent
					? getTentativeTier(row.organizationId, row.name)
					: null;

			return {
				at: databaseTimestampToJavascriptTimestamp(row.startsAt),
				type: "calendar",
				id: row.eventId,
				url: row.tournamentId
					? tournamentPage(row.tournamentId)
					: calendarEventPage(row.eventId),
				name: row.name,
				organization: row.organization,
				authorId: row.authorId,
				tags: tags.filter((tag) => !EXCLUDED_TAGS.includes(tag)),
				teamsCount: row.teamsCount,
				membersCount: row.membersCount,
				minMembersPerTeam: row.tournamentSettings?.minMembersPerTeam ?? 4,
				normalizedTeamCount: normalizedTeamCount({
					teamsCount: row.teamsCount,
					minMembersPerTeam: row.tournamentSettings?.minMembersPerTeam ?? 4,
				}),
				modes: tags.includes("CARDS")
					? ["TB"]
					: tags.includes("SR")
						? ["SR"]
						: row.mapPickingStyle
							? modesIncluded(row.mapPickingStyle, row.toSetMapPool)
							: null,
				badges: row.badges,
				trophy: row.trophy,
				logoUrl: row.logoUrl,
				startsAt: row.normalizedStartsAt,
				isRanked: row.tournamentSettings
					? tournamentIsRanked({
							isSetAsRanked: row.tournamentSettings.isRanked,
							startsAt: databaseTimestampToDate(row.startsAt),
							minMembersPerTeam: row.tournamentSettings.minMembersPerTeam ?? 4,
							isTest: row.tournamentSettings.isTest ?? false,
						})
					: null,
				tier: row.tier ?? null,
				tentativeTier,
			};
		},
	);

	const grouped = R.groupBy(mapped, (row) => row.startsAt);
	const dates = Object.keys(grouped)
		.map((dbTimestamp) => ({
			at: databaseTimestampToDate(Number(dbTimestamp)).getTime(),
			events: grouped[Number(dbTimestamp)].sort(calendarEventSorter),
		}))
		.sort((a, b) => a.at - b.at);

	return dates;
}

export async function findById(
	id: number,
	{
		includeMapPool = false,
		includeTieBreakerMapPool = false,
		includeBadgePrizes = false,
		includeTrophy = false,
	}: {
		includeMapPool?: boolean;
		includeTieBreakerMapPool?: boolean;
		includeBadgePrizes?: boolean;
		includeTrophy?: boolean;
	} = {},
) {
	const [firstRow, ...rest] = await db
		.selectFrom("CalendarEvent")
		.$if(includeMapPool, (qb) => qb.select(withMapPool))
		.$if(includeTieBreakerMapPool, (qb) => qb.select(withTieBreakerMapPool))
		.$if(includeBadgePrizes, (qb) => qb.select(withBadgePrizes))
		.$if(includeTrophy, (qb) => qb.select(withTrophy))
		.innerJoin(
			"CalendarEventDate",
			"CalendarEvent.id",
			"CalendarEventDate.eventId",
		)
		.innerJoin("User", "CalendarEvent.authorId", "User.id")
		.leftJoin("Tournament", "CalendarEvent.tournamentId", "Tournament.id")
		.select((eb) => [
			"CalendarEvent.name",
			"CalendarEvent.description",
			"CalendarEvent.discordInviteCode",
			"CalendarEvent.discordUrl",
			"CalendarEvent.bracketUrl",
			"CalendarEvent.tags",
			"CalendarEvent.tournamentId",
			"CalendarEvent.participantCount",
			"CalendarEvent.avatarImgId",
			"Tournament.mapPickingStyle",
			"CalendarEventDate.startsAt",
			"CalendarEventDate.eventId",
			...commonUserSelect(eb, { idAs: "authorId" }),
			hasBadge(eb),
			tournamentOrganization(eb.ref("CalendarEvent.organizationId")).as(
				"organization",
			),
		])
		.where("CalendarEvent.id", "=", id)
		.orderBy("CalendarEventDate.startsAt", "asc")
		.execute();

	if (!firstRow) return null;

	const startTimes = [firstRow, ...rest].map((row) => row.startsAt);
	const now = new Date();

	return {
		...firstRow,
		tags: firstRow.tags ?? [],
		startTimes,
		startsAt: undefined,
		permissions: {
			EDIT: [firstRow.authorId],
			DELETE:
				databaseTimestampToDate(startTimes[0]) > now ? [firstRow.authorId] : [],
			REPORT_WINNERS: startTimes.every(
				(startTime) => databaseTimestampToDate(startTime) < now,
			)
				? [firstRow.authorId]
				: [],
		},
	};
}

/**
 * Past year's tournaments the user organized (author, organization ADMIN/ORGANIZER or staff
 * ORGANIZER), newest first. Latest event per series only, the next newest filling spare spots.
 */
export async function findRecentTournamentsByOrganizerUserId(userId: number) {
	const tournaments = await db
		.selectFrom("CalendarEvent")
		.innerJoin("Tournament", "Tournament.id", "CalendarEvent.tournamentId")
		.innerJoin(
			"CalendarEventDate",
			"CalendarEvent.id",
			"CalendarEventDate.eventId",
		)
		.select(({ fn }) => [
			"CalendarEvent.id",
			"CalendarEvent.name",
			"CalendarEvent.organizationId",
			fn.min("CalendarEventDate.startsAt").as("startsAt"),
		])
		.where((eb) =>
			eb.or([
				eb("CalendarEvent.authorId", "=", userId),
				eb.exists(
					eb
						.selectFrom("TournamentOrganizationMember")
						.select("TournamentOrganizationMember.userId")
						.whereRef(
							"TournamentOrganizationMember.organizationId",
							"=",
							"CalendarEvent.organizationId",
						)
						.where("TournamentOrganizationMember.userId", "=", userId)
						.where("TournamentOrganizationMember.role", "in", [
							"ADMIN",
							"ORGANIZER",
						]),
				),
				eb.exists(
					eb
						.selectFrom("TournamentStaff")
						.select("TournamentStaff.userId")
						.whereRef(
							"TournamentStaff.tournamentId",
							"=",
							"CalendarEvent.tournamentId",
						)
						.where("TournamentStaff.userId", "=", userId)
						.where("TournamentStaff.role", "=", "ORGANIZER"),
				),
			]),
		)
		.where(
			"CalendarEventDate.startsAt",
			">=",
			dateToDatabaseTimestamp(sub(new Date(), { years: 1 })),
		)
		.groupBy("CalendarEvent.id")
		.orderBy("startsAt", "desc")
		.execute();

	const series =
		await TournamentOrganizationRepository.findAllSeriesByOrganizationIds(
			R.unique(
				tournaments
					.map((tournament) => tournament.organizationId)
					.filter((organizationId) => organizationId !== null),
			),
		);

	const latestOfEachSeries = R.uniqueBy(tournaments, (tournament) => {
		const tournamentSeries = Series.findByEventName({
			series: series.filter(
				(oneSeries) => oneSeries.organizationId === tournament.organizationId,
			),
			eventName: tournament.name,
		});

		return tournamentSeries
			? `series-${tournamentSeries.id}`
			: `event-${tournament.id}`;
	});

	return R.sortBy(
		R.take(
			R.unique([...latestOfEachSeries, ...tournaments]),
			RECENT_TOURNAMENTS_SHOWN,
		),
		[(tournament) => tournament.startsAt, "desc"],
	);
}

export async function findResultsByEventId(eventId: number) {
	return db
		.selectFrom("CalendarEventResultTeam")
		.select(({ eb }) => [
			"CalendarEventResultTeam.id",
			"CalendarEventResultTeam.name as teamName",
			"CalendarEventResultTeam.placement",
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
					),
			).as("players"),
		])
		.where("CalendarEventResultTeam.eventId", "=", eventId)
		.orderBy("CalendarEventResultTeam.placement", "asc")
		.execute();
}

/** Podium players of the events, one row each; players reported as plain text have a `null` id. */
export async function findTopThreeResultsByEventIds(eventIds: number[]) {
	if (eventIds.length === 0) return [];

	return db
		.selectFrom("CalendarEventResultTeam")
		.innerJoin(
			"CalendarEventResultPlayer",
			"CalendarEventResultPlayer.teamId",
			"CalendarEventResultTeam.id",
		)
		.leftJoin("User", "User.id", "CalendarEventResultPlayer.userId")
		.select((eb) => [
			"CalendarEventResultTeam.id as teamId",
			"CalendarEventResultTeam.placement",
			...commonUserSelect(eb),
		])
		.where("CalendarEventResultTeam.eventId", "in", eventIds)
		.where("CalendarEventResultTeam.placement", "<=", 3)
		.execute();
}

type CreateArgs = Pick<
	Tables["CalendarEvent"],
	| "name"
	| "authorId"
	| "tags"
	| "description"
	| "discordInviteCode"
	| "bracketUrl"
	| "organizationId"
> & {
	startTimes: Array<Tables["CalendarEventDate"]["startsAt"]>;
	badges: Array<Tables["CalendarEventBadge"]["badgeId"]>;
	trophyId?: Tables["CalendarEvent"]["trophyId"];
	mapPoolMaps?: Array<Pick<Tables["MapPoolMap"], "mode" | "stageId">>;
	isFullTournament: boolean;
	mapPickingStyle: Tables["Tournament"]["mapPickingStyle"];
	bracketProgression: TournamentSettings["bracketProgression"] | null;
	minMembersPerTeam?: number;
	maxMembersPerTeam?: number;
	teamsPerGroup?: number;
	thirdPlaceMatch?: boolean;
	requireInGameNames?: boolean;
	requireSendouQParticipation?: boolean;
	isRanked?: boolean;
	isTest?: boolean;
	isDraft?: boolean;
	isInvitational?: boolean;
	enableNoScreenToggle?: boolean;
	enableSubs?: boolean;
	autonomousSubs?: boolean;
	regClosesAt?: number;
	rules: string | null;
	tournamentToCopyId?: number | null;
	swissGroupCount?: number;
	swissRoundCount?: number;
	avatarFileName?: string;
	avatarImgId?: number;
	autoValidateAvatar?: boolean;
};
export async function insert(args: CreateArgs) {
	const copiedStaff = args.tournamentToCopyId
		? await db
				.selectFrom("TournamentStaff")
				.select(["role", "userId"])
				.where("tournamentId", "=", args.tournamentToCopyId)
				.where("TournamentStaff.userId", "!=", args.authorId)
				.execute()
		: [];

	return db.transaction().execute(async (trx) => {
		let tournamentId: number | null = null;
		if (args.isFullTournament) {
			invariant(args.bracketProgression, "Expected bracketProgression");
			const settings: Tables["Tournament"]["settings"] = {
				bracketProgression: args.bracketProgression,
				teamsPerGroup: args.teamsPerGroup,
				thirdPlaceMatch: args.thirdPlaceMatch,
				isRanked: args.isRanked,
				isTest: args.isTest,
				isDraft: args.isDraft,
				isInvitational: args.isInvitational,
				enableNoScreenToggle: args.enableNoScreenToggle,
				enableSubs: args.enableSubs,
				autonomousSubs: args.autonomousSubs,
				regClosesAt: args.regClosesAt,
				requireInGameNames: args.requireInGameNames,
				requireSendouQParticipation: args.requireSendouQParticipation,
				minMembersPerTeam: args.minMembersPerTeam,
				maxMembersPerTeam: args.maxMembersPerTeam,
				swiss:
					args.swissGroupCount && args.swissRoundCount
						? {
								groupCount: args.swissGroupCount,
								roundCount: args.swissRoundCount,
							}
						: undefined,
			};

			tournamentId = (
				await trx
					.insertInto("Tournament")
					.values({
						mapPickingStyle: args.mapPickingStyle,
						settings: JSON.stringify(settings),
						rules: args.rules,
					})
					.returning("id")
					.executeTakeFirstOrThrow()
			).id;

			await trx
				.insertInto("TournamentStaff")
				.columns(["role", "userId", "tournamentId"])
				.values(
					copiedStaff.map((staff) => ({
						role: staff.role,
						userId: staff.userId,
						tournamentId: tournamentId!,
					})),
				)
				.execute();
		}

		const avatarImgId = args.avatarFileName
			? await insertSubmittedImage(
					{ avatarFileName: args.avatarFileName, userId: args.authorId },
					trx,
				)
			: null;

		const { id: eventId } = await trx
			.insertInto("CalendarEvent")
			.values({
				name: args.name,
				authorId: args.authorId,
				tags: args.tags ? JSON.stringify(args.tags) : null,
				description: args.description,
				discordInviteCode: args.discordInviteCode,
				bracketUrl: args.bracketUrl,
				avatarImgId: args.avatarImgId ?? avatarImgId,
				organizationId: args.organizationId,
				hidden: args.isTest || args.isDraft ? 1 : 0,
				tournamentId,
				trophyId: args.trophyId ?? null,
			})
			.returning("id")
			.executeTakeFirstOrThrow();

		await insertDates({ eventId, startTimes: args.startTimes }, trx);
		await insertBadges({ eventId, badges: args.badges }, trx);

		await upsertMapPool(
			{
				eventId,
				mapPoolMaps: args.mapPoolMaps ?? [],
				column:
					args.isFullTournament && args.mapPickingStyle !== "TO"
						? "tieBreakerCalendarEventId"
						: "calendarEventId",
			},
			trx,
		);

		return { eventId, tournamentId };
	});
}

async function insertSubmittedImage(
	{ avatarFileName, userId }: { avatarFileName: string; userId: number },
	trx: Transaction<DB>,
) {
	const result = await trx
		.insertInto("UnvalidatedUserSubmittedImage")
		.values({
			url: avatarFileName,
			validatedAt: databaseTimestampNow(),
			submitterUserId: userId,
		})
		.returning("id")
		.executeTakeFirstOrThrow();

	return result.id;
}

type UpdateArgs = Omit<
	CreateArgs,
	"createTournament" | "mapPickingStyle" | "isFullTournament"
> & {
	eventId: number;
};
export async function update(args: UpdateArgs) {
	return db.transaction().execute(async (trx) => {
		const avatarImgId = args.avatarFileName
			? await insertSubmittedImage(
					{ avatarFileName: args.avatarFileName, userId: args.authorId },
					trx,
				)
			: null;

		const { tournamentId } = await trx
			.updateTable("CalendarEvent")
			.set({
				name: args.name,
				tags: args.tags ? JSON.stringify(args.tags) : null,
				description: args.description,
				discordInviteCode: args.discordInviteCode,
				bracketUrl: args.bracketUrl,
				avatarImgId: args.avatarImgId ?? avatarImgId,
				organizationId: args.organizationId,
				trophyId: args.trophyId ?? null,
			})
			.where("id", "=", args.eventId)
			.returning("tournamentId")
			.executeTakeFirstOrThrow();

		const mapPickingStyle = tournamentId
			? await updateTournamentTables(args, trx, tournamentId)
			: null;

		if (tournamentId) {
			const { settings: existingSettings } = await trx
				.selectFrom("Tournament")
				.select(["settings"])
				.where("id", "=", tournamentId)
				.executeTakeFirstOrThrow();

			const hidden = existingSettings.isTest || args.isDraft ? 1 : 0;
			await trx
				.updateTable("CalendarEvent")
				.set({ hidden })
				.where("id", "=", args.eventId)
				.execute();
		}

		await trx
			.deleteFrom("CalendarEventDate")
			.where("eventId", "=", args.eventId)
			.execute();
		await insertDates(
			{ eventId: args.eventId, startTimes: args.startTimes },
			trx,
		);

		await trx
			.deleteFrom("CalendarEventBadge")
			.where("eventId", "=", args.eventId)
			.execute();
		await insertBadges({ eventId: args.eventId, badges: args.badges }, trx);

		if (!tournamentId || mapPickingStyle === "TO") {
			await upsertMapPool(
				{
					eventId: args.eventId,
					mapPoolMaps: args.mapPoolMaps ?? [],
					column: "calendarEventId",
				},
				trx,
			);
		}
	});
}

async function updateTournamentTables(
	args: UpdateArgs,
	trx: Transaction<DB>,
	tournamentId: number,
) {
	invariant(args.bracketProgression, "Expected bracketProgression");

	const existingSettings = (
		await trx
			.selectFrom("Tournament")
			.select("settings")
			.where("id", "=", tournamentId)
			.executeTakeFirstOrThrow()
	).settings;

	const settings: Tables["Tournament"]["settings"] = {
		bracketProgression: args.bracketProgression,
		teamsPerGroup: args.teamsPerGroup,
		thirdPlaceMatch: args.thirdPlaceMatch,
		isRanked: args.isRanked,
		isTest: existingSettings.isTest, // this one is not editable after creation
		isDraft: args.isDraft,
		isInvitational: args.isInvitational,
		enableNoScreenToggle: args.enableNoScreenToggle,
		enableSubs: args.enableSubs,
		autonomousSubs: args.autonomousSubs,
		regClosesAt: args.regClosesAt,
		requireInGameNames: args.requireInGameNames,
		requireSendouQParticipation: args.requireSendouQParticipation,
		minMembersPerTeam: args.minMembersPerTeam,
		maxMembersPerTeam: args.maxMembersPerTeam,
		swiss:
			args.swissGroupCount && args.swissRoundCount
				? {
						groupCount: args.swissGroupCount,
						roundCount: args.swissRoundCount,
					}
				: undefined,
	};

	const changedFormat = Progression.changedBracketProgressionFormat(
		existingSettings.bracketProgression,
		args.bracketProgression,
	);

	const { mapPickingStyle } = await trx
		.updateTable("Tournament")
		.set({
			settings: JSON.stringify(settings),
			rules: args.rules,
			preparedMaps: changedFormat ? null : undefined,
		})
		.where("id", "=", tournamentId)
		.returning("mapPickingStyle")
		.executeTakeFirstOrThrow();

	if (
		changedFormat ||
		Progression.changedStartingBrackets(
			existingSettings.bracketProgression,
			args.bracketProgression,
		)
	) {
		await trx
			.updateTable("TournamentTeam")
			.set({ startingBracketIdx: null })
			.where("tournamentId", "=", tournamentId)
			.execute();
	}

	return mapPickingStyle;
}

function insertDates(
	{
		eventId,
		startTimes,
	}: { eventId: number; startTimes: CreateArgs["startTimes"] },
	trx: Transaction<DB>,
) {
	return trx
		.insertInto("CalendarEventDate")
		.values(startTimes.map((startsAt) => ({ startsAt, eventId })))
		.execute();
}

function insertBadges(
	{ eventId, badges }: { eventId: number; badges: CreateArgs["badges"] },
	trx: Transaction<DB>,
) {
	return trx
		.insertInto("CalendarEventBadge")
		.values(
			badges.map((badgeId) => ({
				eventId,
				badgeId,
			})),
		)
		.execute();
}

export function upsertReportedScores(args: {
	eventId: number;
	participantCount: number;
	results: Array<{
		teamName: string;
		placement: number;
		players: Array<{
			userId: number | null;
			name: string | null;
		}>;
	}>;
}) {
	return db.transaction().execute(async (trx) => {
		await trx
			.updateTable("CalendarEvent")
			.set({
				participantCount: args.participantCount,
			})
			.where("id", "=", args.eventId)
			.execute();
		await trx
			.deleteFrom("CalendarEventResultTeam")
			.where("eventId", "=", args.eventId)
			.execute();

		const insertedTeams = await trx
			.insertInto("CalendarEventResultTeam")
			.values(
				args.results.map((result) => ({
					eventId: args.eventId,
					name: result.teamName,
					placement: result.placement,
				})),
			)
			.returning("CalendarEventResultTeam.id")
			.execute();

		const teamIds = insertedTeams.map((team) => team.id).sort((a, b) => a - b);

		const players = args.results.flatMap((result, i) =>
			result.players.map((player) => ({
				teamId: teamIds[i],
				name: player.name,
				userId: player.userId,
			})),
		);

		await trx.insertInto("CalendarEventResultPlayer").values(players).execute();
	});
}

async function upsertMapPool(
	{
		eventId,
		mapPoolMaps,
		column,
	}: {
		eventId: number;
		mapPoolMaps: NonNullable<CreateArgs["mapPoolMaps"]>;
		column: "tieBreakerCalendarEventId" | "calendarEventId";
	},
	trx: Transaction<DB>,
) {
	await trx
		.deleteFrom("MapPoolMap")
		.where((eb) =>
			eb.or([
				eb("calendarEventId", "=", eventId),
				eb("tieBreakerCalendarEventId", "=", eventId),
			]),
		)
		.execute();

	await trx
		.insertInto("MapPoolMap")
		.values(
			mapPoolMaps.map((mapPoolMap) => ({
				stageId: mapPoolMap.stageId,
				mode: mapPoolMap.mode,
				[column]: eventId,
			})),
		)
		.execute();
}

export function deleteById({
	eventId,
	tournamentId,
}: {
	eventId: number;
	tournamentId: number | null;
}) {
	return db.transaction().execute(async (trx) => {
		await trx.deleteFrom("CalendarEvent").where("id", "=", eventId).execute();
		if (tournamentId) {
			const teamChatRooms = await trx
				.selectFrom("TournamentTeam")
				.select("TournamentTeam.chatRoomId")
				.where("TournamentTeam.tournamentId", "=", tournamentId)
				.where("TournamentTeam.chatRoomId", "is not", null)
				.execute();
			const matchChatRooms = await trx
				.selectFrom("TournamentMatch")
				.innerJoin(
					"TournamentStage",
					"TournamentStage.id",
					"TournamentMatch.stageId",
				)
				.select("TournamentMatch.chatRoomId")
				.where("TournamentStage.tournamentId", "=", tournamentId)
				.where("TournamentMatch.chatRoomId", "is not", null)
				.execute();
			await ChatRepository.deleteRoomsByIds(
				[...teamChatRooms, ...matchChatRooms].map((room) => room.chatRoomId),
				trx,
			);

			await trx
				.deleteFrom("Tournament")
				.where("id", "=", tournamentId)
				.execute();
		}
	});
}
