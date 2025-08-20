import type { ExpressionBuilder, FunctionModule, NotNull } from 'kysely';
import { sql } from 'kysely';
import { jsonArrayFrom } from 'kysely/helpers/sqlite';
import * as R from 'remeda';
import { db } from '../sql';
import type {
	BuildSort,
	DB,
	Tables,
	TablesInsertable,
	UserMapModePreferences,
	UserPreferences
} from '../tables';
import invariant from '$lib/utils/invariant';
import type { CommonUser } from '$lib/utils/kysely.server';
import { COMMON_USER_FIELDS } from '$lib/utils/kysely.server';
import { safeNumberParse } from '$lib/utils/number';
import { isSupporter } from '$lib/modules/permissions/utils';
import { userRoles } from '$lib/modules/permissions/mapper.server';
import type { EditProfileData } from '$lib/api/user/schemas';
import type {
	UpdateAccessibilitySettingsData,
	UpdateMatchProfileData
} from '$lib/api/settings/schemas';
import { modesShort } from '$lib/constants/in-game/modes';

function identifierToUserIdQuery(identifier: string) {
	return db
		.selectFrom('User')
		.select('User.id')
		.where((eb) => {
			// we don't want to parse discord id's as numbers (length = 18)
			const parsedId = identifier.length < 10 ? safeNumberParse(identifier) : null;
			if (parsedId) {
				return eb('User.id', '=', parsedId);
			}

			if (/^\d+$/.test(identifier)) {
				return eb('User.discordId', '=', identifier);
			}

			return eb('User.customUrl', '=', identifier);
		});
}

export function identifierToUserId(identifier: string) {
	return identifierToUserIdQuery(identifier).executeTakeFirst();
}

export async function identifierToBuildFields(identifier: string) {
	const row = await identifierToUserIdQuery(identifier)
		.select(({ eb }) => [
			'User.buildSorting',
			jsonArrayFrom(
				eb
					.selectFrom('UserWeapon')
					.select('UserWeapon.weaponSplId')
					.whereRef('UserWeapon.userId', '=', 'User.id')
					.orderBy('UserWeapon.order', 'asc')
			).as('weapons')
		])
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return {
		...row,
		weapons: row.weapons.map((row) => row.weaponSplId)
	};
}

export async function findLayoutDataByIdentifier(identifier: string, loggedInUserId?: number) {
	const row = await identifierToUserIdQuery(identifier)
		.select((eb) => [
			...COMMON_USER_FIELDS,
			sql<Record<
				string,
				string
			> | null>`IIF(COALESCE("User"."patronTier", 0) >= 2, "User"."css", null)`.as('css'),
			eb
				.selectFrom('TournamentResult')
				.whereRef('TournamentResult.userId', '=', 'User.id')
				.select(({ fn }) => fn.countAll<number>().as('count'))
				.as('tournamentResultsCount'),
			eb
				.selectFrom('CalendarEventResultPlayer')
				.whereRef('CalendarEventResultPlayer.userId', '=', 'User.id')
				.select(({ fn }) => fn.countAll<number>().as('count'))
				.as('calendarEventResultsCount'),
			eb
				.selectFrom('Build')
				.select(({ fn }) => fn.countAll<number>().as('count'))
				.whereRef('Build.ownerId', '=', 'User.id')
				.where((eb) =>
					eb.or(
						[
							eb('Build.private', '=', 0),
							loggedInUserId ? eb('Build.ownerId', '=', loggedInUserId) : null
						].filter((filter) => filter !== null)
					)
				)
				.as('buildsCount'),
			eb
				.selectFrom('VideoMatchPlayer')
				.innerJoin('VideoMatch', 'VideoMatch.id', 'VideoMatchPlayer.videoMatchId')
				.select(({ fn }) => fn.count<number>('VideoMatch.videoId').distinct().as('count'))
				.whereRef('VideoMatchPlayer.playerUserId', '=', 'User.id')
				.as('vodsCount'),
			eb
				.selectFrom('Art')
				.leftJoin('ArtUserMetadata', 'ArtUserMetadata.artId', 'Art.id')
				.innerJoin('UserSubmittedImage', 'UserSubmittedImage.id', 'Art.imgId')
				.select(({ fn }) => fn.count<number>('Art.id').distinct().as('count'))
				.where((innerEb) =>
					innerEb.or([
						innerEb('Art.authorId', '=', sql.raw<any>('User.id')),
						innerEb('ArtUserMetadata.userId', '=', sql.raw<any>('User.id'))
					])
				)
				.as('artCount')
		])
		.$narrowType<{
			calendarEventResultsCount: NotNull;
			tournamentResultsCount: NotNull;
			buildsCount: NotNull;
			vodsCount: NotNull;
			artCount: NotNull;
		}>()
		.executeTakeFirst();

	if (!row) return null;

	const { css, calendarEventResultsCount, tournamentResultsCount, ...rest } = row;

	return {
		css,
		user: {
			resultsCount: calendarEventResultsCount + tournamentResultsCount,
			...rest
		}
	};
}

