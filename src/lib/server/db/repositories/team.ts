import type { Insertable, Transaction } from 'kysely';
import { jsonArrayFrom } from 'kysely/helpers/sqlite';
import { db } from '../sql';
import { COMMON_USER_FIELDS } from '$lib/utils/kysely.server';
import type { DB, Tables } from '../tables';
import { shortNanoid } from '$lib/utils/id';
import invariant from '$lib/utils/invariant';
import * as LFGRepository from './lfg';
import * as Team from '$lib/core/team';
import type { EditTeamData } from '$lib/api/team/schemas';
import type { ReplaceFileWithId } from '$lib/server/remote-functions';

export function findAllUndisbanded() {
	return db
		.selectFrom('Team')
		.select(({ eb }) => [
			'Team.customUrl',
			'Team.name',
			eb
				.selectFrom('UserSubmittedImage')
				.whereRef('UserSubmittedImage.id', '=', 'Team.avatarImgId')
				.select('UserSubmittedImage.url')
				.as('avatarSrc'),
			jsonArrayFrom(
				eb
					.selectFrom('TeamMemberWithSecondary')
					.innerJoin('User', 'User.id', 'TeamMemberWithSecondary.userId')
					.leftJoin('PlusTier', 'PlusTier.userId', 'User.id')
					.select(['User.id', 'User.username', 'PlusTier.tier as plusTier'])
					.whereRef('TeamMemberWithSecondary.teamId', '=', 'Team.id')
			).as('members')
		])
		.execute();
}

export function findAllMemberOfByUserId(userId: number) {
	return db
		.selectFrom('TeamMemberWithSecondary')
		.innerJoin('Team', 'Team.id', 'TeamMemberWithSecondary.teamId')
		.leftJoin('UserSubmittedImage', 'UserSubmittedImage.id', 'Team.avatarImgId')
		.select(['Team.id', 'Team.customUrl', 'Team.name', 'UserSubmittedImage.url as logoUrl'])
		.where('TeamMemberWithSecondary.userId', '=', userId)
		.execute();
}

export type findBySlug = NonNullable<Awaited<ReturnType<typeof findBySlug>>>;

export async function findBySlug(customUrl: string, { includeInviteCode = false } = {}) {
	const row = await db
		.selectFrom('Team')
		.leftJoin('UserSubmittedImage as AvatarImage', 'AvatarImage.id', 'Team.avatarImgId')
		.leftJoin('UserSubmittedImage as BannerImage', 'BannerImage.id', 'Team.bannerImgId')
		.select(({ eb }) => [
			'Team.id',
			'Team.name',
			'Team.bsky',
			'Team.bio',
			'Team.customUrl',
			'Team.css',
			'AvatarImage.url as avatarSrc',
			'BannerImage.url as bannerSrc',
			jsonArrayFrom(
				eb
					.selectFrom('TeamMemberWithSecondary')
					.innerJoin('User', 'User.id', 'TeamMemberWithSecondary.userId')
					.select(({ eb: innerEb }) => [
						...COMMON_USER_FIELDS,
						'TeamMemberWithSecondary.role',
						'TeamMemberWithSecondary.isOwner',
						'TeamMemberWithSecondary.isManager',
						'TeamMemberWithSecondary.isMainTeam',
						'User.country',
						'User.patronTier',
						jsonArrayFrom(
							innerEb
								.selectFrom('UserWeapon')
								.select(['UserWeapon.weaponSplId', 'UserWeapon.isFavorite'])
								.whereRef('UserWeapon.userId', '=', 'User.id')
						).as('weapons')
					])
					.whereRef('TeamMemberWithSecondary.teamId', '=', 'Team.id')
			).as('members')
		])
		.$if(includeInviteCode, (qb) => qb.select('Team.inviteCode'))
		.where('Team.customUrl', '=', customUrl.toLowerCase())
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return {
		...row,
		permissions: {
			EDIT: row.members
				.filter((member) => member.isOwner || member.isManager)
				.map((member) => member.id)
		}
	};
}

export type FindResultPlacementsById = NonNullable<
	Awaited<ReturnType<typeof findResultPlacementsById>>
>;

export function findResultPlacementsById(teamId: number) {
	return db
		.selectFrom('TournamentTeam')
		.innerJoin('TournamentResult', 'TournamentResult.tournamentTeamId', 'TournamentTeam.id')
		.select(['TournamentResult.placement'])
		.where('teamId', '=', teamId)
		.groupBy('TournamentResult.tournamentId')
		.execute();
}

export type FindResultsById = NonNullable<Awaited<ReturnType<typeof findResultsById>>>;

/**
 * Retrieves tournament results for a given team by its ID.
 */
