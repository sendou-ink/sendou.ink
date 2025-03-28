import { type ActionFunction, redirect } from "@remix-run/node";
import { requireUserId } from "~/features/auth/core/user.server";
import { clearTournamentDataCache } from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { safeParseRequestFormData } from "~/utils/remix.server";
import { errorIsSqliteUniqueConstraintFailure } from "~/utils/sql";
import { userPage } from "~/utils/urls";
import { userEditActionSchema } from "../user-page-schemas.server";

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

	const { inGameNameText, inGameNameDiscriminator, ...data } = parsedInput.data;

	const user = await requireUserId(request);
	const inGameName =
		inGameNameText && inGameNameDiscriminator
			? `${inGameNameText}#${inGameNameDiscriminator}`
			: null;

	try {
		const editedUser = await UserRepository.updateProfile({
			...data,
			inGameName,
			userId: user.id,
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