export async function findProfileByIdentifier(
	identifier: string,
	forceShowDiscordUniqueName?: boolean
) {
	const row = await identifierToUserIdQuery(identifier)
		.leftJoin('PlusTier', 'PlusTier.userId', 'User.id')
		.select(({ eb }) => [
			'User.twitch',
			'User.youtubeId',
			'User.battlefy',
			'User.bsky',
			'User.country',
			'User.bio',
			'User.motionSens',
			'User.stickSens',
			'User.inGameName',
			'User.customName',
			'User.customUrl',
			'User.discordName',
			'User.showDiscordUniqueName',
			'User.discordUniqueName',
			'User.commissionsOpen',
			'User.commissionText',
			'User.favoriteBadgeIds',
			'User.patronTier',
			'PlusTier.tier as plusTier',
			jsonArrayFrom(
				eb
					.selectFrom('UserWeapon')
					.select(['UserWeapon.weaponSplId', 'UserWeapon.isFavorite'])
					.whereRef('UserWeapon.userId', '=', 'User.id')
					.orderBy('UserWeapon.order', 'asc')
			).as('weapons'),
			jsonArrayFrom(
				eb
					.selectFrom('TeamMemberWithSecondary')
					.innerJoin('Team', 'Team.id', 'TeamMemberWithSecondary.teamId')
					.leftJoin('UserSubmittedImage', 'UserSubmittedImage.id', 'Team.avatarImgId')
					.select([
						'Team.name',
						'Team.customUrl',
						'Team.id',
						'TeamMemberWithSecondary.isMainTeam',
						'TeamMemberWithSecondary.role as userTeamRole',
						'UserSubmittedImage.url as avatarUrl'
					])
					.whereRef('TeamMemberWithSecondary.userId', '=', 'User.id')
			).as('teams'),
			jsonArrayFrom(
				eb
					.selectFrom('BadgeOwner')
					.innerJoin('Badge', 'Badge.id', 'BadgeOwner.badgeId')
					.select(({ fn }) => [
						fn.count<number>('BadgeOwner.badgeId').as('count'),
						'Badge.id',
						'Badge.displayName',
						'Badge.code'
					])
					.whereRef('BadgeOwner.userId', '=', 'User.id')
					.groupBy(['BadgeOwner.badgeId', 'BadgeOwner.userId'])
			).as('badges'),
			jsonArrayFrom(
				eb
					.selectFrom('SplatoonPlayer')
					.innerJoin('XRankPlacement', 'XRankPlacement.playerId', 'SplatoonPlayer.id')
					.select(({ fn }) => [
						'XRankPlacement.mode',
						fn.max<number>('XRankPlacement.power').as('power'),
						fn.min<number>('XRankPlacement.rank').as('rank'),
						'XRankPlacement.playerId'
					])
					.whereRef('SplatoonPlayer.userId', '=', 'User.id')
					.groupBy(['XRankPlacement.mode'])
			).as('topPlacements')
		])
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	const favoriteBadgeIds = favoriteBadgesOwnedAndSupporterStatusAdjusted(row);

	return {
		...row,
		team: row.teams.find((t) => t.isMainTeam),
		secondaryTeams: row.teams.filter((t) => !t.isMainTeam),
		teams: undefined,
		favoriteBadgeIds,
		badges: row.badges.sort((a, b) => {
			const aIdx = favoriteBadgeIds?.indexOf(a.id) ?? -1;
			const bIdx = favoriteBadgeIds?.indexOf(b.id) ?? -1;

			if (aIdx !== bIdx) {
				if (aIdx === -1) return 1;
				if (bIdx === -1) return -1;

				return aIdx - bIdx;
			}

			return b.id - a.id;
		}),
		discordUniqueName:
			forceShowDiscordUniqueName || row.showDiscordUniqueName ? row.discordUniqueName : null
	};
}

