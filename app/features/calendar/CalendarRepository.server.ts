import type {
	Expression,
	ExpressionBuilder,
	NotNull,
	Transaction,
} from "kysely";
import { sql } from "kysely";
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite";
import * as R from "remeda";
import { db } from "~/db/sql";
import type {
	CalendarEventTag,
	DB,
	Tables,
	TournamentSettings,
} from "~/db/tables";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import {
	databaseTimestampNow,
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import invariant from "~/utils/invariant";
import { calendarEventPage, tournamentPage } from "~/utils/urls";
import {
	normalizedTeamCount,
	tournamentIsRanked,
} from "../tournament/tournament-utils";
import type { CalendarEvent } from "./calendar-types";
import { calendarEventSorter } from "./calendar-utils";

// TODO: convert from raw to using the "exists" function
const hasBadge = sql<number> /* sql */`exists (
  select
    1
  from
    "CalendarEventBadge"
  where
    "CalendarEventBadge"."eventId" = "CalendarEventDate"."eventId"
)`.as("hasBadge");

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

function tournamentOrganization(organizationId: Expression<number | null>) {
	return jsonObjectFrom(
		db
			.selectFrom("TournamentOrganization")
			.leftJoin(
				"UserSubmittedImage",
				"TournamentOrganization.avatarImgId",
				"UserSubmittedImage.id",
			)
			.select([
				"TournamentOrganization.id",
				"TournamentOrganization.name",
				"TournamentOrganization.slug",
				"UserSubmittedImage.url as avatarUrl",
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

// xxx: move for showcase here and dedupe
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
			"Tournament.id as tournamentId",
			"Tournament.settings as tournamentSettings",
			"CalendarEvent.name",
			"CalendarEvent.tags",
			"CalendarEventDate.startTime",
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
					.selectFrom("CalendarEventBadge")
					.innerJoin("Badge", "CalendarEventBadge.badgeId", "Badge.id")
					.select(["Badge.id", "Badge.code", "Badge.hue", "Badge.displayName"])
					.whereRef(
						"CalendarEventBadge.eventId",
						"=",
						"CalendarEventDate.eventId",
					),
			).as("badges"),
			eb
				.selectFrom("TournamentTeam")
				.leftJoin("TournamentTeamCheckIn", (join) =>
					join
						.on("TournamentTeamCheckIn.bracketIdx", "is", null)
						.onRef(
							"TournamentTeamCheckIn.tournamentTeamId",
							"=",
							"TournamentTeam.id",
						),
				)
				.whereRef("TournamentTeam.tournamentId", "=", "Tournament.id")
				.where((eb) =>
					eb.or([
						eb("TournamentTeamCheckIn.checkedInAt", "is not", null),
						eb("CalendarEventDate.startTime", ">", databaseTimestampNow()),
					]),
				)
				.select(({ fn }) => [fn.countAll<number>().as("teamsCount")])
				.as("teamsCount"),
			eb
				.selectFrom("UserSubmittedImage")
				.select(["UserSubmittedImage.url"])
				.whereRef("CalendarEvent.avatarImgId", "=", "UserSubmittedImage.id")
				.as("logoUrl"),
		])
		.where("CalendarEvent.hidden", "=", 0)
		.where(
			"CalendarEventDate.startTime",
			">=",
			dateToDatabaseTimestamp(startTime),
		)
		.where(
			"CalendarEventDate.startTime",
			"<=",
			dateToDatabaseTimestamp(endTime),
		)
		.$narrowType<{ teamsCount: NotNull }>()
		.execute();
}

function findAllBetweenTwoTimestampsMapped(
	rows: Awaited<ReturnType<typeof findAllBetweenTwoTimestampsQuery>>,
): Array<{
	at: number;
	events: Array<CalendarEvent>;
}> {
	const mapped: Array<CalendarEvent & { startTime: number }> = rows.map(
		(row) => ({
			type: "calendar",
			id: row.eventId,
			url: row.tournamentId
				? tournamentPage(row.tournamentId)
				: calendarEventPage(row.eventId),
			name: row.name,
			organization: row.organization,
			tags: row.tags ? (row.tags.split(",") as CalendarEvent["tags"]) : [],
			badges: row.badges,
			teamsCount: row.teamsCount,
			normalizedTeamCount: normalizedTeamCount({
				teamsCount: row.teamsCount,
				minMembersPerTeam: row.tournamentSettings?.minMembersPerTeam ?? 4,
			}),
			logoUrl: row.logoUrl,
			startTime: row.startTime,
			isRanked: row.tournamentSettings
				? tournamentIsRanked({
						isSetAsRanked: row.tournamentSettings.isRanked,
						startTime: databaseTimestampToDate(row.startTime),
						minMembersPerTeam: row.tournamentSettings.minMembersPerTeam ?? 4,
						isTest: row.tournamentSettings.isTest ?? false,
					})
				: null,
		}),
	);

	const grouped = R.groupBy(mapped, (row) => row.startTime);
	const dates = Object.keys(grouped)
		.map((dbTimestamp) => ({
			at: databaseTimestampToDate(Number(dbTimestamp)).getTime(),
			events: grouped[Number(dbTimestamp)].sort(calendarEventSorter),
		}))
		.sort((a, b) => a.at - b.at);

	return dates;
}

export async function findById({
	id,
	includeMapPool = false,
	includeTieBreakerMapPool = false,
	includeBadgePrizes = false,
}: {
	id: number;
	includeMapPool?: boolean;
	includeTieBreakerMapPool?: boolean;
	includeBadgePrizes?: boolean;
}) {
	const [firstRow, ...rest] = await db
		.selectFrom("CalendarEvent")
		.$if(includeMapPool, (qb) => qb.select(withMapPool))
		.$if(includeTieBreakerMapPool, (qb) => qb.select(withTieBreakerMapPool))
		.$if(includeBadgePrizes, (qb) => qb.select(withBadgePrizes))
		.innerJoin(
			"CalendarEventDate",
			"CalendarEvent.id",
			"CalendarEventDate.eventId",
		)
		.innerJoin("User", "CalendarEvent.authorId", "User.id")
		.leftJoin("Tournament", "CalendarEvent.tournamentId", "Tournament.id")
		.select(({ ref }) => [
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
			"User.id as authorId",
			"CalendarEventDate.startTime",
			"CalendarEventDate.eventId",
			"User.username",
			"User.discordId",
			"User.discordAvatar",
			hasBadge,
			tournamentOrganization(ref("CalendarEvent.organizationId")).as(
				"organization",
			),
		])
		.where("CalendarEvent.id", "=", id)
		.orderBy("CalendarEventDate.startTime", "asc")
		.execute();

	if (!firstRow) return null;

	return {
		...firstRow,
		tags: tagsArray(firstRow),
		startTimes: [firstRow, ...rest].map((row) => row.startTime),
		startTime: undefined,
	};
}

export async function findRecentTournamentsByAuthorId(authorId: number) {
	return db
		.selectFrom("CalendarEvent")
		.innerJoin("Tournament", "Tournament.id", "CalendarEvent.tournamentId")
		.innerJoin(
			"CalendarEventDate",
			"CalendarEvent.id",
			"CalendarEventDate.eventId",
		)
		.select([
			"CalendarEvent.id",
			"CalendarEvent.name",
			"CalendarEventDate.startTime",
		])
		.where("CalendarEvent.authorId", "=", authorId)
		.orderBy("CalendarEvent.id", "desc")
		.limit(10)
		.execute();
}

function tagsArray(args: {
	hasBadge: number;
	tags?: Tables["CalendarEvent"]["tags"];
	tournamentId: Tables["CalendarEvent"]["tournamentId"];
}) {
	const tags = (
		args.tags ? args.tags.split(",") : []
	) as Array<CalendarEventTag>;

	if (args.hasBadge) tags.unshift("BADGE");

	return tags;
}

export async function findRecentMapPoolsByAuthorId(authorId: number) {
	const rows = await db
		.selectFrom("CalendarEvent")
		.innerJoin("MapPoolMap", "CalendarEvent.id", "MapPoolMap.calendarEventId")
		.select(({ eb }) => [
			"CalendarEvent.id",
			"CalendarEvent.name",
			withMapPool(eb),
		])
		.where("CalendarEvent.authorId", "=", authorId)
		.where("CalendarEvent.hidden", "=", 0)
		.orderBy("CalendarEvent.id", "desc")
		.groupBy("CalendarEvent.id")
		.limit(5)
		.execute();

	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		serializedMapPool: MapPool.serialize(row.mapPool),
	}));
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
					.select([
						"CalendarEventResultPlayer.userId as id",
						"CalendarEventResultPlayer.name",
						"User.username",
						"User.discordId",
						"User.discordAvatar",
						"User.customUrl",
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

export async function allEventsWithMapPools() {
	const rows = await db
		.selectFrom("CalendarEvent")
		.select(({ eb }) => [
			"CalendarEvent.id",
			"CalendarEvent.name",
			jsonArrayFrom(
				eb
					.selectFrom("MapPoolMap")
					.select(["MapPoolMap.stageId", "MapPoolMap.mode"])
					.whereRef("MapPoolMap.calendarEventId", "=", "CalendarEvent.id"),
			).as("mapPool"),
		])
		.innerJoin("MapPoolMap", "CalendarEvent.id", "MapPoolMap.calendarEventId")
		.groupBy("CalendarEvent.id")
		.orderBy("CalendarEvent.id", "desc")
		.execute();

	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		serializedMapPool: MapPool.serialize(row.mapPool),
	}));
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
	startTimes: Array<Tables["CalendarEventDate"]["startTime"]>;
	badges: Array<Tables["CalendarEventBadge"]["badgeId"]>;
	mapPoolMaps?: Array<Pick<Tables["MapPoolMap"], "mode" | "stageId">>;
	isFullTournament: boolean;
	mapPickingStyle: Tables["Tournament"]["mapPickingStyle"];
	bracketProgression: TournamentSettings["bracketProgression"] | null;
	minMembersPerTeam?: number;
	teamsPerGroup?: number;
	thirdPlaceMatch?: boolean;
	requireInGameNames?: boolean;
	isRanked?: boolean;
	isTest?: boolean;
	isInvitational?: boolean;
	deadlines: TournamentSettings["deadlines"];
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
	parentTournamentId?: number;
};
export async function create(args: CreateArgs) {
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
				deadlines: args.deadlines,
				isInvitational: args.isInvitational,
				enableNoScreenToggle: args.enableNoScreenToggle,
				enableSubs: args.enableSubs,
				autonomousSubs: args.autonomousSubs,
				regClosesAt: args.regClosesAt,
				requireInGameNames: args.requireInGameNames,
				minMembersPerTeam: args.minMembersPerTeam,
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
						parentTournamentId: args.parentTournamentId,
						rules: args.rules,
					})
					.returning("id")
					.executeTakeFirstOrThrow()
			).id;

			if (copiedStaff.length > 0) {
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
		}

		const avatarImgId = args.avatarFileName
			? await createSubmittedImageInTrx({
					trx,
					avatarFileName: args.avatarFileName,
					autoValidateAvatar: args.autoValidateAvatar,
					userId: args.authorId,
				})
			: null;

		const { id: eventId } = await trx
			.insertInto("CalendarEvent")
			.values({
				name: args.name,
				authorId: args.authorId,
				tags: args.tags,
				description: args.description,
				discordInviteCode: args.discordInviteCode,
				bracketUrl: args.bracketUrl,
				avatarImgId: args.avatarImgId ?? avatarImgId,
				organizationId: args.organizationId,
				hidden: args.parentTournamentId || args.isTest ? 1 : 0,
				tournamentId,
			})
			.returning("id")
			.executeTakeFirstOrThrow();

		await createDatesInTrx({ eventId, startTimes: args.startTimes, trx });
		await createBadgesInTrx({ eventId, badges: args.badges, trx });

		await upsertMapPoolInTrx({
			trx,
			eventId,
			mapPoolMaps: args.mapPoolMaps ?? [],
			column:
				args.isFullTournament && args.mapPickingStyle !== "TO"
					? "tieBreakerCalendarEventId"
					: "calendarEventId",
		});

		return { eventId, tournamentId };
	});
}

