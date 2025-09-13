import { validatedForm } from '$lib/server/remote-functions';
import { editProfileSchema, insertFriendCodeSchema } from './schemas';
import * as UserRepository from '$lib/server/db/repositories/user';
import { err, ok } from 'neverthrow';
import { m } from '$lib/paraglide/messages';
import { logger } from '$lib/utils/logger';
import { error, redirect } from '@sveltejs/kit';
import * as TournamentTeamRepository from '$lib/server/db/repositories/tournament-team';
import { resolve } from '$app/paths';
import { myFriendCode } from '$lib/api/user/queries.remote';
import * as AdminRepository from '$lib/server/db/repositories/admin';

export const updateProfile = validatedForm(editProfileSchema, async (data, user) => {
	const customUrlValidationResult = await validateCustomUrl(data.customUrl, user.id);
	if (customUrlValidationResult.isErr()) {
		return {
			errors: {
				customUrl: m.user_forms_errors_invalidCustomUrl_duplicate
			}
		};
	}

	const editedUser = await UserRepository.updateProfile(user.id, data);

	// TODO: to transaction
	if (data.inGameName) {
		const tournamentIdsAffected =
			await TournamentTeamRepository.updateMemberInGameNameForNonStarted({
				inGameName: data.inGameName,
				userId: user.id
			});

		for (const tournamentId of tournamentIdsAffected) {
			logger.warn('TODO: clear tournament cache', tournamentId);
			// xxx: add clearing tournament cache
			// clearTournamentDataCache(tournamentId);
		}
	}

	redirect(
		303,
		resolve('/u/[identifier]', { identifier: editedUser.customUrl ?? editedUser.discordId })
	);
});

async function validateCustomUrl(newCustomUrl: string | null, loggedInUserId: number) {
	if (!newCustomUrl) return ok();

	const profile = await UserRepository.findProfileByIdentifier(newCustomUrl);

	if (!profile || profile.id === loggedInUserId) return ok();

	return err('custom URL taken');
}

export const insertFriendCode = validatedForm(insertFriendCodeSchema, async (data, user) => {
	const existingFriendCode = await myFriendCode();
	if (existingFriendCode) error(400);

	const isTakenFriendCode = (await UserRepository.allCurrentFriendCodes()).has(data.friendCode);

	await UserRepository.insertFriendCode({
		userId: user.id,
		friendCode: data.friendCode,
		submitterUserId: user.id
	});

	if (isTakenFriendCode) {
		await AdminRepository.banUser(user.id, {
			banned: 1,
			bannedReason:
				'[automatic ban] This friend code is already in use by some other account. Please contact staff on our Discord helpdesk for resolution including merging accounts.',
			bannedByUserId: null
		});

		// refreshBannedCache(); xxx: refresh banned cache

		myFriendCode().refresh();

		redirect(303, resolve('/suspended'));
	}
});