function favoriteBadgesOwnedAndSupporterStatusAdjusted(row: {
	favoriteBadgeIds: number[] | null;
	badges: Array<{
		id: number;
	}>;
	patronTier: number | null;
}) {
	// filter out favorite badges no longer owner of
	let favoriteBadgeIds =
		row.favoriteBadgeIds?.filter((badgeId) => row.badges.some((badge) => badge.id === badgeId)) ??
		null;

	if (favoriteBadgeIds?.length === 0) {
		favoriteBadgeIds = null;
	}

	// non-supporters can only have one favorite badge, handle losing supporter status
	favoriteBadgeIds = isSupporter(row)
		? favoriteBadgeIds
		: favoriteBadgeIds
			? [favoriteBadgeIds[0]]
			: null;

	return favoriteBadgeIds;
}

export function findByCustomUrl(customUrl: string) {
	return db
		.selectFrom('User')
		.select(['User.id', 'User.discordId', 'User.customUrl', 'User.patronTier'])
		.where('customUrl', '=', customUrl)
		.executeTakeFirst();
}

export function findByFriendCode(friendCode: string) {
	return db
		.selectFrom('UserFriendCode')
		.innerJoin('User', 'User.id', 'UserFriendCode.userId')
		.select([...COMMON_USER_FIELDS])
		.where('UserFriendCode.friendCode', '=', friendCode)
		.execute();
}

export function findBannedStatusByUserId(userId: number) {
	return db
		.selectFrom('User')
		.select(['User.banned', 'User.bannedReason'])
		.where('User.id', '=', userId)
		.executeTakeFirst();
}

export type FindWithRolesByIdResult = NonNullable<Awaited<ReturnType<typeof findWithRolesById>>>;

export async function findWithRolesById(id: number) {
	const user = await db
		.selectFrom('User')
		.leftJoin('PlusTier', 'PlusTier.userId', 'User.id')
		.where('User.id', '=', id)
		.select([
			...COMMON_USER_FIELDS,
			'User.isArtist',
			'User.isVideoAdder',
			'User.isTournamentOrganizer',
			'User.preferences',
			'User.patronTier',
			'PlusTier.tier as plusTier'
		])
		.executeTakeFirst();

	if (!user) return;

	return {
		...R.omit(user, [
			'isArtist',
			'isVideoAdder',
			'plusTier',
			'patronTier',
			'isTournamentOrganizer'
		]),
		roles: userRoles(user)
	};
}

export function findModInfoById(id: number) {
	return db
		.selectFrom('User')
		.select((eb) => [
			'User.discordUniqueName',
			'User.isVideoAdder',
			'User.isArtist',
			'User.isTournamentOrganizer',
			'User.plusSkippedForSeasonNth',
			'User.createdAt',
			jsonArrayFrom(
				eb
					.selectFrom('ModNote')
					.innerJoin('User', 'User.id', 'ModNote.authorId')
					.select([
						'ModNote.id as noteId',
						'ModNote.text',
						'ModNote.createdAt',
						...COMMON_USER_FIELDS
					])
					.where('ModNote.isDeleted', '=', 0)
					.where('ModNote.userId', '=', id)
					.orderBy('ModNote.createdAt', 'desc')
			).as('modNotes'),
			jsonArrayFrom(
				eb
					.selectFrom('BanLog')
					.innerJoin('User', 'User.id', 'BanLog.bannedByUserId')
					.select([
						'BanLog.banned',
						'BanLog.bannedReason',
						'BanLog.createdAt',
						...COMMON_USER_FIELDS
					])
					.where('BanLog.userId', '=', id)
					.orderBy('BanLog.createdAt', 'desc')
			).as('banLogs')
		])
		.where('User.id', '=', id)
		.executeTakeFirst();
}

export function findAllPatrons() {
	return db
		.selectFrom('User')
		.select(['User.id', 'User.discordId', 'User.username', 'User.patronTier'])
		.where('User.patronTier', 'is not', null)
		.orderBy('User.patronTier', 'desc')
		.orderBy('User.patronSince', 'asc')
		.execute();
}

