import { sql, Transaction, type Expression, type ExpressionBuilder, type NotNull } from 'kysely';
import { db } from '../sql';
import { jsonArrayFrom, jsonObjectFrom } from 'kysely/helpers/sqlite';
import { COMMON_USER_FIELDS } from '$lib/utils/kysely.server';
import { sub } from 'date-fns';
import type { CalendarEventUserSelectableTag, DB, Tables } from '../tables';
import type { Unwrapped } from '$lib/utils/types';
import type * as CalendarAPI from '$lib/api/calendar';
import * as MapPool from '$lib/core/maps/MapPool';
import { userSelectableTags } from '$lib/constants/calendar';
import { dateToDatabaseTimestamp } from '$lib/utils/dates';
import type { SchemaToFunctionInput } from '$lib/server/remote-functions';

// TODO: convert from raw to using the "exists" function
const hasBadge = sql<number> /* sql */ `exists (
  select
    1
  from
    "CalendarEventBadge"
  where
    "CalendarEventBadge"."eventId" = "CalendarEventDate"."eventId"
)`.as('hasBadge');
function withMapPool(eb: ExpressionBuilder<DB, 'CalendarEvent'>) {
	return jsonArrayFrom(
		eb
			.selectFrom('MapPoolMap')
			.select(['MapPoolMap.stageId', 'MapPoolMap.mode'])
			.whereRef('MapPoolMap.calendarEventId', '=', 'CalendarEvent.id')
	).as('mapPool');
}

function withTieBreakerMapPool(eb: ExpressionBuilder<DB, 'CalendarEvent'>) {
	return jsonArrayFrom(
		eb
			.selectFrom('MapPoolMap')
			.select(['MapPoolMap.stageId', 'MapPoolMap.mode'])
			.whereRef('MapPoolMap.tieBreakerCalendarEventId', '=', 'CalendarEvent.id')
	).as('tieBreakerMapPool');
}

function withBadgePrizes(eb: ExpressionBuilder<DB, 'CalendarEvent'>) {
	return jsonArrayFrom(
		eb
			.selectFrom('CalendarEventBadge')
			.innerJoin('Badge', 'CalendarEventBadge.badgeId', 'Badge.id')
			.select(['Badge.id', 'Badge.code', 'Badge.displayName'])
			.whereRef('CalendarEventBadge.eventId', '=', 'CalendarEvent.id')
	).as('badgePrizes');
}

function tournamentOrganization(organizationId: Expression<number | null>) {
	return jsonObjectFrom(
		db
			.selectFrom('TournamentOrganization')
			.leftJoin('UserSubmittedImage', 'TournamentOrganization.avatarImgId', 'UserSubmittedImage.id')
			.select([
				'TournamentOrganization.id',
				'TournamentOrganization.name',
				'TournamentOrganization.slug',
				'UserSubmittedImage.url as avatarUrl'
			])
			.whereRef('TournamentOrganization.id', '=', organizationId)
	);
}

// interface FindAllBetweenTwoTimestampsArgs {
// 	startTime: Date;
// 	endTime: Date;
// }

// export async function findAllBetweenTwoTimestamps(args: FindAllBetweenTwoTimestampsArgs) {
// 	const rows = await findAllBetweenTwoTimestampsQuery(args);
// 	return findAllBetweenTwoTimestampsMapped(rows);
// }

function withOrganization(eb: ExpressionBuilder<DB, 'CalendarEvent'>) {
	return jsonObjectFrom(
		eb
			.selectFrom('TournamentOrganization')
			.select(['TournamentOrganization.name', 'TournamentOrganization.slug'])
			.whereRef('TournamentOrganization.id', '=', 'CalendarEvent.organizationId')
	);
}

