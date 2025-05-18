import type { LoaderFunctionArgs } from "@remix-run/node";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import { resolveMapList } from "../core/mapList.server";
import { findMatchById } from "../queries/findMatchById.server";
import { findResultsByMatchId } from "../queries/findResultsByMatchId.server";
import { matchPageParamsSchema } from "../tournament-bracket-schemas.server";

export type TournamentMatchLoaderData = typeof loader;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { mid: matchId, id: tournamentId } = parseParams({
		params,
		schema: matchPageParamsSchema,
	});

	const match = notFoundIfFalsy(findMatchById(matchId));

	const isBye = !match.opponentOne || !match.opponentTwo;
	if (isBye) {
		throw new Response(null, { status: 404 });
	}

	const pickBanEvents = match.roundMaps?.pickBan
		? await TournamentRepository.pickBanEventsByMatchId(match.id)
		: [];

	const mapList =
		match.opponentOne?.id && match.opponentTwo?.id
			? resolveMapList({
					bestOf: match.bestOf,
					tournamentId,
					matchId,
					teams: [match.opponentOne.id, match.opponentTwo.id],
					mapPickingStyle: match.mapPickingStyle,
					maps: match.roundMaps,
					pickBanEvents,
				})
			: null;

	return {
		match,
		results: findResultsByMatchId(matchId),
		mapList,
		matchIsOver:
			match.opponentOne?.result === "win" ||
			match.opponentTwo?.result === "win",
	};
};