export function findAllPlusServerMembers() {
	return db
		.selectFrom('User')
		.innerJoin('PlusTier', 'PlusTier.userId', 'User.id')
		.select(['User.id as userId', 'User.discordId', 'PlusTier.tier as plusTier'])
		.execute();
}

// export async function findChatUsersByUserIds(userIds: number[]) {
// 	const users = await db
// 		.selectFrom("User")
// 		.select([
// 			"User.id",
// 			"User.discordId",
// 			"User.discordAvatar",
// 			"User.username",
// 			userChatNameColor,
// 		])
// 		.where("User.id", "in", userIds)
// 		.execute();

// 	const result: Record<number, ChatUser> = {};

// 	for (const user of users) {
// 		result[user.id] = user;
// 	}

// 	return result;
// }

function withMaxEventStartTime(eb: ExpressionBuilder<DB, 'CalendarEvent'>) {
	return eb
		.selectFrom('CalendarEventDate')
		.select(({ fn }) => [fn.max('CalendarEventDate.startTime').as('startTime')])
		.whereRef('CalendarEventDate.eventId', '=', 'CalendarEvent.id')
		.as('startTime');
}

export function findResultsByUserId(
	userId: number,
	{ showHighlightsOnly = false }: { showHighlightsOnly?: boolean } = {}
) {
	let calendarEventResultsQuery = db
		.selectFrom('CalendarEventResultPlayer')
		.innerJoin(
			'CalendarEventResultTeam',
			'CalendarEventResultTeam.id',
			'CalendarEventResultPlayer.teamId'
		)
		.innerJoin('CalendarEvent', 'CalendarEvent.id', 'CalendarEventResultTeam.eventId')
		.leftJoin('UserResultHighlight', (join) =>
			join
				.onRef('UserResultHighlight.teamId', '=', 'CalendarEventResultTeam.id')
				.on('UserResultHighlight.userId', '=', userId)
		)
		.select(({ eb, fn }) => [
			'CalendarEvent.id as eventId',
			sql<number>`null`.as('tournamentId'),
			'CalendarEventResultTeam.placement',
			'CalendarEvent.participantCount',
			sql<Tables['TournamentResult']['setResults']>`null`.as('setResults'),
			sql<string | null>`null`.as('logoUrl'),
			'CalendarEvent.name as eventName',
			'CalendarEventResultTeam.id as teamId',
			'CalendarEventResultTeam.name as teamName',
			fn<number | null>('iif', ['UserResultHighlight.userId', sql`1`, sql`0`]).as('isHighlight'),
			withMaxEventStartTime(eb),
			jsonArrayFrom(
				eb
					.selectFrom('CalendarEventResultPlayer')
					.leftJoin('User', 'User.id', 'CalendarEventResultPlayer.userId')
					.select([...COMMON_USER_FIELDS, 'CalendarEventResultPlayer.name'])
					.whereRef('CalendarEventResultPlayer.teamId', '=', 'CalendarEventResultTeam.id')
					.where((eb) =>
						eb.or([
							eb('CalendarEventResultPlayer.userId', 'is', null),
							eb('CalendarEventResultPlayer.userId', '!=', userId)
						])
					)
			).as('mates')
		])
		.where('CalendarEventResultPlayer.userId', '=', userId);

	let tournamentResultsQuery = db
		.selectFrom('TournamentResult')
		.innerJoin('TournamentTeam', 'TournamentTeam.id', 'TournamentResult.tournamentTeamId')
		.innerJoin('CalendarEvent', 'CalendarEvent.tournamentId', 'TournamentResult.tournamentId')
		.select(({ eb }) => [
			sql<number>`null`.as('eventId'),
			'TournamentResult.tournamentId',
			'TournamentResult.placement',
			'TournamentResult.participantCount',
			'TournamentResult.setResults',
			eb
				.selectFrom('UserSubmittedImage')
				.select(['UserSubmittedImage.url'])
				.whereRef('CalendarEvent.avatarImgId', '=', 'UserSubmittedImage.id')
				.as('logoUrl'),
			'CalendarEvent.name as eventName',
			'TournamentTeam.id as teamId',
			'TournamentTeam.name as teamName',
			'TournamentResult.isHighlight',
			withMaxEventStartTime(eb),
			jsonArrayFrom(
				eb
					.selectFrom('TournamentResult as TournamentResult2')
					.innerJoin('User', 'User.id', 'TournamentResult2.userId')
					.select([...COMMON_USER_FIELDS, sql<string | null>`null`.as('name')])
					.whereRef('TournamentResult2.tournamentTeamId', '=', 'TournamentResult.tournamentTeamId')
					.where('TournamentResult2.userId', '!=', userId)
			).as('mates')
		])
		.where('TournamentResult.userId', '=', userId);

	if (showHighlightsOnly) {
		calendarEventResultsQuery = calendarEventResultsQuery.where(
			'UserResultHighlight.userId',
			'is not',
			null
		);
		tournamentResultsQuery = tournamentResultsQuery.where('TournamentResult.isHighlight', '=', 1);
	}

	return calendarEventResultsQuery
		.unionAll(tournamentResultsQuery)
		.orderBy('startTime', 'desc')
		.$narrowType<{ startTime: NotNull }>()
		.execute();
}