function withTeamsCount(eb: ExpressionBuilder<DB, 'CalendarEventDate' | 'Tournament'>) {
	return eb
		.selectFrom('TournamentTeam')
		.leftJoin('TournamentTeamCheckIn', (join) =>
			join
				.on('TournamentTeamCheckIn.bracketIdx', 'is', null)
				.onRef('TournamentTeamCheckIn.tournamentTeamId', '=', 'TournamentTeam.id')
		)
		.whereRef('TournamentTeam.tournamentId', '=', 'Tournament.id')
		.where((eb) =>
			eb.or([
				eb('TournamentTeamCheckIn.checkedInAt', 'is not', null),
				eb('CalendarEventDate.startTime', '>', new Date())
			])
		)
		.select(({ fn }) => [fn.countAll<number>().as('teamsCount')]);
}

function withLogoUrl(eb: ExpressionBuilder<DB, 'CalendarEvent'>) {
	return eb
		.selectFrom('UserSubmittedImage')
		.select(['UserSubmittedImage.url'])
		.whereRef('CalendarEvent.avatarImgId', '=', 'UserSubmittedImage.id');
}

// function findAllBetweenTwoTimestampsQuery({ startTime, endTime }: FindAllBetweenTwoTimestampsArgs) {
// 	return db
// 		.selectFrom('CalendarEvent')
// 		.innerJoin('CalendarEventDate', 'CalendarEvent.id', 'CalendarEventDate.eventId')
// 		.leftJoin('Tournament', 'CalendarEvent.tournamentId', 'Tournament.id')
// 		.select((eb) => [
// 			'CalendarEvent.id as eventId',
// 			'CalendarEvent.authorId',
// 			'Tournament.id as tournamentId',
// 			'Tournament.settings as tournamentSettings',
// 			'Tournament.mapPickingStyle',
// 			'CalendarEvent.name',
// 			'CalendarEvent.tags',
// 			'CalendarEventDate.startTime',
// 			// events get grouped to their closest :00 or :30 so for example users can't make their event start at :59 to make it show at the top
// 			sql<number>`(("CalendarEventDate"."startTime" + 900) / 1800) * 1800`.as(
// 				'normalizedStartTime'
// 			),
// 			withOrganization(eb).as('organization'),
// 			withTeamsCount(eb).as('teamsCount'),
// 			withLogoUrl(eb).as('logoUrl'),
// 			jsonArrayFrom(
// 				eb
// 					.selectFrom('MapPoolMap')
// 					.select(['MapPoolMap.mode'])
// 					.whereRef('MapPoolMap.calendarEventId', '=', 'CalendarEvent.id')
// 			).as('toSetMapPool'),
// 			jsonArrayFrom(
// 				eb
// 					.selectFrom('CalendarEventBadge')
// 					.innerJoin('Badge', 'CalendarEventBadge.badgeId', 'Badge.id')
// 					.select(['Badge.id', 'Badge.code', 'Badge.displayName'])
// 					.whereRef('CalendarEventBadge.eventId', '=', 'CalendarEventDate.eventId')
// 					.orderBy('Badge.id', 'asc')
// 			).as('badges')
// 		])
// 		.where('CalendarEvent.hidden', '=', 0)
// 		.where('CalendarEventDate.startTime', '>=', startTime)
// 		.where('CalendarEventDate.startTime', '<=', endTime)
// 		.$narrowType<{ teamsCount: NotNull }>()
// 		.execute();
// }

// function findAllBetweenTwoTimestampsMapped(
// 	rows: Awaited<ReturnType<typeof findAllBetweenTwoTimestampsQuery>>
// ): Array<{
// 	at: number;
// 	events: Array<Tables['CalendarEvent']>;
// }> {
// 	const mapped: Array<Tables['CalendarEvent'] & { startTime: number }> = rows.map((row) => {
// 		const tags = row.tags ? (row.tags.split(',') as Array<CalendarEventUserSelectableTag>) : [];

