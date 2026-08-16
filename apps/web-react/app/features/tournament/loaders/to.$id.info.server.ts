import type { LoaderFunctionArgs } from "react-router";
import * as SavedCalendarEventRepository from "~/features/tournament/SavedCalendarEventRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { tournamentId, user } = await tournamentFromParams(params, {
		for: "view",
	});

	const description =
		await TournamentRepository.findDescriptionById(tournamentId);

	if (!user) {
		return { isSaved: false, description };
	}

	return {
		isSaved: await SavedCalendarEventRepository.isSaved({
			userId: user.id,
			tournamentId,
		}),
		description,
	};
};
