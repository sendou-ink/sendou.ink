import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as SavedCalendarEventRepository from "~/features/tournament/SavedCalendarEventRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = getUser();
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
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