// 		return {
// 			at: row.startTime,
// 			type: 'calendar',
// 			id: row.eventId,
// 			url: row.tournamentId ? tournamentPage(row.tournamentId) : calendarEventPage(row.eventId),
// 			name: row.name,
// 			organization: row.organization,
// 			authorId: row.authorId,
// 			tags: tags.filter((tag) => !EXCLUDED_TAGS.includes(tag)),
// 			teamsCount: row.teamsCount,
// 			normalizedTeamCount: normalizedTeamCount({
// 				teamsCount: row.teamsCount,
// 				minMembersPerTeam: row.tournamentSettings?.minMembersPerTeam ?? 4
// 			}),
// 			modes: tags.includes('CARDS')
// 				? ['TB']
// 				: tags.includes('SR')
// 					? ['SR']
// 					: row.mapPickingStyle
// 						? modesIncluded(row.mapPickingStyle, row.toSetMapPool)
// 						: null,
// 			badges: row.badges,
// 			logoUrl: row.logoUrl,
// 			startTime: row.normalizedStartTime,
// 			isRanked: row.tournamentSettings
// 				? tournamentIsRanked({
// 						isSetAsRanked: row.tournamentSettings.isRanked,
// 						startTime: databaseTimestampToDate(row.startTime),
// 						minMembersPerTeam: row.tournamentSettings.minMembersPerTeam ?? 4,
// 						isTest: row.tournamentSettings.isTest ?? false
// 					})
// 				: null
// 		};
// 	});

// 	const grouped = R.groupBy(mapped, (row) => row.startTime);
// 	const dates = Object.keys(grouped)
// 		.map((dbTimestamp) => ({
// 			at: databaseTimestampToDate(Number(dbTimestamp)).getTime(),
// 			events: grouped[Number(dbTimestamp)].sort(calendarEventSorter)
// 		}))
// 		.sort((a, b) => a.at - b.at);

// 	return dates;
// }

export type ForShowcase = Unwrapped<typeof forShowcase>;

export function forShowcase() {
	return db
		.selectFrom('Tournament')
		.innerJoin('CalendarEvent', 'Tournament.id', 'CalendarEvent.tournamentId')
		.innerJoin('CalendarEventDate', 'CalendarEvent.id', 'CalendarEventDate.eventId')
		.select((eb) => [
			'Tournament.id',
			'Tournament.settings',
			'CalendarEvent.authorId',
			'CalendarEvent.name',
			'CalendarEventDate.startTime',
			withTeamsCount(eb).as('teamsCount'),
			withLogoUrl(eb).as('logoUrl'),
			withOrganization(eb).as('organization'),
			jsonArrayFrom(
				eb
					.selectFrom('TournamentResult')
					.innerJoin('User', 'TournamentResult.userId', 'User.id')
					.innerJoin('TournamentTeam', 'TournamentResult.tournamentTeamId', 'TournamentTeam.id')
					.leftJoin('AllTeam', 'TournamentTeam.teamId', 'AllTeam.id')
					.leftJoin('UserSubmittedImage as TeamAvatar', 'AllTeam.avatarImgId', 'TeamAvatar.id')
					.leftJoin(
						'UserSubmittedImage as TournamentTeamAvatar',
						'TournamentTeam.avatarImgId',
						'TournamentTeamAvatar.id'
					)
					.whereRef('TournamentResult.tournamentId', '=', 'Tournament.id')
					.where('TournamentResult.placement', '=', 1)
					.select([
						...COMMON_USER_FIELDS,
						'User.country',
						'TournamentTeam.name as teamName',
						'TeamAvatar.url as teamLogoUrl',
						'TournamentTeamAvatar.url as pickupAvatarUrl'
					])
			).as('firstPlacers')
		])
		.where('CalendarEvent.hidden', '=', 0)
		.where('CalendarEventDate.startTime', '>', sub(new Date(), { days: 7 }))
		.orderBy('CalendarEventDate.startTime', 'asc')
		.$narrowType<{ teamsCount: NotNull }>()
		.execute();
}

