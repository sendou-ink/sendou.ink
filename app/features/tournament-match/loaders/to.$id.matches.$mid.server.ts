import cachified from "@epic-web/cachified";
import type { LoaderFunctionArgs } from "react-router";
import type { RouteChatRoom } from "~/features/chat/chat-types";
import * as ScannerIngestRepository from "~/features/scanner-ingest/ScannerIngestRepository.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import {
	isLeagueRoundLocked,
	resolveLeagueRoundStartDate,
} from "~/features/tournament/tournament-utils";
import { matchEndedEarly } from "~/features/tournament-bracket/core/engine";
import * as PickBan from "~/features/tournament-bracket/core/PickBan";
import {
	tournamentFromParams,
	tournamentTeamsFullCached,
} from "~/features/tournament-bracket/core/Tournament.server";
import { matchPageParamsSchema } from "~/features/tournament-bracket/tournament-bracket-schemas";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { cache, IN_MILLISECONDS, ttl } from "~/utils/cache.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import { logger } from "~/utils/logger";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { executeRoll } from "../core/executeRoll.server";
import { mapListFromResults, resolveMapList } from "../core/mapList.server";
import * as TournamentMatchRepository from "../TournamentMatchRepository.server";

export type TournamentMatchLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { mid: matchId } = parseParams({
		params,
		schema: matchPageParamsSchema,
	});
	const { tournament, tournamentId, user } = await tournamentFromParams(
		params,
		{ for: "view" },
	);

	const teamsFull = await tournamentTeamsFullCached({ tournamentId, user });
	const teamFullById = (tournamentTeamId: number) =>
		teamsFull.find((team) => team.id === tournamentTeamId);

	const match = notFoundIfNullish(
		await TournamentMatchRepository.findMatchById(matchId),
	);

	if (match.tournamentId !== tournamentId) {
		throw new Response(null, { status: 404 });
	}

	const isBye = !match.opponentOne || !match.opponentTwo;
	if (isBye) {
		throw new Response(null, { status: 404 });
	}

	let pickBanEvents = match.roundMaps?.pickBan
		? await TournamentRepository.findPickBanEventsByMatchId(match.id)
		: [];

	const results = await TournamentMatchRepository.findResultsByMatchId(matchId);

	const reportedWeapons =
		await ReportedWeaponRepository.findByTournamentMatchId(matchId);

	const ingestedScoreboards =
		await ScannerIngestRepository.findScoreboardsByTournamentMatchId(matchId);

	const matchIsOver = Boolean(match.winnerSide);

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
			const teamOne = teamFullById(match.opponentOne.id);
			const teamTwo = teamFullById(match.opponentTwo.id);
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
					pickBanEvents = await TournamentRepository.findPickBanEventsByMatchId(
						match.id,
					);
				}
			}
		}
	}

	// cached so a noScreen preference change doesn't change the selection once the match has started
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
						mapPoolByTeamId: (teamId) => teamFullById(teamId)?.mapPool ?? [],
						mapPickingStyle: match.mapPickingStyle,
						maps: match.roundMaps,
						tieBreakerMapPool: tournament.ctx.tieBreakerMapPool,
						pickBanEvents,
						recentlyPlayedMaps:
							match.mapPickingStyle !== "TO"
								? await TournamentTeamRepository.findRecentlyPlayedMapsByIds({
										teamIds: [match.opponentOne.id, match.opponentTwo.id],
										excludeMatchId: matchId,
									}).catch((error) => {
										logger.error("Failed to fetch recently played maps", error);
										return [];
									})
								: undefined,
					})
			: null;

	const endedEarly = matchIsOver
		? matchEndedEarly({
				opponentOne: match.opponentOne,
				opponentTwo: match.opponentTwo,
				winnerSide: match.winnerSide,
				count: match.roundMaps.count,
				countType: match.roundMaps.type,
			})
		: false;

	const status = tournament.matchStatusById(matchId);

	const isSiteStaff = user?.roles.includes("STAFF") ?? false;
	const isTournamentStaff = tournament.isOrganizer(user);

	const isParticipant = match.players.some((p) => p.id === user?.id);
	const leagueRoundLocked = isLeagueRoundLocked(tournament, match.roundId);
	const canJoin =
		!matchIsOver &&
		match.opponentOne?.id != null &&
		match.opponentTwo?.id != null &&
		(isParticipant || tournament.isOrganizerOrStreamer(user)) &&
		!leagueRoundLocked;

	const bracketIdx = tournament.matchIdToBracketIdx(matchId);
	const bracket =
		typeof bracketIdx === "number" ? tournament.bracketByIdx(bracketIdx) : null;
	const leagueRoundStartDate = leagueRoundLocked
		? resolveLeagueRoundStartDate(
				tournament,
				bracket ?? undefined,
				match.roundId,
			)
		: null;

	return {
		...(await UserCardRepository.findAllByUserIdsCached({
			userIds: match.players.map((p) => p.id),
			include: {
				friendCode: isParticipant || isSiteStaff || isTournamentStaff,
			},
		})),
		match: {
			...match,
			status,
			chatRoomId: undefined,
		},
		results,
		reportedWeapons,
		ingestedScoreboards,
		mapList,
		teams: [match.opponentOne?.id, match.opponentTwo?.id].flatMap(
			(tournamentTeamId) => {
				const team = tournamentTeamId ? teamFullById(tournamentTeamId) : null;
				return team ? [team] : [];
			},
		),
		matchIsOver,
		endedEarly,
		noScreen,
		// observers (TO/streamer/site staff) chat alongside the participants
		chatRooms: (match.chatRoomId &&
		(isParticipant || isSiteStaff || tournament.isOrganizerOrStreamer(user))
			? [{ roomId: match.chatRoomId, autoOpen: true }]
			: []) satisfies RouteChatRoom[],
		canJoin,
		// the views can't derive these themselves, the layout ships no bracket match data
		bracketContext: {
			bracketIdx,
			bracketType: bracket?.type ?? null,
			collectsKos: bracket?.collectsKos ?? false,
			groupNumber:
				bracket?.data.group.find((group) => group.id === match.groupId)
					?.number ?? null,
			hasRoundRobin: tournament.bracketsMeta.some(
				(meta) => meta.type === "round_robin",
			),
			names: tournament.matchContextNamesById(matchId),
			canBeReopened: tournament.matchCanBeReopened(matchId),
			leagueRoundLocked,
			leagueRoundStartDate: leagueRoundStartDate
				? dateToDatabaseTimestamp(leagueRoundStartDate)
				: null,
		},
		pickBanEventCount: pickBanEvents.length,
		pickBanEvents: pickBanEvents.map((e) => ({
			type: e.type,
			stageId: e.stageId,
			mode: e.mode,
			createdAt: e.createdAt,
		})),
	};
};
