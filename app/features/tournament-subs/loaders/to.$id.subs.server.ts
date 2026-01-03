import { type LoaderFunctionArgs, redirect } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import { parseParams } from "~/utils/remix.server";
import { tournamentRegisterPage } from "~/utils/urls";
import { idObject } from "~/utils/zod";
import * as TournamentSubRepository from "../TournamentSubRepository.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = await getUser();
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});

	const tournament = await tournamentFromDB({ tournamentId, user });
	if (!tournament.subsFeatureEnabled) {
		throw redirect(tournamentRegisterPage(tournamentId));
	}

	const subs = await TournamentSubRepository.findSubsVisibleToUser({
		tournamentId,
		userId: user?.id,
	});

	return {
		subs,
		hasOwnSubPost: subs.some((sub) => sub.userId === user?.id),
	};
};