export async function findById(
	id: number,
	{
		includeMapPool = false,
		includeTieBreakerMapPool = false,
		includeBadgePrizes = false
	}: {
		includeMapPool?: boolean;
		includeTieBreakerMapPool?: boolean;
		includeBadgePrizes?: boolean;
	}
) {
	const [firstRow, ...rest] = await db
		.selectFrom('CalendarEvent')
		.$if(includeMapPool, (qb) => qb.select(withMapPool))
		.$if(includeTieBreakerMapPool, (qb) => qb.select(withTieBreakerMapPool))
		.$if(includeBadgePrizes, (qb) => qb.select(withBadgePrizes))
		.innerJoin('CalendarEventDate', 'CalendarEvent.id', 'CalendarEventDate.eventId')
		.innerJoin('User', 'CalendarEvent.authorId', 'User.id')
		.leftJoin('Tournament', 'CalendarEvent.tournamentId', 'Tournament.id')
		.select(({ ref }) => [
			'CalendarEvent.name',
			'CalendarEvent.description',
			'CalendarEvent.discordInviteCode',
			'CalendarEvent.discordUrl',
			'CalendarEvent.bracketUrl',
			'CalendarEvent.tags',
			'CalendarEvent.tournamentId',
			'CalendarEvent.participantCount',
			'CalendarEvent.avatarImgId',
			'Tournament.mapPickingStyle',
			'User.id as authorId',
			'CalendarEventDate.startTime',
			'CalendarEventDate.eventId',
			'User.username',
			'User.discordId',
			'User.discordAvatar',
			'User.customUrl',
			hasBadge,
			tournamentOrganization(ref('CalendarEvent.organizationId')).as('organization')
		])
		.where('CalendarEvent.id', '=', id)
		.orderBy('CalendarEventDate.startTime', 'asc')
		.execute();

	if (!firstRow) return null;

	return {
		...firstRow,
		mapPool: firstRow.mapPool ? MapPool.fromArray(firstRow.mapPool) : undefined,
		tags: tagsArray(firstRow),
		startTimes: [firstRow, ...rest].map((row) => row.startTime),
		startTime: undefined,
		permissions: {
			EDIT: [firstRow.authorId]
		}
	};
}

export async function findRecentTournamentsByAuthorId(authorId: number) {
	return db
		.selectFrom('CalendarEvent')
		.innerJoin('Tournament', 'Tournament.id', 'CalendarEvent.tournamentId')
		.innerJoin('CalendarEventDate', 'CalendarEvent.id', 'CalendarEventDate.eventId')
		.select(['CalendarEvent.id', 'CalendarEvent.name', 'CalendarEventDate.startTime'])
		.where('CalendarEvent.authorId', '=', authorId)
		.orderBy('CalendarEvent.id', 'desc')
		.limit(10)
		.execute();
}

function tagsArray(args: {
	hasBadge: number;
	tags?: Tables['CalendarEvent']['tags'];
	tournamentId: Tables['CalendarEvent']['tournamentId'];
}) {
	const tags = (args.tags ? args.tags.split(',') : []) as Array<CalendarEventUserSelectableTag>;

	return tags;
}

export async function findResultsByEventId(eventId: number) {
	return db
		.selectFrom('CalendarEventResultTeam')
		.select(({ eb }) => [
			'CalendarEventResultTeam.id',
			'CalendarEventResultTeam.name as teamName',
			'CalendarEventResultTeam.placement',
			jsonArrayFrom(
				eb
					.selectFrom('CalendarEventResultPlayer')
					.leftJoin('User', 'User.id', 'CalendarEventResultPlayer.userId')
					.select([
						'CalendarEventResultPlayer.userId as id',
						'CalendarEventResultPlayer.name',
						'User.username',
						'User.discordId',
						'User.discordAvatar',
						'User.customUrl'
					])
					.whereRef('CalendarEventResultPlayer.teamId', '=', 'CalendarEventResultTeam.id')
			).as('players')
		])
		.where('CalendarEventResultTeam.eventId', '=', eventId)
		.orderBy('CalendarEventResultTeam.placement', 'asc')
		.execute();
}

