import { requireUser } from '$lib/server/auth/session';
import { validatedForm } from '$lib/server/remote-functions';
import { editProfileSchema } from './schemas';
import * as UserRepository from '$lib/server/db/repositories/user';
import { err, ok } from 'neverthrow';
import { m } from '$lib/paraglide/messages';
import { logger } from '$lib/utils/logger';

export const updateProfile = validatedForm(editProfileSchema, async (data) => {
	const user = await requireUser();

	await new Promise((resolve) => setTimeout(resolve, 1500));

	const customUrlValidationResult = await validateCustomUrl(data.customUrl, user.id);
	if (customUrlValidationResult.isErr()) {
		return {
			errors: {
				// xxx: translate, getLocaleFromCookie??
				customUrl: m.user_forms_errors_invalidCustomUrl_duplicate()
			}
		};
	}

	logger.info(data);

	// const inGameName =
	// 	inGameNameText && inGameNameDiscriminator
	// 		? `${inGameNameText}#${inGameNameDiscriminator}`
	// 		: null;

	// try {
	// 	const editedUser = await UserRepository.updateProfile({
	// 		...data,
	// 		inGameName,
	// 		userId: user.id
	// 	});

	// 	// TODO: to transaction
	// 	if (inGameName) {
	// 		const tournamentIdsAffected =
	// 			await TournamentTeamRepository.updateMemberInGameNameForNonStarted({
	// 				inGameName,
	// 				userId: user.id
	// 			});

	// 		for (const tournamentId of tournamentIdsAffected) {
	// 			clearTournamentDataCache(tournamentId);
	// 		}
	// 	}

	// 	throw redirect(userPage(editedUser));
	// } catch (e) {
	// 	if (!errorIsSqliteUniqueConstraintFailure(e)) {
	// 		throw e;
	// 	}

	// 	return {
	// 		errors: ['forms.errors.invalidCustomUrl.duplicate']
	// 	};
	// }
});

async function validateCustomUrl(newCustomUrl: string | null, loggedInUserId: number) {
	if (!newCustomUrl) return ok();

	const profile = await UserRepository.findProfileByIdentifier(newCustomUrl);

	if (!profile || profile.id === loggedInUserId) return ok();

	return err('custom URL taken');
}