export async function findResultsById(teamId: number) {
	const rows = await db
		.with('results', (db) =>
			db
				.selectFrom('TournamentTeam')
				.innerJoin('TournamentResult', 'TournamentResult.tournamentTeamId', 'TournamentTeam.id')
				.select([
					'TournamentResult.userId',
					'TournamentResult.tournamentTeamId',
					'TournamentResult.tournamentId',
					'TournamentResult.placement',
					'TournamentResult.participantCount'
				])
				.where('teamId', '=', teamId)
				.groupBy('TournamentResult.tournamentId')
		)
		.selectFrom('results')
		.innerJoin('CalendarEvent', 'CalendarEvent.tournamentId', 'results.tournamentId')
		.innerJoin('CalendarEventDate', 'CalendarEventDate.eventId', 'CalendarEvent.id')
		.select((eb) => [
			'results.placement',
			'results.tournamentId',
			'results.participantCount',
			'results.tournamentTeamId',
			'CalendarEvent.name as tournamentName',
			'CalendarEventDate.startTime',
			eb
				.selectFrom('UserSubmittedImage')
				.select(['UserSubmittedImage.url'])
				.whereRef('CalendarEvent.avatarImgId', '=', 'UserSubmittedImage.id')
				.as('logoUrl'),
			jsonArrayFrom(
				eb
					.selectFrom('results as results2')
					.innerJoin('TournamentResult', (join) =>
						join
							.onRef('TournamentResult.tournamentTeamId', '=', 'results2.tournamentTeamId')
							.onRef('TournamentResult.tournamentId', '=', 'results2.tournamentId')
					)
					.innerJoin('User', 'User.id', 'TournamentResult.userId')
					.whereRef('results2.tournamentId', '=', 'results.tournamentId')
					.select(COMMON_USER_FIELDS)
			).as('participants')
		])
		.orderBy('CalendarEventDate.startTime', 'desc')
		.execute();

	const members = await allMembersById(teamId);

	return rows.map((row) => {
		const subs = Team.subsOfResult(row, members);

		return {
			...row,
			subs
		};
	});
}

function allMembersById(teamId: number) {
	return db
		.selectFrom('TeamMemberWithSecondary')
		.select([
			'TeamMemberWithSecondary.userId',
			'TeamMemberWithSecondary.leftAt',
			'TeamMemberWithSecondary.createdAt'
		])
		.where('TeamMemberWithSecondary.teamId', '=', teamId)
		.execute();
}

export async function teamsByMemberUserId(userId: number, trx?: Transaction<DB>) {
	return (trx ?? db)
		.selectFrom('TeamMemberWithSecondary')
		.innerJoin('Team', 'Team.id', 'TeamMemberWithSecondary.teamId')
		.select((eb) => [
			'TeamMemberWithSecondary.teamId as id',
			'Team.name',
			'TeamMemberWithSecondary.isOwner',
			'TeamMemberWithSecondary.isMainTeam',
			jsonArrayFrom(
				eb
					.selectFrom('TeamMemberWithSecondary as m2')
					.innerJoin('User', 'User.id', 'm2.userId')
					.select([...COMMON_USER_FIELDS, 'm2.role'])
					.whereRef('TeamMemberWithSecondary.teamId', '=', 'm2.teamId')
			).as('members')
		])
		.where('userId', '=', userId)
		.execute();
}

export async function create(
	args: Pick<Insertable<Tables['Team']>, 'name' | 'customUrl'> & {
		ownerUserId: number;
	}
) {
	return db.transaction().execute(async (trx) => {
		const team = await trx
			.insertInto('AllTeam')
			.values({
				name: args.name,
				customUrl: args.customUrl,
				inviteCode: shortNanoid()
			})
			.returning('id')
			.executeTakeFirstOrThrow();

		const teamAlreadyMemberOf = await trx
			.selectFrom('TeamMember')
			.select('TeamMember.userId')
			.where('userId', '=', args.ownerUserId)
			.executeTakeFirst();

		await trx
			.insertInto('AllTeamMember')
			.values({
				userId: args.ownerUserId,
				teamId: team.id,
				isOwner: true,
				isMainTeam: !teamAlreadyMemberOf
			})
			.execute();
	});
}

export async function update(
	teamId: number,
	{ name, slug, bio, bsky, logo, banner }: ReplaceFileWithId<EditTeamData>
) {
	return db
		.updateTable('AllTeam')
		.set({
			name,
			customUrl: slug,
			bio,
			bsky,
			avatarImgId: logo,
			bannerImgId: banner
			// css xxx: add custom colors for team
		})
		.where('id', '=', teamId)
		.returningAll()
		.executeTakeFirstOrThrow();
}

