import { type LoaderFunctionArgs, redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { parseParams } from "~/utils/remix.server";
import { tournamentSubsPage } from "~/utils/urls";
import { idObject } from "~/utils/zod";
import * as TournamentSubRepository from "../TournamentSubRepository.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = requireUser();
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});
	const tournament = await tournamentFromDB({ tournamentId, user });

	if (!tournament.canAddNewSubPost) {
		throw redirect(tournamentSubsPage(tournamentId));
	}

	return {
		sub: await TournamentSubRepository.findUserSubPost({
			tournamentId,
			userId: user.id,
		}),
		userDefaults: await UserRepository.findSubDefaultsByUserId(user.id),
	};
};