async function createSubmittedImageInTrx({
	trx,
	autoValidateAvatar,
	avatarFileName,
	userId,
}: {
	trx: Transaction<DB>;
	avatarFileName: string;
	autoValidateAvatar?: boolean;
	userId: number;
}) {
	const result = await trx
		.insertInto("UnvalidatedUserSubmittedImage")
		.values({
			url: avatarFileName,
			validatedAt: autoValidateAvatar ? databaseTimestampNow() : null,
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
			? await createSubmittedImageInTrx({
					trx,
					avatarFileName: args.avatarFileName,
					autoValidateAvatar: args.autoValidateAvatar,
					userId: args.authorId,
				})
			: null;

		const { tournamentId } = await trx
			.updateTable("CalendarEvent")
			.set({
				name: args.name,
				tags: args.tags,
				description: args.description,
				discordInviteCode: args.discordInviteCode,
				bracketUrl: args.bracketUrl,
				avatarImgId: args.avatarImgId ?? avatarImgId,
				organizationId: args.organizationId,
			})
			.where("id", "=", args.eventId)
			.returning("tournamentId")
			.executeTakeFirstOrThrow();

		let mapPickingStyle: Tables["Tournament"]["mapPickingStyle"] | undefined;
		if (tournamentId) {
			invariant(args.bracketProgression, "Expected bracketProgression");
			const settings: Tables["Tournament"]["settings"] = {
				bracketProgression: args.bracketProgression,
				teamsPerGroup: args.teamsPerGroup,
				thirdPlaceMatch: args.thirdPlaceMatch,
				isRanked: args.isRanked,
				isTest: args.isTest,
				deadlines: args.deadlines,
				isInvitational: args.isInvitational,
				enableNoScreenToggle: args.enableNoScreenToggle,
				enableSubs: args.enableSubs,
				autonomousSubs: args.autonomousSubs,
				regClosesAt: args.regClosesAt,
				requireInGameNames: args.requireInGameNames,
				minMembersPerTeam: args.minMembersPerTeam,
				swiss:
					args.swissGroupCount && args.swissRoundCount
						? {
								groupCount: args.swissGroupCount,
								roundCount: args.swissRoundCount,
							}
						: undefined,
			};

			const existingBracketProgression = (
				await trx
					.selectFrom("Tournament")
					.select("settings")
					.where("id", "=", tournamentId)
					.executeTakeFirstOrThrow()
			).settings.bracketProgression;

			const { mapPickingStyle: _mapPickingStyle } = await trx
				.updateTable("Tournament")
				.set({
					settings: JSON.stringify(settings),
					rules: args.rules,
					preparedMaps: Progression.changedBracketProgressionFormat(
						existingBracketProgression,
						args.bracketProgression,
					)
						? null
						: undefined,
				})
				.where("id", "=", tournamentId)
				.returning("mapPickingStyle")
				.executeTakeFirstOrThrow();

			if (
				Progression.changedBracketProgressionFormat(
					existingBracketProgression,
					args.bracketProgression,
				)
			) {
				await trx
					.updateTable("TournamentTeam")
					.set({ startingBracketIdx: null })
					.where("tournamentId", "=", tournamentId)
					.execute();
			}

			mapPickingStyle = _mapPickingStyle;
		}

		await trx
			.deleteFrom("CalendarEventDate")
			.where("eventId", "=", args.eventId)
			.execute();
		await createDatesInTrx({
			eventId: args.eventId,
			startTimes: args.startTimes,
			trx,
		});

		await trx
			.deleteFrom("CalendarEventBadge")
			.where("eventId", "=", args.eventId)
			.execute();
		await createBadgesInTrx({
			eventId: args.eventId,
			badges: args.badges,
			trx,
		});

		if (!tournamentId || mapPickingStyle === "TO") {
			await upsertMapPoolInTrx({
				trx,
				eventId: args.eventId,
				mapPoolMaps: args.mapPoolMaps ?? [],
				column: "calendarEventId",
			});
		}
	});
}

