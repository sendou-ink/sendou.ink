import cachified from "@epic-web/cachified";
import type { LoaderFunctionArgs } from "@remix-run/node";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { cache, IN_MILLISECONDS, ttl } from "~/utils/cache.server";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import { logger } from "~/utils/logger";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import { mapListFromResults, resolveMapList } from "../core/mapList.server";
import { findMatchById } from "../queries/findMatchById.server";
import { findResultsByMatchId } from "../queries/findResultsByMatchId.server";
import { matchPageParamsSchema } from "../tournament-bracket-schemas.server";
import { matchEndedEarly } from "../tournament-bracket-utils";

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

	const results = findResultsByMatchId(matchId);

	const matchIsOver =
		match.opponentOne?.result === "win" || match.opponentTwo?.result === "win";

	// cached so that some user changing their noScreen preference doesn't
	// change the selection once the match has started
	const noScreen =
		match.opponentOne?.id && match.opponentTwo?.id
			? await cachified({
					key: `no-screen-mid-${matchId}-${match.opponentOne.id}-${match.opponentTwo.id}`,
					cache,
					// avoid preferences from other test runs leaking in
					ttl: IS_E2E_TEST_RUN ? -1 : ttl(IN_MILLISECONDS.TWO_DAYS),
					async getFreshValue() {
						return UserRepository.anyUserPrefersNoScreen(
							match.players.map((p) => p.id),
						);
					},
				})
			: null;

	const mapList =
		match.opponentOne?.id && match.opponentTwo?.id
			? matchIsOver
				? mapListFromResults(results)
				: resolveMapList({
						tournamentId,
						matchId,
						teams: [match.opponentOne.id, match.opponentTwo.id],
						mapPickingStyle: match.mapPickingStyle,
						maps: match.roundMaps,
						pickBanEvents,
						recentlyPlayedMaps:
							match.mapPickingStyle !== "TO"
								? await TournamentTeamRepository.findRecentlyPlayedMapsByIds({
										teamIds: [match.opponentOne.id, match.opponentTwo.id],
									}).catch((error) => {
										logger.error("Failed to fetch recently played maps", error);
										return [];
									})
								: undefined,
					})
			: null;

	const endedEarly = matchIsOver
		? matchEndedEarly({
				opponentOne: {
					score: match.opponentOne?.score,
					result: match.opponentOne?.result,
				},
				opponentTwo: {
					score: match.opponentTwo?.score,
					result: match.opponentTwo?.result,
				},
				count: match.roundMaps.count,
				countType: match.roundMaps.type,
			})
		: false;

	return {
		match,
		results,
		mapList,
		matchIsOver,
		endedEarly,
		noScreen,
	};
};