export async function create(args: CalendarAPI.schemas.NewCalendarEventData & { userId: number }) {
	return db.transaction().execute(async (trx) => {
		const { id: eventId } = await trx
			.insertInto('CalendarEvent')
			.values({
				name: args.name,
				authorId: args.userId,
				tags: serializeTags(args.tags),
				description: args.description,
				discordInviteCode: args.discordInviteCode,
				bracketUrl: args.bracketUrl,
				organizationId: args.organization
			})
			.returning('id')
			.executeTakeFirstOrThrow();

		await createDatesInTrx({ eventId, startTimes: args.dates, trx });
		await createBadgesInTrx({ eventId, badges: args.badges, trx });

		await upsertMapPoolInTrx({
			trx,
			eventId,
			mapPool: args.mapPool ?? [],
			column: 'calendarEventId'
		});

		return eventId;
	});
}

export async function update(args: CalendarAPI.schemas.NewCalendarEventData & { eventId: number }) {
	return db.transaction().execute(async (trx) => {
		await trx
			.updateTable('CalendarEvent')
			.set({
				name: args.name,
				tags: serializeTags(args.tags),
				description: args.description,
				discordInviteCode: args.discordInviteCode,
				bracketUrl: args.bracketUrl,
				organizationId: args.organization
			})
			.where('id', '=', args.eventId)
			.execute();

		await trx.deleteFrom('CalendarEventDate').where('eventId', '=', args.eventId).execute();
		await createDatesInTrx({
			eventId: args.eventId,
			startTimes: args.dates,
			trx
		});

		await trx.deleteFrom('CalendarEventBadge').where('eventId', '=', args.eventId).execute();
		await createBadgesInTrx({
			eventId: args.eventId,
			badges: args.badges,
			trx
		});

		await upsertMapPoolInTrx({
			trx,
			eventId: args.eventId,
			mapPool: args.mapPool ?? [],
			column: 'calendarEventId'
		});
	});
}

// xxx: handle tournamentToCopyId (templates)
export async function createTournament(
	args: SchemaToFunctionInput<CalendarAPI.schemas.NewTournamentData> & {
		userId: number;
		parentTournamentId?: number;
	}
) {
	return db.transaction().execute(async (trx) => {
		const settings: Tables['Tournament']['settings'] = {
			bracketProgression: null as any, // xxx: add bracket progression
			isRanked: args.isRanked,
			isTest: args.isTest,
			deadlines: args.strictDeadlines ? 'STRICT' : 'DEFAULT',
			isInvitational: args.isInvitational,
			enableSubs: !args.disableSubsTab,
			autonomousSubs: args.autonomousSubs,
			regClosesAt: args.regClosesAt ? dateToDatabaseTimestamp(args.regClosesAt) : undefined,
			requireInGameNames: args.requireInGameNames,
			minMembersPerTeam: {
				'4v4': 4,
				'3v3': 3,
				'2v2': 2,
				'1v1': 1
			}[args.minMembersPerTeam]
		};

		const tournamentId = (
			await trx
				.insertInto('Tournament')
				.values({
					mapPickingStyle: args.mapPickingStyle,
					settings: JSON.stringify(settings),
					parentTournamentId: args.parentTournamentId,
					rules: args.rules
				})
				.returning('id')
				.executeTakeFirstOrThrow()
		).id;

		const { id: eventId } = await trx
			.insertInto('CalendarEvent')
			.values({
				name: args.name,
				authorId: args.userId,
				tags: serializeTags(args.tags),
				description: args.description,
				discordInviteCode: args.discordInviteCode,
				bracketUrl: 'https://sendou.ink',
				organizationId: args.organization,
				hidden: Boolean(args.parentTournamentId || args.isTest),
				avatarImgId: args.logo,
				tournamentId
			})
			.returning('id')
			.executeTakeFirstOrThrow();

		await createDatesInTrx({ eventId, startTimes: [args.startsAt], trx });
		await createBadgesInTrx({ eventId, badges: args.badges, trx });

		if (args.mapPickingStyle === 'TO') {
			await upsertMapPoolInTrx({
				trx,
				eventId,
				mapPool: args.mapPool ?? [],
				column: 'calendarEventId'
			});
		} else if (args.mapPickingStyle === 'AUTO_ALL') {
			await upsertMapPoolInTrx({
				trx,
				eventId,
				mapPool: args.tieBreakerMapPool ?? [],
				column: 'tieBreakerCalendarEventId'
			});
		}

		return tournamentId;
	});
}

