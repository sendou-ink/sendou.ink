import type { ActionFunction } from "@remix-run/node";
import { nanoid } from "nanoid";
import { sql } from "~/db/sql";
import { requireUser } from "~/features/auth/core/user.server";
import * as TournamentMatchRepository from "~/features/tournament-bracket/TournamentMatchRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { canReportTournamentScore } from "~/permissions";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import {
	errorToastIfFalsy,
	notFoundIfFalsy,
	parseParams,
	parseRequestPayload,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import * as PickBan from "../core/PickBan";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "../core/Tournament.server";
import { getServerTournamentManager } from "../core/brackets-manager/manager.server";
import { emitter } from "../core/emitters.server";
import { resolveMapList } from "../core/mapList.server";
import { deleteMatchPickBanEvents } from "../queries/deleteMatchPickBanEvents.server";
import { deleteParticipantsByMatchGameResultId } from "../queries/deleteParticipantsByMatchGameResultId.server";
import { deletePickBanEvent } from "../queries/deletePickBanEvent.server";
import { deleteTournamentMatchGameResultById } from "../queries/deleteTournamentMatchGameResultById.server";
import { findMatchById } from "../queries/findMatchById.server";
import { findResultsByMatchId } from "../queries/findResultsByMatchId.server";
import { insertTournamentMatchGameResult } from "../queries/insertTournamentMatchGameResult.server";
import { insertTournamentMatchGameResultParticipant } from "../queries/insertTournamentMatchGameResultParticipant.server";
import { updateMatchGameResultPoints } from "../queries/updateMatchGameResultPoints.server";
import {
	matchPageParamsSchema,
	matchSchema,
} from "../tournament-bracket-schemas.server";
import {
	bracketSubscriptionKey,
	isSetOverByScore,
	matchIsLocked,
	matchSubscriptionKey,
	tournamentTeamToActiveRosterUserIds,
} from "../tournament-bracket-utils";

