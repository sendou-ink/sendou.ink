import cachified from "@epic-web/cachified";
import type { LoaderFunctionArgs } from "react-router";
import type { WindowSchedule } from "~/features/availability/availability-types";
import * as Availability from "~/features/availability/core/Availability";
import * as VisibleSchedules from "~/features/availability/core/VisibleSchedules.server";
import * as RouteChatRooms from "~/features/chat/RouteChatRooms.server";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import * as ScannerIngestRepository from "~/features/scanner-ingest/ScannerIngestRepository.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import type { Bracket } from "~/features/tournament-bracket/core/Bracket";
import { matchEndedEarly } from "~/features/tournament-bracket/core/engine";
import * as PickBan from "~/features/tournament-bracket/core/PickBan";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import {
	tournamentFromParams,
	tournamentTeamsFullCached,
} from "~/features/tournament-bracket/core/Tournament.server";
import { matchPageParamsSchema } from "~/features/tournament-bracket/tournament-bracket-schemas";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { cache, IN_MILLISECONDS, ttl } from "~/utils/cache.server";
import { databaseTimestampNow } from "~/utils/dates";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import { logger } from "~/utils/logger";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { executeRoll } from "../core/executeRoll.server";
import * as LeagueScheduling from "../core/LeagueScheduling";
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
					teams: [teamOne, teamTwo],
					toSetMapPool: tournament.organizerPickedMapPool,
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
						pool: tournament.mapPool,
						modesIncluded: tournament.modesIncluded,
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

	const bracketIdx = tournament.matchIdToBracketIdx(matchId);
	const bracket =
		typeof bracketIdx === "number" ? tournament.bracketByIdx(bracketIdx) : null;

	const schedule = await resolveLeagueSchedule({
		tournament,
		match,
		bracket,
		user,
		isParticipant,
		matchIsOver,
	});

	const canJoin =
		!matchIsOver &&
		match.opponentOne?.id != null &&
		match.opponentTwo?.id != null &&
		(isParticipant || tournament.isOrganizerOrStreamer(user)) &&
		(schedule.phase === "CLOSED" || schedule.phase === "SCHEDULED");

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
		chatRooms: await RouteChatRooms.resolve(
			user,
			match.chatRoomId &&
				(isParticipant || isSiteStaff || tournament.isOrganizerOrStreamer(user))
				? [{ roomId: match.chatRoomId, autoOpen: true }]
				: [],
		),
		canJoin,
		schedule,
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

const WEEK_SECONDS = 7 * 24 * 60 * 60;

/**
 * Where the set is in the league scheduling flow. The candidate board is only for the two teams
 * and organizers/streamers, the availability panel only for the viewer's own team.
 */
async function resolveLeagueSchedule({
	tournament,
	match,
	bracket,
	user,
	isParticipant,
	matchIsOver,
}: {
	tournament: Tournament;
	match: NonNullable<TournamentMatchRepository.FindMatchById>;
	bracket: Bracket | null;
	user: { id: number } | undefined;
	isParticipant: boolean;
	matchIsOver: boolean;
}) {
	const now = databaseTimestampNow();
	const isPlayableAt = tournament.isLeague ? match.roundIsPlayableAt : null;
	const phase = LeagueScheduling.phase({
		isLeague: tournament.isLeague,
		isOver: matchIsOver,
		hasBothTeams: Boolean(match.opponentOne?.id && match.opponentTwo?.id),
		isPlayableAt,
		scheduledAt: match.scheduledAt,
		now,
	});
	const ownTeamId =
		match.players.find((player) => player.id === user?.id)?.tournamentTeamId ??
		null;
	const canSeeBoard =
		tournament.isLeague &&
		(isParticipant || tournament.isOrganizerOrStreamer(user));
	const boardOpen = phase !== "CLOSED" && phase !== "NOT_OPEN";

	if (tournament.isLeague && user) {
		for (const type of [
			"TO_LEAGUE_TIMES_PROPOSED",
			"TO_LEAGUE_MATCH_SCHEDULED",
			"TO_LEAGUE_MATCH_STARTING_SOON",
		] as const) {
			await resolveNotifications({
				userIds: [user.id],
				type,
				meta: { matchId: match.id },
			});
		}
	}

	return {
		phase,
		now,
		isPlayableAt,
		opensAt: LeagueScheduling.opensAt(isPlayableAt),
		scheduledAt: match.scheduledAt,
		scheduleSetByOrganizer: Boolean(match.scheduleSetByOrganizer),
		ownTeamId,
		canSeeBoard,
		proposals:
			canSeeBoard && boardOpen
				? await TournamentMatchRepository.findScheduleProposalsByMatchId(
						match.id,
					)
				: [],
		availability:
			user && ownTeamId && boardOpen
				? await ownTeamAvailability({
						tournament,
						viewerId: user.id,
						ownTeamId,
						window: LeagueScheduling.availabilityWindow({
							now,
							isPlayableAt,
							nextIsPlayableAt: nextRoundPlayableAt(bracket, match),
						}),
					})
				: null,
	};
}

function nextRoundPlayableAt(
	bracket: Bracket | null,
	match: NonNullable<TournamentMatchRepository.FindMatchById>,
) {
	const round = bracket?.data.round.find((r) => r.id === match.roundId);
	if (!round) return null;

	return (
		bracket?.data.round.find(
			(r) =>
				r.groupId === round.groupId &&
				r.section === round.section &&
				r.number === round.number + 1,
		)?.isPlayableAt ?? null
	);
}

/** Every member of the viewer's own team, sharing implied by the roster. The set's own league doesn't count as busy. */
async function ownTeamAvailability({
	tournament,
	viewerId,
	ownTeamId,
	window,
}: {
	tournament: Tournament;
	viewerId: number;
	ownTeamId: number;
	window: { startsAt: number; endsAt: number };
}) {
	const memberUserIds = tournament.teamById(ownTeamId)?.memberUserIds ?? [];

	const { reportedWeeks, busyByUserId } = await VisibleSchedules.findByUserIds({
		userIds: memberUserIds,
		viewerId,
		...window,
		excludeTournamentId: tournament.ctx.id,
		bypassVisibility: true,
	});

	return {
		window,
		minPlayers: tournament.minMembersPerTeam,
		members: memberUserIds.map((userId): WindowSchedule => {
			const memberWeeks = reportedWeeks.filter(
				(week) => week.userId === userId,
			);
			const busy = busyByUserId.get(userId) ?? [];

			return {
				userId,
				reported: memberWeeks.some(
					(week) =>
						week.weekStartsAt < window.endsAt &&
						week.weekStartsAt + WEEK_SECONDS > window.startsAt,
				),
				ranges: Availability.subtract(
					Availability.clip(
						memberWeeks.flatMap((week) => week.slots),
						window,
					),
					busy,
				),
				busy: busy.filter((block) => Availability.overlaps(block, window)),
			};
		}),
	};
}
