import cachified from "@epic-web/cachified";
import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { chatAccessible } from "~/features/chat/chat-utils";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { cache, IN_MILLISECONDS, ttl } from "~/utils/cache.server";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import { logger } from "~/utils/logger";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import { tournamentMatchPage } from "~/utils/urls";
import { executeRoll } from "../core/executeRoll.server";
import { mapListFromResults, resolveMapList } from "../core/mapList.server";
import * as PickBan from "../core/PickBan";
import { tournamentFromDBCached } from "../core/Tournament.server";
import { findResultsByMatchId } from "../queries/findResultsByMatchId.server";
import * as TournamentMatchRepository from "../TournamentMatchRepository.server";
import { matchPageParamsSchema } from "../tournament-bracket-schemas.server";
import { matchEndedEarly } from "../tournament-bracket-utils";

export type TournamentMatchLoaderData = typeof loader;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { mid: matchId, id: tournamentId } = parseParams({
		params,
		schema: matchPageParamsSchema,
	});
	const user = getUser();
	const tournament = await tournamentFromDBCached({
		tournamentId,
		user: undefined,
	});

	const match = notFoundIfFalsy(
		await TournamentMatchRepository.findMatchById(matchId),
	);

	const isBye = !match.opponentOne || !match.opponentTwo;
	if (isBye) {
		throw new Response(null, { status: 404 });
	}

	let pickBanEvents = match.roundMaps?.pickBan
		? await TournamentRepository.pickBanEventsByMatchId(match.id)
		: [];

	const results = findResultsByMatchId(matchId);

	const matchIsOver =
		match.opponentOne?.result === "win" || match.opponentTwo?.result === "win";

	if (
		!matchIsOver &&
		match.roundMaps?.pickBan === "CUSTOM" &&
		match.roundMaps.customFlow &&
		match.opponentOne?.id &&
		match.opponentTwo?.id
	) {
		const currentStep = PickBan.resolveCurrentStep({
			eventCount: pickBanEvents.length,
			preSet: match.roundMaps.customFlow.preSet,
			postGame: match.roundMaps.customFlow.postGame,
			resultsCount: results.length,
		});
		if (currentStep?.action === "ROLL") {
			const teamOne = tournament.teamById(match.opponentOne.id);
			const teamTwo = tournament.teamById(match.opponentTwo.id);
			if (teamOne && teamTwo) {
				const rollExecuted = await executeRoll({
					matchId,
					maps: match.roundMaps,
					pickBanEvents,
					results,
					tournamentId,
					teams: [teamOne, teamTwo],
					tieBreakerMapPool: tournament.ctx.tieBreakerMapPool,
				});
				if (rollExecuted) {
					pickBanEvents = await TournamentRepository.pickBanEventsByMatchId(
						match.id,
					);
				}
			}
		}
	}

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

	if (
		match.chatCode &&
		!matchIsOver &&
		match.opponentOne &&
		match.opponentTwo
	) {
		const playerIds = match.players.map((p) => p.id);
		const matchContext = tournament.matchContextNamesById(matchId);

		ChatSystemMessage.setMetadata({
			chatCode: match.chatCode,
			header: matchContext.roundName ?? `Match #${matchId}`,
			subtitle: tournament.ctx.name,
			url: tournamentMatchPage({ tournamentId, matchId }),
			imageUrl: tournament.ctx.logoUrl,
			participantUserIds: playerIds,
			expiresAfter: tournament.isLeagueDivision ? { days: 30 } : { hours: 2 },
		});
	}

	const shouldSeeChat =
		tournament.isOrganizerOrStreamer(user) ||
		match.players.some((p) => p.id === user?.id);

	const isStaff = user?.roles.includes("STAFF") ?? false;
	const chatCodeExpired = tournament.ctx.isFinalized
		? true
		: !chatAccessible({
				isStaff,
				expiresAfterDays: 90,
				comparedTo: tournament.ctx.startTime,
			});

	const visibleChatCode =
		shouldSeeChat && !chatCodeExpired ? match.chatCode : undefined;

	return {
		match: shouldSeeChat ? match : { ...match, chatCode: undefined },
		results,
		mapList,
		matchIsOver,
		endedEarly,
		noScreen,
		chatCode: visibleChatCode,
		pickBanEventCount: pickBanEvents.length,
		pickBanEvents: pickBanEvents.map((e) => ({
			type: e.type,
			stageId: e.stageId,
			mode: e.mode,
		})),
	};
};
