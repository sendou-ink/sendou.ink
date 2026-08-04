import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import {
	requireTournamentVisible,
	tournamentDataCached,
} from "~/features/tournament-bracket/core/Tournament.server";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});

	const { ctx } = await tournamentDataCached({ tournamentId });
	requireTournamentVisible({ ctx, user: getUser() });

	return {
		rules: await TournamentRepository.findRulesById(tournamentId),
	};
};
