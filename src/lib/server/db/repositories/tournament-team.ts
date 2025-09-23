// TODO: add rest of the functions here that relate more to tournament teams than tournament/bracket

import { sql } from 'kysely';
import { db } from '../sql';
import { databaseTimestampNow } from '$lib/utils/dates';
import type { TablesInsertable } from '../tables';
import invariant from '$lib/utils/invariant';
import { shortNanoid } from '$lib/utils/id';
import * as MapPool from '$lib/core/maps/MapPool';

export function findByInviteCode(inviteCode: string) {
	return db
		.selectFrom('TournamentTeam')
		.select(['id'])
		.where('TournamentTeam.inviteCode', '=', inviteCode)
		.executeTakeFirst();
}

export function setActiveRoster({
	teamId,
	activeRosterUserIds
}: {
	teamId: number;
	activeRosterUserIds: number[] | null;
}) {
	return db
		.updateTable('TournamentTeam')
		.set({
			activeRosterUserIds: activeRosterUserIds ? JSON.stringify(activeRosterUserIds) : null
		})
		.where('TournamentTeam.id', '=', teamId)
		.execute();
}

function regOpenTournamentTeamsByJoinedUserId(userId: number) {
	return db
		.selectFrom('TournamentTeamMember')
		.innerJoin('TournamentTeam', 'TournamentTeam.id', 'TournamentTeamMember.tournamentTeamId')
		.innerJoin('Tournament', 'Tournament.id', 'TournamentTeam.tournamentId')
		.innerJoin('CalendarEvent', 'CalendarEvent.tournamentId', 'Tournament.id')
		.innerJoin('CalendarEventDate', 'CalendarEventDate.eventId', 'CalendarEvent.id')
		.select(['TournamentTeam.tournamentId', 'TournamentTeamMember.tournamentTeamId'])
		.where('TournamentTeamMember.userId', '=', userId)
		.where(
			sql`coalesce(
      "Tournament"."settings" ->> 'regClosesAt', 
      "CalendarEventDate"."startTime"
    )`,
			'>',
			databaseTimestampNow()
		)
		.execute();
}

export async function updateMemberInGameName({
	userId,
	inGameName,
	tournamentTeamId
}: {
	userId: number;
	inGameName: string;
	tournamentTeamId: number;
}) {
	return db
		.updateTable('TournamentTeamMember')
		.set({ inGameName })
		.where('TournamentTeamMember.userId', '=', userId)
		.where('TournamentTeamMember.tournamentTeamId', '=', tournamentTeamId)
		.execute();
}

/**
 * Updates the in-game name of a tournament team member for tournaments that have not started yet.
 *
 * @returns A promise that resolves to an array of tournament IDs where the user's in-game name was updated.
 */
export async function updateMemberInGameNameForNonStarted({
	userId,
	inGameName
}: {
	/** The ID of the user whose in-game name is to be updated. */
	userId: number;
	/** The new in-game name to be set for the user. */
	inGameName: string;
}): Promise<number[]> {
	const tournamentTeams = await regOpenTournamentTeamsByJoinedUserId(userId);

	await db
		.updateTable('TournamentTeamMember')
		.set({ inGameName })
		.where('TournamentTeamMember.userId', '=', userId)
		// after they have checked in no longer can update their IGN from here
		.where(
			'TournamentTeamMember.tournamentTeamId',
			'in',
			tournamentTeams.map((t) => t.tournamentTeamId)
		)
		// if the tournament doesn't have the setting to require IGN, ignore
		.where('TournamentTeamMember.inGameName', 'is not', null)
		.execute();

	return tournamentTeams.map((t) => t.tournamentId);
}

export function create({
	team,
	avatarImgId,
	userId,
	tournamentId,
	ownerInGameName
}: {
	team: Pick<TablesInsertable['TournamentTeam'], 'name' | 'teamId'>;
	avatarImgId?: number | null;
	userId: number;
	tournamentId: number;
	ownerInGameName: string | null;
}) {
	return db.transaction().execute(async (trx) => {
		const tournamentTeam = await trx
			.insertInto('TournamentTeam')
			.values({
				tournamentId,
				name: team.name,
				inviteCode: shortNanoid(),
				teamId: team.teamId,
				avatarImgId
			})
			.returning('id')
			.executeTakeFirstOrThrow();

		await trx
			.insertInto('TournamentTeamMember')
			.values({
				tournamentTeamId: tournamentTeam.id,
				userId,
				isOwner: true,
				inGameName: ownerInGameName
			})
			.execute();

		return tournamentTeam;
	});
}

export function join({
	previousTeamId,
	whatToDoWithPreviousTeam,
	newTeamId,
	userId,
	inGameName,
	tournamentId,
	checkOutTeam = false
}: {
	previousTeamId?: number;
	whatToDoWithPreviousTeam?: 'LEAVE' | 'DELETE';
	newTeamId: number;
	userId: number;
	inGameName: string | null;
	tournamentId: number;
	checkOutTeam?: boolean;
}) {
	return db.transaction().execute(async (trx) => {
		if (whatToDoWithPreviousTeam === 'DELETE' && previousTeamId) {
			await trx.deleteFrom('MapPoolMap').where('tournamentTeamId', '=', previousTeamId).execute();
			await trx.deleteFrom('TournamentTeam').where('id', '=', previousTeamId).execute();
		} else if (whatToDoWithPreviousTeam === 'LEAVE' && previousTeamId) {
			await trx
				.deleteFrom('TournamentTeamMember')
				.where('tournamentTeamId', '=', previousTeamId)
				.where('userId', '=', userId)
				.execute();
		}

		if (!previousTeamId) {
			await trx
				.deleteFrom('TournamentSub')
				.where('tournamentId', '=', tournamentId)
				.where('userId', '=', userId)
				.execute();
		}

		if (checkOutTeam) {
			invariant(previousTeamId, 'previousTeamId is required when checking out team');
			await trx
				.deleteFrom('TournamentTeamCheckIn')
				.where('tournamentTeamId', '=', previousTeamId)
				.execute();
		}

		await trx
			.insertInto('TournamentTeamMember')
			.values({
				tournamentTeamId: newTeamId,
				inGameName,
				userId
			})
			.execute();
	});
}