export function switchMainTeam({ userId, teamId }: { userId: number; teamId: number }) {
	return db.transaction().execute(async (trx) => {
		const currentTeams = await teamsByMemberUserId(userId, trx);

		const teamToSwitchTo = currentTeams.find((team) => team.id === teamId);
		invariant(teamToSwitchTo, 'User is not a member of this team');

		await trx
			.updateTable('AllTeamMember')
			.set({
				isMainTeam: false
			})
			.where('userId', '=', userId)
			.execute();

		await trx
			.updateTable('AllTeamMember')
			.set({
				isMainTeam: true
			})
			.where('userId', '=', userId)
			.where('teamId', '=', teamId)
			.execute();
	});
}

export function del(teamId: number) {
	return db.transaction().execute(async (trx) => {
		const members = await trx
			.selectFrom('TeamMember')
			.select(['TeamMember.userId'])
			.where('teamId', '=', teamId)
			.execute();

		// switch main team to another if they at least one secondary team
		for (const member of members) {
			const currentTeams = await teamsByMemberUserId(member.userId, trx);

			const teamToSwitchTo = currentTeams.find((team) => team.id !== teamId);

			if (!teamToSwitchTo) continue;

			await trx
				.updateTable('AllTeamMember')
				.set({
					isMainTeam: true
				})
				.where('userId', '=', member.userId)
				.where('teamId', '=', teamToSwitchTo.id)
				.execute();
		}

		await trx
			.updateTable('AllTeamMember')
			.set({
				isMainTeam: false
			})
			.where('AllTeamMember.teamId', '=', teamId)
			.execute();

		await LFGRepository.deletePostsByTeamId(teamId, trx);

		await trx
			.updateTable('AllTeam')
			.set({
				deletedAt: new Date()
			})
			.where('id', '=', teamId)
			.execute();
	});
}

export function removeTeamImage(teamId: number, imageType: 'avatar' | 'banner') {
	const imageIdField = imageType === 'avatar' ? 'avatarImgId' : 'bannerImgId';

	return db.transaction().execute(async (trx) => {
		const team = await trx
			.selectFrom('Team')
			.select(imageIdField)
			.where('id', '=', teamId)
			.executeTakeFirst();

		const imageId = team?.[imageIdField];
		if (imageId) {
			await trx.deleteFrom('UnvalidatedUserSubmittedImage').where('id', '=', imageId).execute();
		}

		await trx
			.updateTable('AllTeam')
			.set({
				[imageIdField]: null
			})
			.where('id', '=', teamId)
			.execute();
	});
}

export function resetInviteCode(teamId: number) {
	return db
		.updateTable('AllTeam')
		.set({
			inviteCode: shortNanoid()
		})
		.where('id', '=', teamId)
		.execute();
}

export function addNewTeamMember({
	userId,
	teamId,
	maxTeamsAllowed
}: {
	userId: number;
	teamId: number;
	maxTeamsAllowed: number;
}) {
	return db.transaction().execute(async (trx) => {
		const teamCount = (await teamsByMemberUserId(userId, trx)).length;

		if (teamCount >= maxTeamsAllowed) {
			throw new Error('Trying to exceed allowed team count');
		}

		const isMainTeam = teamCount === 0;

		await trx
			.insertInto('AllTeamMember')
			.values({ userId, teamId, isMainTeam })
			.onConflict((oc) =>
				oc.columns(['userId', 'teamId']).doUpdateSet({
					leftAt: null,
					isMainTeam
				})
			)
			.execute();
	});
}

export function handleMemberLeaving({
	userId,
	teamId,
	newOwnerUserId
}: {
	userId: number;
	teamId: number;
	newOwnerUserId?: number;
}) {
	return db.transaction().execute(async (trx) => {
		const currentTeams = await teamsByMemberUserId(userId, trx);

		const teamToLeave = currentTeams.find((team) => team.id === teamId);
		invariant(teamToLeave, 'User is not a member of this team');
		invariant(
			!teamToLeave.isOwner || newOwnerUserId,
			'New owner id must be provided when old is leaving'
		);

		const wasMainTeam = teamToLeave.isMainTeam;
		const newMainTeam = currentTeams.find((team) => team.id !== teamId);
		if (wasMainTeam && newMainTeam) {
			await trx
				.updateTable('AllTeamMember')
				.set({
					isMainTeam: true
				})
				.where('userId', '=', userId)
				.where('teamId', '=', newMainTeam.id)
				.execute();
		}

		await trx
			.updateTable('AllTeamMember')
			.set({
				leftAt: new Date(),
				isMainTeam: false,
				isOwner: false,
				isManager: false
			})
			.where('userId', '=', userId)
			.where('teamId', '=', teamId)
			.execute();
		if (newOwnerUserId) {
			await trx
				.updateTable('AllTeamMember')
				.set({
					isOwner: true,
					isManager: false
				})
				.where('userId', '=', newOwnerUserId)
				.where('teamId', '=', teamId)
				.execute();
		}
	});
}