function createDatesInTrx({
	eventId,
	startTimes,
	trx,
}: {
	eventId: number;
	startTimes: CreateArgs["startTimes"];
	trx: Transaction<DB>;
}) {
	return trx
		.insertInto("CalendarEventDate")
		.values(startTimes.map((startTime) => ({ startTime, eventId })))
		.execute();
}

function createBadgesInTrx({
	eventId,
	badges,
	trx,
}: {
	eventId: number;
	badges: CreateArgs["badges"];
	trx: Transaction<DB>;
}) {
	if (!badges.length) return;

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

		for (const result of args.results) {
			const insertedResultTeam = await trx
				.insertInto("CalendarEventResultTeam")
				.values({
					eventId: args.eventId,
					name: result.teamName,
					placement: result.placement,
				})
				.returning("CalendarEventResultTeam.id")
				.executeTakeFirstOrThrow();

			await trx
				.insertInto("CalendarEventResultPlayer")
				.values(
					result.players.map((player) => ({
						teamId: insertedResultTeam.id,
						name: player.name,
						userId: player.userId,
					})),
				)
				.execute();
		}
	});
}

async function upsertMapPoolInTrx({
	eventId,
	mapPoolMaps,
	column,
	trx,
}: {
	eventId: number;
	mapPoolMaps: NonNullable<CreateArgs["mapPoolMaps"]>;
	column: "tieBreakerCalendarEventId" | "calendarEventId";
	trx: Transaction<DB>;
}) {
	await trx
		.deleteFrom("MapPoolMap")
		.where((eb) =>
			eb.or([
				eb("calendarEventId", "=", eventId),
				eb("tieBreakerCalendarEventId", "=", eventId),
			]),
		)
		.execute();

	if (!mapPoolMaps.length) return;

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
			await trx
				.deleteFrom("Tournament")
				.where("id", "=", tournamentId)
				.execute();
		}
	});
}
