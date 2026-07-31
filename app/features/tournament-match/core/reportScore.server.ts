import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as Engine from "~/features/tournament-bracket/core/engine";
import { executeBracketOperation } from "~/features/tournament-bracket/core/executeBracketOperation.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { tournamentTeamToActiveRosterUserIds } from "~/features/tournament-bracket/tournament-bracket-utils";
import { serializeMaplistSource } from "~/modules/tournament-map-list-generator/source";
import type { TournamentMapListMap } from "~/modules/tournament-map-list-generator/types";
import invariant from "~/utils/invariant";
import { errorToastIfFalsy } from "~/utils/remix.server";
import { errorIsSqliteUniqueConstraintFailure, toDBBoolean } from "~/utils/sql";
import type { FindMatchById } from "../TournamentMatchRepository.server";
import * as TournamentMatchRepository from "../TournamentMatchRepository.server";
import { matchIsLocked } from "../tournament-match-utils";

export interface ReportScoreResult {
	/** Did this game end the set? */
	setOver: boolean;
	/** Matches of teams that dropped out, ended as a side effect of the bracket advancing. */
	endedMatchIds: number[];
}

/**
 * Records the winner of one game of a tournament match, advancing the bracket and
 * storing who played it. `position` is the index of the game within the set, and a
 * report for any other index is a page that has fallen behind — those return `null`
 * rather than erroring, as does a game another request recorded first.
 *
 * The reporter must be an organizer or a member of one of the two teams. Both teams
 * must have an active roster; a team with no subs has one implicitly.
 */
export async function reportScore({
	match,
	tournament,
	mapList,
	user,
	position,
	winnerTeamId,
	ko,
}: {
	match: FindMatchById;
	tournament: Tournament;
	mapList: TournamentMapListMap[] | null;
	user: { id: number };
	position: number;
	winnerTeamId: number;
	ko?: boolean | null;
}): Promise<ReportScoreResult | null> {
	const scores: [number, number] = [
		match.opponentOne?.score ?? 0,
		match.opponentTwo?.score ?? 0,
	];

	// they are trying to report score that was already reported
	// assume that it was already reported and make their page refresh
	if (position !== scores[0] + scores[1]) {
		return null;
	}

	errorToastIfFalsy(
		tournament.matchStatusById(match.id) !== "PENDING",
		"Match is locked, waiting for teams to finish their previous matches",
	);
	errorToastIfFalsy(
		canReportScore({ match, tournament, user }),
		"Unauthorized",
	);
	errorToastIfFalsy(
		match.opponentOne?.id === winnerTeamId ||
			match.opponentTwo?.id === winnerTeamId,
		"Winner team id is invalid",
	);
	errorToastIfFalsy(
		match.opponentOne && match.opponentTwo,
		"Teams are missing",
	);
	errorToastIfFalsy(
		!matchIsLocked({ matchId: match.id, tournament, scores }),
		"Match is locked",
	);

	const currentMap = mapList?.filter((map) => !map.bannedByTournamentTeamId)[
		position
	];
	invariant(currentMap, "Can't resolve current map");

	const bracket = tournament.bracketByIdx(
		tournament.matchIdToBracketIdx(match.id)!,
	)!;
	errorToastIfFalsy(
		!bracket.collectsKos || typeof ko === "boolean",
		"KO status is required for this bracket",
	);

	const teamOneRoster = tournamentTeamToActiveRosterUserIds(
		tournament.teamById(match.opponentOne.id!)!,
		tournament.minMembersPerTeam,
	);
	const teamTwoRoster = tournamentTeamToActiveRosterUserIds(
		tournament.teamById(match.opponentTwo.id!)!,
		tournament.minMembersPerTeam,
	);

	errorToastIfFalsy(teamOneRoster, "Team one has no active roster");
	errorToastIfFalsy(teamTwoRoster, "Team two has no active roster");

	errorToastIfFalsy(
		new Set([...teamOneRoster, ...teamTwoRoster]).size ===
			tournament.minMembersPerTeam * 2,
		"Duplicate user in rosters",
	);

	let setOver: boolean;
	let endedMatchIds: number[];
	try {
		const operated = await executeBracketOperation({
			tournamentId: tournament.ctx.id,
			tournament,
			operation: (bracketData) =>
				Engine.reportGameResult(bracketData, {
					matchId: match.id,
					winnerTeamId,
				}),
			endDroppedTeams: (result) => result.setOver,
			inTransaction: async (_result, trx) => {
				const result = await TournamentMatchRepository.insertResult(
					{
						matchId: match.id,
						mode: currentMap.mode,
						stageId: currentMap.stageId,
						reporterId: user.id,
						winnerTeamId,
						number: position + 1,
						source: serializeMaplistSource(currentMap.source),
						ko: bracket.collectsKos ? toDBBoolean(Boolean(ko)) : null,
					},
					trx,
				);

				await TournamentMatchRepository.setParticipants(
					{
						resultId: result.id,
						participants: [
							...teamOneRoster.map((userId) => ({
								userId,
								tournamentTeamId: match.opponentOne!.id!,
							})),
							...teamTwoRoster.map((userId) => ({
								userId,
								tournamentTeamId: match.opponentTwo!.id!,
							})),
						],
					},
					trx,
				);
			},
		});

		setOver = operated.result.setOver;
		endedMatchIds = operated.endedMatchIds;
	} catch (error) {
		// another request already reported this game in the race window,
		// let their page refresh to pick up the already-recorded result
		if (errorIsSqliteUniqueConstraintFailure(error)) {
			return null;
		}
		throw error;
	}

	if (setOver) {
		// the set ended, so weapons reported in advance for map indexes
		// beyond the games actually played are trimmed
		await ReportedWeaponRepository.deleteExtraByTournamentMatchId({
			tournamentMatchId: match.id,
			gameCount: position + 1,
		});
	}

	return { setOver, endedMatchIds };
}

function canReportScore({
	match,
	tournament,
	user,
}: {
	match: FindMatchById;
	tournament: Tournament;
	user: { id: number };
}) {
	if (match.winnerSide) return false;

	return (
		match.players.some((player) => player.id === user.id) ||
		tournament.isOrganizer(user)
	);
}