export const action: ActionFunction = async ({ params, request }) => {
	const user = await requireUser(request);
	const { mid: matchId, id: tournamentId } = parseParams({
		params,
		schema: matchPageParamsSchema,
	});
	const match = notFoundIfFalsy(findMatchById(matchId));
	const data = await parseRequestPayload({
		request,
		schema: matchSchema,
	});

	const tournament = await tournamentFromDB({ tournamentId, user });

	const validateCanReportScore = () => {
		const isMemberOfATeamInTheMatch = match.players.some(
			(p) => p.id === user?.id,
		);

		errorToastIfFalsy(
			canReportTournamentScore({
				match,
				isMemberOfATeamInTheMatch,
				isOrganizer: tournament.isOrganizer(user),
			}),
			"Unauthorized",
		);
	};

	const manager = getServerTournamentManager();

	const scores: [number, number] = [
		match.opponentOne?.score ?? 0,
		match.opponentTwo?.score ?? 0,
	];

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

	let emitMatchUpdate = false;
	let emitBracketUpdate = false;
	switch (data._action) {
		case "REPORT_SCORE": {
			// they are trying to report score that was already reported
			// assume that it was already reported and make their page refresh
			if (data.position !== scores[0] + scores[1]) {
				return null;
			}

			validateCanReportScore();
			errorToastIfFalsy(
				match.opponentOne?.id === data.winnerTeamId ||
					match.opponentTwo?.id === data.winnerTeamId,
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

			const currentMap = mapList?.filter((m) => !m.bannedByTournamentTeamId)[
				data.position
			];
			invariant(currentMap, "Can't resolve current map");

			const scoreToIncrement = () => {
				if (data.winnerTeamId === match.opponentOne?.id) return 0;
				if (data.winnerTeamId === match.opponentTwo?.id) return 1;

				errorToastIfFalsy(false, "Winner team id is invalid");
			};

			errorToastIfFalsy(
				!data.points ||
					(scoreToIncrement() === 0 && data.points[0] > data.points[1]) ||
					(scoreToIncrement() === 1 && data.points[1] > data.points[0]),
				"Points are invalid (winner must have more points than loser)",
			);

			// TODO: could also validate that if bracket demands it then points are defined

			scores[scoreToIncrement()]++;

			const setOver = isSetOverByScore({
				count: match.roundMaps?.count ?? match.bestOf,
				countType: match.roundMaps?.type ?? "BEST_OF",
				scores,
			});

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

			sql.transaction(() => {
				manager.update.match({
					id: match.id,
					opponent1: {
						score: scores[0],
						result: setOver && scores[0] > scores[1] ? "win" : undefined,
					},
					opponent2: {
						score: scores[1],
						result: setOver && scores[1] > scores[0] ? "win" : undefined,
					},
				});

				const result = insertTournamentMatchGameResult({
					matchId: match.id,
					mode: currentMap.mode,
					stageId: currentMap.stageId,
					reporterId: user.id,
					winnerTeamId: data.winnerTeamId,
					number: data.position + 1,
					source: String(currentMap.source),
					opponentOnePoints: data.points?.[0] ?? null,
					opponentTwoPoints: data.points?.[1] ?? null,
				});

				for (const userId of teamOneRoster) {
					insertTournamentMatchGameResultParticipant({
						matchGameResultId: result.id,
						userId,
						tournamentTeamId: match.opponentOne!.id!,
					});
				}
				for (const userId of teamTwoRoster) {
					insertTournamentMatchGameResultParticipant({
						matchGameResultId: result.id,
						userId,
						tournamentTeamId: match.opponentTwo!.id!,
					});
				}
			})();

			emitMatchUpdate = true;
			emitBracketUpdate = true;

			break;
		}
		case "SET_ACTIVE_ROSTER": {
			errorToastIfFalsy(!tournament.everyBracketOver, "Tournament is over");
			errorToastIfFalsy(
				tournament.isOrganizer(user) ||
					tournament.teamMemberOfByUser(user)?.id === data.teamId,
				"Unauthorized",
			);
			errorToastIfFalsy(
				data.roster.length === tournament.minMembersPerTeam,
				"Invalid roster length",
			);

			const team = tournament.teamById(data.teamId)!;
			errorToastIfFalsy(
				data.roster.every((userId) =>
					team.members.some((m) => m.userId === userId),
				),
				"Invalid roster",
			);

			await TournamentTeamRepository.setActiveRoster({
				teamId: data.teamId,
				activeRosterUserIds: data.roster,
			});

			emitMatchUpdate = true;

			break;
		}
		case "UNDO_REPORT_SCORE": {
			validateCanReportScore();
			// they are trying to remove score from the past
			if (data.position !== scores[0] + scores[1] - 1) {
				return null;
			}

			const results = findResultsByMatchId(matchId);
			const lastResult = results[results.length - 1];
			invariant(lastResult, "Last result is missing");

			const shouldReset = results.length === 1;

			if (lastResult.winnerTeamId === match.opponentOne?.id) {
				scores[0]--;
			} else {
				scores[1]--;
			}

			logger.info(
				`Undoing score: Position: ${data.position}; User ID: ${user.id}; Match ID: ${match.id}`,
			);

			const pickBanEventToDeleteNumber = await (async () => {
				if (!match.roundMaps?.pickBan) return;

				const pickBanEvents = await TournamentRepository.pickBanEventsByMatchId(
					match.id,
				);

				const unplayedPicks = pickBanEvents
					.filter((e) => e.type === "PICK")
					.filter(
						(e) =>
							!results.some(
								(r) => r.stageId === e.stageId && r.mode === e.mode,
							),
					);
				invariant(unplayedPicks.length <= 1, "Too many unplayed picks");

				return unplayedPicks[0]?.number;
			})();

			sql.transaction(() => {
				deleteTournamentMatchGameResultById(lastResult.id);

				manager.update.match({
					id: match.id,
					opponent1: {
						score: shouldReset ? undefined : scores[0],
					},
					opponent2: {
						score: shouldReset ? undefined : scores[1],
					},
				});

				if (shouldReset) {
					manager.reset.matchResults(match.id);
				}

				if (typeof pickBanEventToDeleteNumber === "number") {
					deletePickBanEvent({ matchId, number: pickBanEventToDeleteNumber });
				}
			})();

			emitMatchUpdate = true;
			emitBracketUpdate = true;

			break;
		}
		case "UPDATE_REPORTED_SCORE": {
			errorToastIfFalsy(tournament.isOrganizer(user), "Not an organizer");
			errorToastIfFalsy(!tournament.ctx.isFinalized, "Tournament is finalized");

			const result = await TournamentMatchRepository.findResultById(
				data.resultId,
			);
			errorToastIfFalsy(result, "Result not found");
			errorToastIfFalsy(
				data.rosters[0].length === tournament.minMembersPerTeam &&
					data.rosters[1].length === tournament.minMembersPerTeam,
				"Invalid roster length",
			);

			const hadPoints = typeof result.opponentOnePoints === "number";
			const willHavePoints = typeof data.points?.[0] === "number";
			errorToastIfFalsy(
				(hadPoints && willHavePoints) || (!hadPoints && !willHavePoints),
				"Points mismatch",
			);

			if (data.points) {
				if (data.points[0] !== result.opponentOnePoints) {
					// changing points at this point could retroactively change who advanced from the group
					errorToastIfFalsy(
						tournament.matchCanBeReopened(match.id),
						"Bracket has progressed",
					);
				}

				if (result.opponentOnePoints! > result.opponentTwoPoints!) {
					errorToastIfFalsy(
						data.points[0] > data.points[1],
						"Winner must have more points than loser",
					);
				} else {
					errorToastIfFalsy(
						data.points[0] < data.points[1],
						"Winner must have more points than loser",
					);
				}
			}

			sql.transaction(() => {
				if (data.points) {
					updateMatchGameResultPoints({
						matchGameResultId: result.id,
						opponentOnePoints: data.points[0],
						opponentTwoPoints: data.points[1],
					});
				}

				deleteParticipantsByMatchGameResultId(result.id);

				for (const userId of data.rosters[0]) {
					insertTournamentMatchGameResultParticipant({
						matchGameResultId: result.id,
						userId,
						tournamentTeamId: match.opponentOne!.id!,
					});
				}
				for (const userId of data.rosters[1]) {
					insertTournamentMatchGameResultParticipant({
						matchGameResultId: result.id,
						userId,
						tournamentTeamId: match.opponentTwo!.id!,
					});
				}
			})();

			emitMatchUpdate = true;
			emitBracketUpdate = true;

			break;
		}
		case "BAN_PICK": {
			const results = findResultsByMatchId(matchId);

			const teamOne = match.opponentOne?.id
				? tournament.teamById(match.opponentOne.id)
				: undefined;
			const teamTwo = match.opponentTwo?.id
				? tournament.teamById(match.opponentTwo.id)
				: undefined;
			invariant(teamOne && teamTwo, "Teams are missing");

			invariant(
				match.roundMaps && match.opponentOne?.id && match.opponentTwo?.id,
				"Missing fields to pick/ban",
			);
			const pickerTeamId = PickBan.turnOf({
				results,
				maps: match.roundMaps,
				teams: [match.opponentOne.id, match.opponentTwo.id],
				mapList,
			});
			errorToastIfFalsy(pickerTeamId, "Not time to pick/ban");
			errorToastIfFalsy(
				tournament.isOrganizer(user) ||
					tournament.ownedTeamByUser(user)?.id === pickerTeamId,
				"Unauthorized",
			);

			errorToastIfFalsy(
				PickBan.isLegal({
					results,
					map: data,
					maps: match.roundMaps,
					toSetMapPool:
						tournament.ctx.mapPickingStyle === "TO"
							? await TournamentRepository.findTOSetMapPoolById(tournamentId)
							: [],
					mapList,
					tieBreakerMapPool: tournament.ctx.tieBreakerMapPool,
					teams: [teamOne, teamTwo],
					pickerTeamId,
				}),
				"Illegal pick",
			);

			const pickBanEvents = await TournamentRepository.pickBanEventsByMatchId(
				match.id,
			);
			await TournamentRepository.addPickBanEvent({
				authorId: user.id,
				matchId: match.id,
				stageId: data.stageId,
				mode: data.mode,
				number: pickBanEvents.length + 1,
				type: match.roundMaps.pickBan === "BAN_2" ? "BAN" : "PICK",
			});

			emitMatchUpdate = true;

			break;
		}
		case "REOPEN_MATCH": {
			const scoreOne = match.opponentOne?.score ?? 0;
			const scoreTwo = match.opponentTwo?.score ?? 0;
			invariant(typeof scoreOne === "number", "Score one is missing");
			invariant(typeof scoreTwo === "number", "Score two is missing");
			invariant(scoreOne !== scoreTwo, "Scores are equal");

			errorToastIfFalsy(tournament.isOrganizer(user), "Not an organizer");
			errorToastIfFalsy(
				tournament.matchCanBeReopened(match.id),
				"Match can't be reopened, bracket has progressed",
			);

			const results = findResultsByMatchId(matchId);
			const lastResult = results[results.length - 1];
			invariant(lastResult, "Last result is missing");

			if (scoreOne > scoreTwo) {
				scores[0]--;
			} else {
				scores[1]--;
			}

			logger.info(
				`Reopening match: User ID: ${user.id}; Match ID: ${match.id}`,
			);

			const followingMatches = tournament.followingMatches(match.id);
			sql.transaction(() => {
				for (const match of followingMatches) {
					deleteMatchPickBanEvents({ matchId: match.id });
				}
				deleteTournamentMatchGameResultById(lastResult.id);
				manager.update.match({
					id: match.id,
					opponent1: {
						score: scores[0],
						result: undefined,
					},
					opponent2: {
						score: scores[1],
						result: undefined,
					},
				});
			})();

			emitMatchUpdate = true;
			emitBracketUpdate = true;

			break;
		}
		case "SET_AS_CASTED": {
			errorToastIfFalsy(
				tournament.isOrganizerOrStreamer(user),
				"Not an organizer or streamer",
			);

			await TournamentRepository.setMatchAsCasted({
				matchId: match.id,
				tournamentId: tournament.ctx.id,
				twitchAccount: data.twitchAccount,
			});

			emitBracketUpdate = true;

			break;
		}
		case "LOCK": {
			errorToastIfFalsy(
				tournament.isOrganizerOrStreamer(user),
				"Not an organizer or streamer",
			);

			// can't lock, let's update their view to reflect that
			if (match.opponentOne?.id && match.opponentTwo?.id) {
				return null;
			}

			await TournamentRepository.lockMatch({
				matchId: match.id,
				tournamentId: tournament.ctx.id,
			});

			emitMatchUpdate = true;

			break;
		}
		case "UNLOCK": {
			errorToastIfFalsy(
				tournament.isOrganizerOrStreamer(user),
				"Not an organizer or streamer",
			);

			await TournamentRepository.unlockMatch({
				matchId: match.id,
				tournamentId: tournament.ctx.id,
			});

			emitMatchUpdate = true;

			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	if (emitMatchUpdate) {
		emitter.emit(matchSubscriptionKey(match.id), {
			eventId: nanoid(),
			userId: user.id,
		});
	}
	if (emitBracketUpdate) {
		emitter.emit(bracketSubscriptionKey(tournament.ctx.id), {
			matchId: match.id,
			scores,
			isOver:
				scores[0] === Math.ceil(match.bestOf / 2) ||
				scores[1] === Math.ceil(match.bestOf / 2),
		});
	}

	clearTournamentDataCache(tournamentId);

	return null;
};
