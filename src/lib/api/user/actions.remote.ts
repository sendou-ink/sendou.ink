import { requireUser } from '$lib/server/auth/session';
import { validatedForm } from '$lib/server/remote-functions';
import { editProfileSchema } from './schemas';
import * as UserRepository from '$lib/server/db/repositories/user';
import { err, ok } from 'neverthrow';
import { m } from '$lib/paraglide/messages';
import { logger } from '$lib/utils/logger';
import { redirect } from '@sveltejs/kit';
import { userPage } from '$lib/utils/urls';
import * as TournamentTeamRepository from '$lib/server/db/repositories/tournament-team';

export const updateProfile = validatedForm(editProfileSchema, async (data) => {
	const user = await requireUser();

	await new Promise((resolve) => setTimeout(resolve, 1500));

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

	redirect(303, userPage(editedUser));
});

async function validateCustomUrl(newCustomUrl: string | null, loggedInUserId: number) {
	if (!newCustomUrl) return ok();

	const profile = await UserRepository.findProfileByIdentifier(newCustomUrl);

	if (!profile || profile.id === loggedInUserId) return ok();

	return err('custom URL taken');
}