export async function hasHighlightedResultsByUserId(userId: number) {
	const highlightedTournamentResult = await db
		.selectFrom('TournamentResult')
		.where('userId', '=', userId)
		.where('isHighlight', '=', 1)
		.select('userId')
		.limit(1)
		.executeTakeFirst();

	if (highlightedTournamentResult) {
		return true;
	}

	const highlightedCalendarEventResult = await db
		.selectFrom('UserResultHighlight')
		.where('userId', '=', userId)
		.select(['userId'])
		.limit(1)
		.executeTakeFirst();

	return !!highlightedCalendarEventResult;
}

function searchSelectedFields({ fn }: { fn: FunctionModule<DB, 'User'> }) {
	return [
		...COMMON_USER_FIELDS,
		'User.inGameName',
		'PlusTier.tier as plusTier',
		fn<string | null>('iif', [
			'User.showDiscordUniqueName',
			'User.discordUniqueName',
			sql`null`
		]).as('discordUniqueName')
	] as const;
}

export async function search({ query, limit }: { query: string; limit: number }) {
	let exactMatches: Array<
		CommonUser & {
			inGameName: string | null;
			plusTier: number | null;
			discordUniqueName: string | null;
		}
	> = [];
	if (query.length > 1) {
		exactMatches = await db
			.selectFrom('User')
			.leftJoin('PlusTier', 'PlusTier.userId', 'User.id')
			.select(searchSelectedFields)
			.where((eb) =>
				eb.or([
					eb('User.username', 'like', query),
					eb('User.inGameName', 'like', query),
					eb('User.discordUniqueName', 'like', query),
					eb('User.customUrl', 'like', query)
				])
			)
			.orderBy(
				(eb) =>
					eb.case().when('PlusTier.tier', 'is', null).then(4).else(eb.ref('PlusTier.tier')).end(),
				'asc'
			)
			.limit(limit)
			.execute();
	}

	const fuzzyQuery = `%${query}%`;
	const fuzzyMatches = await db
		.selectFrom('User')
		.leftJoin('PlusTier', 'PlusTier.userId', 'User.id')
		.select(searchSelectedFields)
		.where((eb) =>
			eb
				.or([
					eb('User.username', 'like', fuzzyQuery),
					eb('User.inGameName', 'like', fuzzyQuery),
					eb('User.discordUniqueName', 'like', fuzzyQuery)
				])
				.and(
					'User.id',
					'not in',
					exactMatches.map((match) => match.id)
				)
		)
		.orderBy(
			(eb) =>
				eb.case().when('PlusTier.tier', 'is', null).then(4).else(eb.ref('PlusTier.tier')).end(),
			'asc'
		)
		.limit(limit - exactMatches.length)
		.execute();

	return [...exactMatches, ...fuzzyMatches];
}

export function searchExact(args: { id?: number; discordId?: string; customUrl?: string }) {
	let query = db
		.selectFrom('User')
		.leftJoin('PlusTier', 'PlusTier.userId', 'User.id')
		.select(searchSelectedFields);

	let filtered = false;

	if (typeof args.id === 'number') {
		filtered = true;
		query = query.where('User.id', '=', args.id);
	}

	if (typeof args.discordId === 'string') {
		filtered = true;
		query = query.where('User.discordId', '=', args.discordId);
	}

	if (typeof args.customUrl === 'string') {
		filtered = true;
		query = query.where('User.customUrl', '=', args.customUrl);
	}

	invariant(filtered, 'No search criteria provided');

	return query.execute();
}