function serializeTags(tags: Array<CalendarEventUserSelectableTag>) {
	return tags
		.toSorted((a, b) => userSelectableTags.indexOf(a) - userSelectableTags.indexOf(b))
		.join(',');
}

function createDatesInTrx({
	eventId,
	startTimes,
	trx
}: {
	eventId: number;
	startTimes: CalendarAPI.schemas.NewCalendarEventData['dates'];
	trx: Transaction<DB>;
}) {
	console.log({ eventId, startTimes });

	return trx
		.insertInto('CalendarEventDate')
		.values(
			startTimes
				.sort((a, b) => a.getTime() - b.getTime())
				.map((startTime) => ({ startTime, eventId }))
		)
		.execute();
}

function createBadgesInTrx({
	eventId,
	badges,
	trx
}: {
	eventId: number;
	badges: CalendarAPI.schemas.NewCalendarEventData['badges'];
	trx: Transaction<DB>;
}) {
	if (!badges || !badges.length) return;

	return trx
		.insertInto('CalendarEventBadge')
		.values(
			badges.map((badgeId) => ({
				eventId,
				badgeId
			}))
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
			.updateTable('CalendarEvent')
			.set({
				participantCount: args.participantCount
			})
			.where('id', '=', args.eventId)
			.execute();
		await trx.deleteFrom('CalendarEventResultTeam').where('eventId', '=', args.eventId).execute();

		for (const result of args.results) {
			const insertedResultTeam = await trx
				.insertInto('CalendarEventResultTeam')
				.values({
					eventId: args.eventId,
					name: result.teamName,
					placement: result.placement
				})
				.returning('CalendarEventResultTeam.id')
				.executeTakeFirstOrThrow();

			await trx
				.insertInto('CalendarEventResultPlayer')
				.values(
					result.players.map((player) => ({
						teamId: insertedResultTeam.id,
						name: player.name,
						userId: player.userId
					}))
				)
				.execute();
		}
	});
}

async function upsertMapPoolInTrx({
	eventId,
	mapPool,
	column,
	trx
}: {
	eventId: number;
	mapPool: NonNullable<CalendarAPI.schemas.NewCalendarEventData['mapPool']>;
	column: 'tieBreakerCalendarEventId' | 'calendarEventId';
	trx: Transaction<DB>;
}) {
	await trx
		.deleteFrom('MapPoolMap')
		.where((eb) =>
			eb.or([eb('calendarEventId', '=', eventId), eb('tieBreakerCalendarEventId', '=', eventId)])
		)
		.execute();

	const mapPoolArray = MapPool.toArray(mapPool);

	if (!mapPoolArray.length) return;

	await trx
		.insertInto('MapPoolMap')
		.values(
			mapPoolArray.map((mapPoolMap) => ({
				stageId: mapPoolMap.stageId,
				mode: mapPoolMap.mode,
				[column]: eventId
			}))
		)
		.execute();
}

export function deleteById(
	eventId: number,
	{ tournamentId }: { tournamentId?: number | null } = {}
) {
	return db.transaction().execute(async (trx) => {
		await trx.deleteFrom('CalendarEvent').where('id', '=', eventId).execute();
		if (tournamentId) {
			await trx.deleteFrom('Tournament').where('id', '=', tournamentId).execute();
		}
	});
}