export function copyFromAnotherTournament({
	tournamentTeamId,
	destinationTournamentId,
	seed,
	defaultCheckedIn = false
}: {
	tournamentTeamId: number;
	destinationTournamentId: number;
	seed?: number;
	defaultCheckedIn?: boolean;
}) {
	return db.transaction().execute(async (trx) => {
		const oldTeam = await trx
			.selectFrom('TournamentTeam')
			.select([
				'TournamentTeam.avatarImgId',
				'TournamentTeam.createdAt',
				'TournamentTeam.name',
				'TournamentTeam.teamId'

				// -- exclude these
				// "TournamentTeam.id"
				// "TournamentTeam.droppedOut"
				// "TournamentTeam.activeRosterUserIds"
				// "TournamentTeam.seed"
				// "TournamentTeam.startingBracketIdx"
				// "TournamentTeam.inviteCode"
				// "TournamentTeam.tournamentId"
				// "TournamentTeam.activeRosterUserIds",
			])
			.where('id', '=', tournamentTeamId)
			.executeTakeFirstOrThrow();

		const oldMembers = await trx
			.selectFrom('TournamentTeamMember')
			.select([
				'TournamentTeamMember.createdAt',
				'TournamentTeamMember.inGameName',
				'TournamentTeamMember.isOwner',
				'TournamentTeamMember.userId'

				// -- exclude these
				// "TournamentTeamMember.tournamentTeamId"
			])
			.where('tournamentTeamId', '=', tournamentTeamId)
			.execute();
		invariant(oldMembers.length > 0, 'Team has no members');

		const oldMapPool = await trx
			.selectFrom('MapPoolMap')
			.select(['MapPoolMap.mode', 'MapPoolMap.stageId'])
			.where('tournamentTeamId', '=', tournamentTeamId)
			.execute();

		const newTeam = await trx
			.insertInto('TournamentTeam')
			.values({
				...oldTeam,
				tournamentId: destinationTournamentId,
				inviteCode: shortNanoid(),
				seed
			})
			.returning('id')
			.executeTakeFirstOrThrow();

		if (defaultCheckedIn) {
			await trx
				.insertInto('TournamentTeamCheckIn')
				.values({
					checkedInAt: new Date(),
					tournamentTeamId: newTeam.id,
					bracketIdx: null
				})
				.execute();
		}

		await trx
			.insertInto('TournamentTeamMember')
			.values(
				oldMembers.map((member) => ({
					...member,
					isOwner: Boolean(member.isOwner),
					tournamentTeamId: newTeam.id
				}))
			)
			.execute();

		if (oldMapPool.length > 0) {
			await trx
				.insertInto('MapPoolMap')
				.values(
					oldMapPool.map((mapPoolMap) => ({
						...mapPoolMap,
						tournamentTeamId: newTeam.id
					}))
				)
				.execute();
		}
	});
}

export function update(
	id: number,
	{
		name,
		teamId,
		avatarImgId
	}: Pick<TablesInsertable['TournamentTeam'], 'name' | 'teamId'> & {
		avatarImgId: number | null;
	}
) {
	return db
		.updateTable('TournamentTeam')
		.set({
			name,
			teamId,
			avatarImgId
		})
		.where('TournamentTeam.id', '=', id)
		.execute();
}

export function deleteById(tournamentTeamId: number) {
	return db.transaction().execute(async (trx) => {
		await trx.deleteFrom('MapPoolMap').where('tournamentTeamId', '=', tournamentTeamId).execute();
		await trx.deleteFrom('TournamentTeam').where('id', '=', tournamentTeamId).execute();
	});
}

export function upsertMapPool(id: number, { mapPool }: { mapPool: MapPool.PartialMapPool }) {
	return db.transaction().execute(async (trx) => {
		await trx.deleteFrom('MapPoolMap').where('tournamentTeamId', '=', id).execute();

		await trx
			.insertInto('MapPoolMap')
			.values([...MapPool.toArray(mapPool)].map((values) => ({ ...values, tournamentTeamId: id })))
			.execute();
	});
}

export function updateStartingBrackets(
	startingBrackets: {
		tournamentTeamId: number;
		startingBracketIdx: number;
	}[]
) {
	const grouped = Object.groupBy(startingBrackets, (sb) => sb.startingBracketIdx);

	return db.transaction().execute(async (trx) => {
		for (const [startingBracketIdx, tournamentTeamIds = []] of Object.entries(grouped)) {
			await trx
				.updateTable('TournamentTeam')
				.set({ startingBracketIdx: Number(startingBracketIdx) })
				.where(
					'TournamentTeam.id',
					'in',
					tournamentTeamIds.map((t) => t.tournamentTeamId)
				)
				.execute();
		}
	});
}

export function deleteMember({
	userId,
	tournamentTeamId
}: {
	userId: number;
	tournamentTeamId: number;
}) {
	return db
		.deleteFrom('TournamentTeamMember')
		.where('userId', '=', userId)
		.where('tournamentTeamId', '=', tournamentTeamId)
		.execute();
}

export function resetInviteCode(tournamentTeamId: number) {
	return db
		.updateTable('TournamentTeam')
		.set({ inviteCode: shortNanoid() })
		.where('id', '=', tournamentTeamId)
		.execute();
}
