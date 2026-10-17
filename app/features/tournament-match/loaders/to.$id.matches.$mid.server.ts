import cachified from "@epic-web/cachified";
import type { LoaderFunctionArgs } from "react-router";
import type { WindowSchedule } from "~/features/availability/availability-types";
import * as Availability from "~/features/availability/core/Availability";
import * as VisibleSchedules from "~/features/availability/core/VisibleSchedules.server";
import type { RouteChatRoomInput } from "~/features/chat/chat-types";
import * as RouteChatRooms from "~/features/chat/RouteChatRooms.server";
import * as MatchProfileRepository from "~/features/match-profile/MatchProfileRepository.server";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import * as ScannerIngestRepository from "~/features/scanner-ingest/ScannerIngestRepository.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import type { Bracket } from "~/features/tournament-bracket/core/Bracket";
import { matchEndedEarly } from "~/features/tournament-bracket/core/engine";
import * as PickBan from "~/features/tournament-bracket/core/PickBan";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import {
	canSeeTournamentFriendCodes,
	tournamentFromParams,
	tournamentTeamsFullCached,
} from "~/features/tournament-bracket/core/Tournament.server";
import { matchPageParamsSchema } from "~/features/tournament-bracket/tournament-bracket-schemas";
import { showsOneGroupAtATime } from "~/features/tournament-bracket/tournament-bracket-utils";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { cache, IN_MILLISECONDS, ttl } from "~/utils/cache.server";
import { databaseTimestampNow } from "~/utils/dates";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import { logger } from "~/utils/logger";
import type { SerializeFrom } from "~/utils/remix";
import { notFound, notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { executeRoll } from "../core/executeRoll.server";
import * as LeagueScheduling from "../core/LeagueScheduling";
import { mapListFromResults, resolveMapList } from "../core/mapList.server";
import type { FindMatchById } from "../TournamentMatchRepository.server";
import * as TournamentMatchRepository from "../TournamentMatchRepository.server";

export type TournamentMatchLoaderData = SerializeFrom<typeof loader>;

type TeamFull = Awaited<ReturnType<typeof tournamentTeamsFullCached>>[number];
type TeamFullById = (tournamentTeamId: number) => TeamFull | undefined;
type LoaderMatch = NonNullable<FindMatchById>;

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
	const teamFullById: TeamFullById = (tournamentTeamId: number) =>
		teamsFull.find((team) => team.id === tournamentTeamId);

	const match = notFoundIfNullish(
		await TournamentMatchRepository.findMatchById(matchId),
	);

	if (match.tournamentId !== tournamentId) {
		notFound();
	}

	const isBye = !match.opponentOne || !match.opponentTwo;
	if (isBye) {
		notFound();
	}

	const pickBanEventsBeforeRoll = match.roundMaps?.pickBan
		? await TournamentRepository.findPickBanEventsByMatchId(match.id)
		: [];

	const results = await TournamentMatchRepository.findResultsByMatchId(matchId);

	const reportedWeapons =
		await ReportedWeaponRepository.findByTournamentMatchId(matchId);

	const ingestedScoreboards =
		await ScannerIngestRepository.findScoreboardsByTournamentMatchId(matchId);

	const matchIsOver = Boolean(match.winnerSide);

	const pickBanEvents = await pickBanEventsAfterPendingRoll({
		tournament,
		match,
		matchId,
		matchIsOver,
		results,
		pickBanEvents: pickBanEventsBeforeRoll,
		teamFullById,
	});

	// cached so a noScreen preference change doesn't change the selection once the match has started
	const noScreen = await cachedNoScreen(match, matchId);

	const mapList = await matchMapList({
		tournament,
		tournamentId,
		match,
		matchId,
		matchIsOver,
		results,
		pickBanEvents,
		teamFullById,
	});

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

	const canJoin = canJoinMatchRoom({
		tournament,
		match,
		user,
		isParticipant,
		matchIsOver,
		schedulePhase: schedule.phase,
	});

	return {
		...(await UserCardRepository.findAllByUserIdsCached({
			userIds: match.players.map((p) => p.id),
			include: {
				friendCode:
					isParticipant ||
					isSiteStaff ||
					canSeeTournamentFriendCodes({ ctx: tournament.ctx, user }),
			},
		})),
		match: {
			...match,
			status,
			chatRoomId: undefined,
		},
		results,
		reportedWeapons,
		viewerWeaponPoolIds: await viewerWeaponPoolIds(user, isParticipant),
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
		chatRooms: await RouteChatRooms.resolve(
			user,
			await chatRoomInputs({
				match,
				userId: user?.id,
				canChatInMatch:
					isParticipant ||
					isSiteStaff ||
					tournament.isOrganizerOrStreamer(user),
				canReadTeamChats: isSiteStaff || isTournamentStaff,
				teamName: (tournamentTeamId) => teamFullById(tournamentTeamId)?.name,
			}),
		),
		canJoin,
		schedule,
		// the views can't derive these themselves, the layout ships no bracket match data
		bracketContext: bracketContext({ tournament, bracket, bracketIdx, match }),
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

/** Runs the server's own roll step when a custom flow is waiting on it, returning the pick/ban events as they are after it. */
async function pickBanEventsAfterPendingRoll({
	tournament,
	match,
	matchId,
	matchIsOver,
	results,
	pickBanEvents,
	teamFullById,
}: {
	tournament: Tournament;
	match: LoaderMatch;
	matchId: number;
	matchIsOver: boolean;
	results: Awaited<
		ReturnType<typeof TournamentMatchRepository.findResultsByMatchId>
	>;
	pickBanEvents: Awaited<
		ReturnType<typeof TournamentRepository.findPickBanEventsByMatchId>
	>;
	teamFullById: TeamFullById;
}) {
	if (
		matchIsOver ||
		match.roundMaps?.pickBan !== "CUSTOM" ||
		!match.roundMaps.customFlow ||
		!match.opponentOne?.id ||
		!match.opponentTwo?.id
	) {
		return pickBanEvents;
	}

	const currentStep = PickBan.resolveCurrentStep({
		eventCount: pickBanEvents.length,
		preSet: match.roundMaps.customFlow.preSet,
		postGame: match.roundMaps.customFlow.postGame,
		resultsCount: results.length,
	});
	if (currentStep?.action !== "ROLL") return pickBanEvents;

	const teamOne = teamFullById(match.opponentOne.id);
	const teamTwo = teamFullById(match.opponentTwo.id);
	if (!teamOne || !teamTwo) return pickBanEvents;

	const rollExecuted = await executeRoll({
		matchId,
		maps: match.roundMaps,
		pickBanEvents,
		results,
		teams: [teamOne, teamTwo],
		toSetMapPool: tournament.organizerPickedMapPool,
	});
	if (!rollExecuted) return pickBanEvents;

	return TournamentRepository.findPickBanEventsByMatchId(match.id);
}

async function cachedNoScreen(match: LoaderMatch, matchId: number) {
	if (!match.opponentOne?.id || !match.opponentTwo?.id) return null;

	return cachified({
		key: `no-screen-mid-${matchId}-${match.opponentOne.id}-${match.opponentTwo.id}`,
		cache,
		// avoid preferences from other test runs leaking in
		ttl: IS_E2E_TEST_RUN ? -1 : ttl(IN_MILLISECONDS.TWO_DAYS),
		async getFreshValue() {
			return UserRepository.anyUserPrefersNoScreen(
				match.players.map((p) => p.id),
			);
		},
	});
}

async function matchMapList({
	tournament,
	tournamentId,
	match,
	matchId,
	matchIsOver,
	results,
	pickBanEvents,
	teamFullById,
}: {
	tournament: Tournament;
	tournamentId: number;
	match: LoaderMatch;
	matchId: number;
	matchIsOver: boolean;
	results: Awaited<
		ReturnType<typeof TournamentMatchRepository.findResultsByMatchId>
	>;
	pickBanEvents: Awaited<
		ReturnType<typeof TournamentRepository.findPickBanEventsByMatchId>
	>;
	teamFullById: TeamFullById;
}) {
	if (!match.opponentOne?.id || !match.opponentTwo?.id) return null;
	if (matchIsOver) return mapListFromResults(results);

	return resolveMapList({
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
	});
}

function canJoinMatchRoom({
	tournament,
	match,
	user,
	isParticipant,
	matchIsOver,
	schedulePhase,
}: {
	tournament: Tournament;
	match: LoaderMatch;
	user: { id: number } | undefined;
	isParticipant: boolean;
	matchIsOver: boolean;
	schedulePhase: LeagueScheduling.Phase;
}) {
	return (
		!matchIsOver &&
		match.opponentOne?.id != null &&
		match.opponentTwo?.id != null &&
		(isParticipant || tournament.isOrganizerOrStreamer(user)) &&
		(schedulePhase === "CLOSED" || schedulePhase === "SCHEDULED")
	);
}

async function viewerWeaponPoolIds(
	user: { id: number } | undefined,
	isParticipant: boolean,
) {
	if (!user || !isParticipant) return null;

	return (await MatchProfileRepository.findWeaponPoolByUserId(user.id)).map(
		(weapon) => weapon.weaponSplId,
	);
}

function bracketContext({
	tournament,
	bracket,
	bracketIdx,
	match,
}: {
	tournament: Tournament;
	bracket: Bracket | null;
	bracketIdx: number | null;
	match: LoaderMatch;
}) {
	return {
		bracketIdx,
		bracketType: bracket?.type ?? null,
		collectsKos: bracket?.collectsKos ?? false,
		groupNumber:
			bracket?.data.group.find((group) => group.id === match.groupId)?.number ??
			null,
		bracketsPageGroupId:
			bracket && showsOneGroupAtATime(bracket) ? match.groupId : null,
		hasRoundRobin: tournament.bracketsMeta.some(
			(meta) => meta.type === "round_robin",
		),
		names: tournament.matchContextNamesById(match.id),
		canBeReopened: tournament.matchCanBeReopened(match.id),
	};
}

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
	const hasScheduling = bracket?.hasScheduling ?? false;
	const isPlayableAt = hasScheduling ? match.roundIsPlayableAt : null;
	const phase = LeagueScheduling.phase({
		hasScheduling,
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
		hasScheduling && (isParticipant || tournament.isOrganizerOrStreamer(user));
	const boardOpen = phase !== "CLOSED" && phase !== "NOT_OPEN";

	if (hasScheduling && user) {
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
		hasScheduling,
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

/** Team rooms are pickups only. A participant's opens with the match chat as tabs or split view, organizers read both. */
async function chatRoomInputs({
	match,
	userId,
	canChatInMatch,
	canReadTeamChats,
	teamName,
}: {
	match: Pick<
		FindMatchById,
		"chatRoomId" | "players" | "opponentOne" | "opponentTwo"
	>;
	userId: number | undefined;
	canChatInMatch: boolean;
	canReadTeamChats: boolean;
	teamName: (tournamentTeamId: number) => string | undefined;
}): Promise<RouteChatRoomInput[]> {
	if (!match.chatRoomId || !canChatInMatch) return [];

	const ownTeamId = match.players.find(
		(player) => player.id === userId,
	)?.tournamentTeamId;
	const teamIds = ownTeamId
		? [ownTeamId]
		: canReadTeamChats
			? [match.opponentOne?.id, match.opponentTwo?.id].filter(
					(id): id is number => typeof id === "number",
				)
			: [];
	const teamRooms =
		await TournamentTeamRepository.findAllChatRoomIdsByIds(teamIds);

	return [
		{ roomId: match.chatRoomId, autoOpen: true },
		...teamIds.flatMap((teamId) => {
			const teamRoom = teamRooms.find((room) => room.id === teamId);
			if (!teamRoom) return [];

			return ownTeamId
				? [{ roomId: teamRoom.chatRoomId, autoOpen: true }]
				: [
						{
							roomId: teamRoom.chatRoomId,
							autoOpen: false,
							label: teamName(teamId),
						},
					];
		}),
	];
}