export async function currentFriendCodeByUserId(userId: number) {
	return db
		.selectFrom('UserFriendCode')
		.select([
			'UserFriendCode.friendCode',
			'UserFriendCode.createdAt',
			'UserFriendCode.submitterUserId'
		])
		.where('userId', '=', userId)
		.orderBy('UserFriendCode.createdAt', 'desc')
		.limit(1)
		.executeTakeFirst();
}

export async function matchProfileById(userId: number) {
	return db
		.selectFrom('User')
		.select(['User.qWeaponPool', 'User.vc', 'User.languages', 'User.mapModePreferences'])
		.where('User.id', '=', userId)
		.executeTakeFirst();
}

/** Returns true if any of the given users prefers to avoid playing against Splattercolor Screen */
export async function hasNoScreenByUserIds(userIds: number[]) {
	const row = await db
		.selectFrom('User')
		.select('id')
		.where('User.noScreen', '=', 1)
		.where('id', 'in', userIds)
		.limit(1)
		.executeTakeFirst();

	return Boolean(row);
}

let cachedFriendCodes: Set<string> | null = null;

export async function allCurrentFriendCodes() {
	if (cachedFriendCodes) {
		return cachedFriendCodes;
	}

	const allFriendCodes = await db
		.selectFrom('UserFriendCode')
		.select(['UserFriendCode.friendCode', 'UserFriendCode.userId'])
		.orderBy('UserFriendCode.createdAt', 'desc')
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
			.selectFrom('User')
			.select('User.inGameName')
			.where('id', '=', userId)
			.executeTakeFirst()
	)?.inGameName;
}

export function insertFriendCode(args: TablesInsertable['UserFriendCode']) {
	cachedFriendCodes?.add(args.friendCode);

	return db.insertInto('UserFriendCode').values(args).execute();
}

export function upsert(
	args: Pick<
		TablesInsertable['User'],
		| 'discordId'
		| 'discordName'
		| 'discordAvatar'
		| 'discordUniqueName'
		| 'twitch'
		| 'youtubeId'
		| 'bsky'
	>
) {
	return db
		.insertInto('User')
		.values({ ...args, createdAt: new Date() })
		.onConflict((oc) => {
			return oc.column('discordId').doUpdateSet({
				...R.omit(args, ['discordId'])
			});
		})
		.returning('id')
		.executeTakeFirstOrThrow();
}

export function updateProfile(userId: number, args: EditProfileData) {
	return db.transaction().execute(async (trx) => {
		await trx.deleteFrom('UserWeapon').where('userId', '=', userId).execute();

		if (args.weapons.length > 0) {
			await trx
				.insertInto('UserWeapon')
				.values(
					args.weapons.map((weapon, i) => ({
						userId,
						weaponSplId: weapon.id,
						isFavorite: weapon.isFavorite,
						order: i + 1
					}))
				)
				.execute();
		}

		return trx
			.updateTable('User')
			.set({
				country: args.country,
				bio: args.bio,
				customUrl: args.customUrl,
				customName: args.customName,
				motionSens: args.sens?.[0] ? Number(args.sens[0]) : null,
				stickSens: args.sens?.[1] ? Number(args.sens[1]) : null,
				inGameName: args.inGameName,
				css: null, // xxx: CustomizedColors
				battlefy: args.battlefy,
				favoriteBadgeIds: args.favoriteBadges ? JSON.stringify(args.favoriteBadges) : null,
				showDiscordUniqueName: !args.hideDiscordUniqueName,
				commissionText: args.commissionText,
				commissionsOpen: args.commissionsOpen
			})
			.where('id', '=', userId)
			.returning(['User.id', 'User.customUrl', 'User.discordId'])
			.executeTakeFirstOrThrow();
	});
}

export async function preferencesById(userId: number) {
	const row = await db
		.selectFrom('User')
		.select('User.preferences')
		.where('id', '=', userId)
		.executeTakeFirst();

	return row?.preferences;
}

