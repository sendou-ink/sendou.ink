import { type ActionFunction, redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { clearTournamentDataCache } from "~/features/tournament-bracket/core/Tournament.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { safeParseRequestFormData } from "~/utils/remix.server";
import { errorIsSqliteUniqueConstraintFailure } from "~/utils/sql";
import { userPage } from "~/utils/urls";
import { userEditActionSchema } from "../user-page-schemas";

export const action: ActionFunction = async ({ request }) => {
	const parsedInput = await safeParseRequestFormData({
		request,
		schema: userEditActionSchema,
	});

	if (!parsedInput.success) {
		return {
			errors: parsedInput.errors,
		};
	}

	const {
		inGameNameText,
		inGameNameDiscriminator,
		newProfileEnabled,
		...data
	} = parsedInput.data;

	const user = requireUser();
	const inGameName =
		inGameNameText && inGameNameDiscriminator
			? `${inGameNameText}#${inGameNameDiscriminator}`
			: null;

	try {
		const pronouns =
			data.subjectPronoun && data.objectPronoun
				? JSON.stringify({
						subject: data.subjectPronoun,
						object: data.objectPronoun,
					})
				: null;

		const editedUser = await UserRepository.updateProfile({
			...data,
			pronouns,
			inGameName,
			userId: user.id,
		});

		await UserRepository.updatePreferences(user.id, {
			newProfileEnabled: Boolean(newProfileEnabled),
		});

		// TODO: to transaction
		if (inGameName) {
			const tournamentIdsAffected =
				await TournamentTeamRepository.updateMemberInGameNameForNonStarted({
					inGameName,
					userId: user.id,
				});

			for (const tournamentId of tournamentIdsAffected) {
				clearTournamentDataCache(tournamentId);
			}
		}

		throw redirect(userPage(editedUser));
	} catch (e) {
		if (!errorIsSqliteUniqueConstraintFailure(e)) {
			throw e;
		}

		return {
			errors: ["forms.errors.invalidCustomUrl.duplicate"],
		};
	}
};
