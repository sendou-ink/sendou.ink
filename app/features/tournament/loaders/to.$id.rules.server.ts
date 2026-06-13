import type { LoaderFunctionArgs } from "react-router";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});

	return {
		rules: await TournamentRepository.findRulesById(tournamentId),
	};
};