export function updatePreferences(userId: number, newPreferences: UserPreferences) {
	return db.transaction().execute(async (trx) => {
		const current =
			(
				await trx
					.selectFrom('User')
					.select('User.preferences')
					.where('id', '=', userId)
					.executeTakeFirstOrThrow()
			).preferences ?? {};

		const mergedPreferences = {
			...current,
			...newPreferences
		};

		await trx
			.updateTable('User')
			.set({
				preferences: JSON.stringify(mergedPreferences)
			})
			.where('id', '=', userId)
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
		await trx.deleteFrom('UserResultHighlight').where('userId', '=', args.userId).execute();

		if (args.resultTeamIds.length > 0) {
			await trx
				.insertInto('UserResultHighlight')
				.values(
					args.resultTeamIds.map((teamId) => ({
						userId: args.userId,
						teamId
					}))
				)
				.execute();
		}

		await trx
			.updateTable('TournamentResult')
			.set({
				isHighlight: false
			})
			.where('TournamentResult.userId', '=', args.userId)
			.execute();

		if (args.resultTournamentTeamIds.length > 0) {
			await trx
				.updateTable('TournamentResult')
				.set({
					isHighlight: true
				})
				.where('TournamentResult.userId', '=', args.userId)
				.where('TournamentResult.tournamentTeamId', 'in', args.resultTournamentTeamIds)
				.execute();
		}
	});
}

export function updateBuildSorting({
	userId,
	buildSorting
}: {
	userId: number;
	buildSorting: BuildSort[] | null;
}) {
	return db
		.updateTable('User')
		.set({ buildSorting: buildSorting ? JSON.stringify(buildSorting) : null })
		.where('id', '=', userId)
		.execute();
}

export function updateAccessibilitySettings(userId: number, data: UpdateAccessibilitySettingsData) {
	return db.updateTable('User').set(data).where('id', '=', userId).execute();
}

export function updateMatchProfile(userId: number, data: UpdateMatchProfileData) {
	const qWeaponPool: Tables['User']['qWeaponPool'] = data.qWeaponPool.map((weapon) => ({
		weaponSplId: weapon.id,
		isFavorite: Number(weapon.isFavorite)
	}));
	const mapModePreferences: UserMapModePreferences = {
		modes: data.modes.map((mode) => ({
			mode,
			preference: 'PREFER'
		})),
		pool: modesShort
			.map((mode) => {
				const stages = data.maps[mode];
				if (!stages) return null;

				return {
					mode,
					stages
				};
			})
			.filter(R.isTruthy)
	};

	return db
		.updateTable('User')
		.set({
			vc: data.vc,
			languages: data.languages.length > 0 ? data.languages.join(',') : null,
			qWeaponPool: qWeaponPool.length > 0 ? JSON.stringify(qWeaponPool) : null,
			mapModePreferences: JSON.stringify(mapModePreferences)
		})
		.where('id', '=', userId)
		.execute();
}

export type UpdatePatronDataArgs = Array<
	Pick<Tables['User'], 'discordId' | 'patronTier' | 'patronSince'>
>;
export function updatePatronData(users: UpdatePatronDataArgs) {
	return db.transaction().execute(async (trx) => {
		await trx
			.updateTable('User')
			.set({
				patronTier: null,
				patronSince: null,
				patronTill: null
			})
			.where((eb) => eb.or([eb('patronTill', '<', new Date()), eb('patronTill', 'is', null)]))
			.execute();

		for (const user of users) {
			await trx
				.updateTable('User')
				.set({
					patronTier: user.patronTier,
					patronSince: user.patronSince,
					patronTill: null
				})
				.where('User.discordId', '=', user.discordId)
				.execute();
		}
	});
}

// xxx: use Kysely
// const updateByDiscordIdStm = dbDirect.prepare(/* sql */ `
//   update
//     "User"
//   set
//     "discordAvatar" = @discordAvatar,
//     "discordName" = coalesce(@discordName, "discordName"),
//     "discordUniqueName" = coalesce(@discordUniqueName, "discordUniqueName")
//   where
//     "discordId" = @discordId
// `);
// export const updateMany = dbDirect.transaction(
// 	(
// 		argsArr: Array<
// 			Pick<Tables['User'], 'discordAvatar' | 'discordName' | 'discordUniqueName' | 'discordId'>
// 		>
// 	) => {
// 		for (const updateArgs of argsArr) {
// 			updateByDiscordIdStm.run(updateArgs);
// 		}
// 	}
// );
