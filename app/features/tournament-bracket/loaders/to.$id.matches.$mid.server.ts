import cachified from "@epic-web/cachified";
import type { LoaderFunctionArgs } from "@remix-run/node";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { cache, IN_MILLISECONDS, ttl } from "~/utils/cache.server";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import { logger } from "~/utils/logger";
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

	// cached so that some user changing their noScreen preference doesn't
	// change the selection once the match has started
	const noScreen =
		match.opponentOne?.id && match.opponentTwo?.id
			? await cachified({
					key: `no-screen-mid-${matchId}`,
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
			? resolveMapList({
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

	return {
		match,
		results: findResultsByMatchId(matchId),
		mapList,
		matchIsOver:
			match.opponentOne?.result === "win" ||
			match.opponentTwo?.result === "win",
		noScreen,
	};
};
