import type { ActionFunction } from "react-router";
import { sql } from "~/db/sql";
import { TournamentMatchStatus } from "~/db/tables";
import { requireUser } from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as IngestRepository from "~/features/ingest/IngestRepository.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { endDroppedTeamMatches } from "~/features/tournament/tournament-utils.server";
import { getServerTournamentManager } from "~/features/tournament-bracket/core/brackets-manager/manager.server";
import * as PickBan from "~/features/tournament-bracket/core/PickBan";
import {
	clearTournamentDataCache,
	type TournamentDataTeam,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import { deletePickBanEvent } from "~/features/tournament-bracket/queries/deletePickBanEvent.server";
import {
	matchPageParamsSchema,
	matchSchema,
} from "~/features/tournament-bracket/tournament-bracket-schemas.server";
import {
	tournamentTeamToActiveRosterUserIds,
	tournamentWebsocketRoom,
} from "~/features/tournament-bracket/tournament-bracket-utils";
import * as TournamentMatchRepository from "~/features/tournament-match/TournamentMatchRepository.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import {
	errorToast,
	errorToastIfFalsy,
	notFoundIfFalsy,
	parseParams,
	parseRequestPayload,
} from "~/utils/remix.server";
import { errorIsSqliteUniqueConstraintFailure } from "~/utils/sql";
import { assertUnreachable } from "~/utils/types";
import { executeRoll } from "../core/executeRoll.server";
import { resolveMapList } from "../core/mapList.server";
import { deleteMatchPickBanEvents } from "../queries/deleteMatchPickBanEvents.server";
import { deleteParticipantsByMatchGameResultId } from "../queries/deleteParticipantsByMatchGameResultId.server";
import { deleteTournamentMatchGameResultById } from "../queries/deleteTournamentMatchGameResultById.server";
import { insertTournamentMatchGameResult } from "../queries/insertTournamentMatchGameResult.server";
import { insertTournamentMatchGameResultParticipant } from "../queries/insertTournamentMatchGameResultParticipant.server";
import { updateMatchGameResultPoints } from "../queries/updateMatchGameResultPoints.server";
import type { FindMatchById } from "../TournamentMatchRepository.server";
import {
	isSetOverByScore,
	matchEndedEarly,
	matchIsLocked,
	tournamentMatchWebsocketRoom,
} from "../tournament-match-utils";

export const action: ActionFunction = async ({ params, request }) => {
	const user = requireUser();
	const { mid: matchId, id: tournamentId } = parseParams({
		params,
		schema: matchPageParamsSchema,
	});
	const match = notFoundIfFalsy(
		await TournamentMatchRepository.findMatchById(matchId),
	);

	if (match.tournamentId !== tournamentId) {
		throw new Response(null, { status: 404 });
	}

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
					tournamentId,
					matchId,
					teams: [match.opponentOne.id, match.opponentTwo.id],
					mapPoolByTeamId: (teamId) =>
						tournament.teamById(teamId)?.mapPool ?? [],
					mapPickingStyle: match.mapPickingStyle,
					maps: match.roundMaps,
					tieBreakerMapPool: tournament.ctx.tieBreakerMapPool,
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

	let emitMatchUpdate = false;
	let emitTournamentUpdate = false;
	let setIsOver = false;
	let endedDroppedMatchIds: number[] = [];
	let followingMatchIds: number[] = [];

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
					data.points[0] === data.points[1] ||
					(scoreToIncrement() === 0 && data.points[0] > data.points[1]) ||
					(scoreToIncrement() === 1 && data.points[1] > data.points[0]),
				"Points are invalid (winner must have more points than loser)",
			);

			const bracket = tournament.bracketByIdx(
				tournament.matchIdToBracketIdx(match.id)!,
			)!;
			errorToastIfFalsy(
				!bracket.collectResultsWithPoints || data.points,
				"Points are required for this bracket",
			);

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

			try {
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

					if (setOver) {
						endedDroppedMatchIds = endDroppedTeamMatches({
							tournament,
							manager,
						});
					}
				})();
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
					tournamentMatchId: matchId,
					gameCount: data.position + 1,
				});
			}

			emitMatchUpdate = true;
			emitTournamentUpdate = true;
			setIsOver = setOver;

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

			const results =
				await TournamentMatchRepository.findResultsByMatchId(matchId);
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

			const pickBanEventNumbersToDelete = await (async () => {
				if (!match.roundMaps?.pickBan) return [];

				const pickBanEvents = await TournamentRepository.pickBanEventsByMatchId(
					match.id,
				);

				if (match.roundMaps.pickBan === "CUSTOM") {
					const customFlow = match.roundMaps.customFlow;
					if (!customFlow) return [];

					// event DB numbers are 1-indexed
					const threshold =
						customFlow.preSet.length +
						(results.length - 1) * customFlow.postGame.length +
						1;
					return pickBanEvents
						.filter((e) => e.number >= threshold)
						.map((e) => e.number);
				}

				const unplayedPicks = pickBanEvents
					.filter((e) => e.type === "PICK")
					.filter(
						(e) =>
							!results.some(
								(r) => r.stageId === e.stageId && r.mode === e.mode,
							),
					);
				invariant(unplayedPicks.length <= 1, "Too many unplayed picks");

				return unplayedPicks[0] ? [unplayedPicks[0].number] : [];
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

				for (const number of pickBanEventNumbersToDelete) {
					deletePickBanEvent({ matchId, number });
				}
			})();

			emitMatchUpdate = true;
			emitTournamentUpdate = true;

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
				result.matchId === matchId,
				"Result does not belong to this match",
			);
			errorToastIfFalsy(
				data.rosters[0].length === tournament.minMembersPerTeam &&
					data.rosters[1].length === tournament.minMembersPerTeam,
				"Invalid roster length",
			);

			const teamOne = tournament.teamById(match.opponentOne!.id!)!;
			const teamTwo = tournament.teamById(match.opponentTwo!.id!)!;
			errorToastIfFalsy(
				data.rosters[0].every((userId) =>
					teamOne.members.some((m) => m.userId === userId),
				) &&
					data.rosters[1].every((userId) =>
						teamTwo.members.some((m) => m.userId === userId),
					),
				"Invalid roster",
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

				if (data.points[0] === 100) {
					errorToastIfFalsy(
						result.winnerTeamId === match.opponentOne!.id,
						"KO winner must match the result winner",
					);
				} else if (data.points[1] === 100) {
					errorToastIfFalsy(
						result.winnerTeamId === match.opponentTwo!.id,
						"KO winner must match the result winner",
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
			emitTournamentUpdate = true;

			break;
		}
		case "BAN_PICK": {
			const results =
				await TournamentMatchRepository.findResultsByMatchId(matchId);

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

			const currentPickBanEvents =
				await TournamentRepository.pickBanEventsByMatchId(match.id);

			const turnOfResult = PickBan.turnOf({
				results,
				maps: match.roundMaps,
				teams: [
					{ id: match.opponentOne.id, seed: teamOne.seed },
					{ id: match.opponentTwo.id, seed: teamTwo.seed },
				],
				mapList,
				pickBanEventCount: currentPickBanEvents.length,
			});
			errorToastIfFalsy(turnOfResult, "Not time to pick/ban");
			const pickerTeamId = turnOfResult.teamId;
			const actionType = turnOfResult.action;
			errorToastIfFalsy(
				tournament.isOrganizer(user) ||
					tournament.ownedTeamByUser(user)?.id === pickerTeamId,
				"Unauthorized",
			);

			const isModeAction =
				actionType === "MODE_PICK" || actionType === "MODE_BAN";
			const isCustomStageBan =
				match.roundMaps.pickBan === "CUSTOM" && actionType === "BAN";

			const pickBanLegalityArgs = {
				results,
				maps: match.roundMaps,
				toSetMapPool:
					tournament.ctx.mapPickingStyle === "TO"
						? await TournamentRepository.findTOSetMapPoolById(tournamentId)
						: [],
				mapList,
				tieBreakerMapPool: tournament.ctx.tieBreakerMapPool,
				teams: [teamOne, teamTwo] as [TournamentDataTeam, TournamentDataTeam],
				pickerTeamId,
				pickBanEvents: currentPickBanEvents,
			};

			if (isModeAction) {
				errorToastIfFalsy(data.mode, "Mode is required for mode actions");
				errorToastIfFalsy(
					PickBan.isModeLegal({
						mode: data.mode,
						...pickBanLegalityArgs,
					}),
					"Illegal mode",
				);
			} else if (isCustomStageBan) {
				errorToastIfFalsy(
					typeof data.stageId === "number",
					"Stage is required for stage ban",
				);
				errorToastIfFalsy(
					PickBan.isStageLegal({
						stageId: data.stageId,
						...pickBanLegalityArgs,
					}),
					"Illegal stage ban",
				);
			} else {
				errorToastIfFalsy(
					typeof data.stageId === "number" && data.mode,
					"Stage and mode are required for map actions",
				);
				errorToastIfFalsy(
					PickBan.isLegal({
						map: { stageId: data.stageId, mode: data.mode },
						...pickBanLegalityArgs,
					}),
					"Illegal pick",
				);
			}

			const eventType = (() => {
				if (match.roundMaps.pickBan === "CUSTOM") return actionType;
				if (match.roundMaps.pickBan === "BAN_2") return "BAN" as const;
				return "PICK" as const;
			})();

			try {
				await TournamentRepository.addPickBanEvent({
					authorId: user.id,
					matchId: match.id,
					stageId: isModeAction ? null : data.stageId!,
					mode: isCustomStageBan ? null : (data.mode ?? null),
					number: currentPickBanEvents.length + 1,
					type: eventType,
				});
			} catch (error) {
				// another request already recorded this pick/ban in the race window,
				// let their page refresh to pick up the already-recorded event
				if (errorIsSqliteUniqueConstraintFailure(error)) {
					return null;
				}
				throw error;
			}

			// Chain roll after action for CUSTOM flow
			if (match.roundMaps.pickBan === "CUSTOM" && match.roundMaps.customFlow) {
				const updatedEvents = await TournamentRepository.pickBanEventsByMatchId(
					match.id,
				);
				await executeRoll({
					matchId: match.id,
					maps: match.roundMaps,
					pickBanEvents: updatedEvents,
					results,
					tournamentId,
					teams: [teamOne, teamTwo],
					tieBreakerMapPool: tournament.ctx.tieBreakerMapPool,
				});
			}

			emitMatchUpdate = true;

			break;
		}
		case "REOPEN_MATCH": {
			const scoreOne = match.opponentOne?.score ?? 0;
			const scoreTwo = match.opponentTwo?.score ?? 0;
			invariant(typeof scoreOne === "number", "Score one is missing");
			invariant(typeof scoreTwo === "number", "Score two is missing");

			errorToastIfFalsy(tournament.isOrganizer(user), "Not an organizer");
			errorToastIfFalsy(
				tournament.matchCanBeReopened(match.id),
				"Match can't be reopened, bracket has progressed",
			);

			const results =
				await TournamentMatchRepository.findResultsByMatchId(matchId);
			const lastResult = results[results.length - 1];

			const endedEarly = matchEndedEarly({
				opponentOne: { score: scoreOne, result: match.opponentOne?.result },
				opponentTwo: { score: scoreTwo, result: match.opponentTwo?.result },
				count: match.roundMaps.count,
				countType: match.roundMaps.type,
			});

			if (!endedEarly) {
				invariant(scoreOne !== scoreTwo, "Scores are equal");
				invariant(lastResult, "Last result is missing");

				if (lastResult.winnerTeamId === match.opponentOne?.id) {
					scores[0]--;
				} else {
					scores[1]--;
				}
			}

			logger.info(
				`Reopening match: User ID: ${user.id}; Match ID: ${match.id}; Ended early: ${endedEarly}`,
			);

			const followingMatches = tournament.followingMatches(match.id);
			const bracketFormat = tournament.bracketByIdx(
				tournament.matchIdToBracketIdx(match.id)!,
			)!.type;
			sql.transaction(() => {
				// edge case but for round robin we can just leave the match as is, lock it then unlock later to continue where they left off (should not really ever happen)
				if (bracketFormat !== "round_robin") {
					for (const followingMatch of followingMatches) {
						deleteMatchPickBanEvents(followingMatch.id);
					}
				}

				// when the set was force-ended early no extra result was inserted for
				// the forced win, so the last result is a genuinely played game and must
				// be kept to avoid desyncing the score from the results
				if (!endedEarly && lastResult) {
					deleteTournamentMatchGameResultById(lastResult.id);
				}

				manager.update.match({
					id: match.id,
					opponent1: {
						score: endedEarly ? scoreOne : scores[0],
						result: undefined,
					},
					opponent2: {
						score: endedEarly ? scoreTwo : scores[1],
						result: undefined,
					},
				});
			})();

			// the teams advanced into following matches are being pulled back out,
			// so those "waiting for teams" pages need to revalidate too
			followingMatchIds = followingMatches.map(
				(followingMatch) => followingMatch.id,
			);

			emitMatchUpdate = true;
			emitTournamentUpdate = true;

			break;
		}
		case "SET_AS_CASTED": {
			errorToastIfFalsy(
				tournament.isOrganizerOrStreamer(user),
				"Not an organizer or streamer",
			);
			errorToastIfFalsy(
				data.twitchAccount === null ||
					tournament.ctx.castTwitchAccounts?.includes(data.twitchAccount),
				"Invalid Twitch account",
			);

			await TournamentRepository.setMatchAsCasted({
				matchId: match.id,
				tournamentId: tournament.ctx.id,
				twitchAccount: data.twitchAccount,
			});

			emitTournamentUpdate = true;

			break;
		}
		case "LOCK": {
			errorToastIfFalsy(
				tournament.isOrganizerOrStreamer(user),
				"Not an organizer or streamer",
			);
			errorToastIfFalsy(
				tournament.ctx.castTwitchAccounts?.includes(data.twitchAccount),
				"Invalid Twitch account",
			);

			// can't lock if match status is not Locked or Waiting (team(s) busy with previous match), let's update their view to reflect that
			if (
				match.status !== TournamentMatchStatus.Locked &&
				match.status !== TournamentMatchStatus.Waiting
			) {
				return null;
			}

			await TournamentRepository.lockMatch({
				matchId: match.id,
				tournamentId: tournament.ctx.id,
				twitchAccount: data.twitchAccount,
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
		case "END_SET": {
			errorToastIfFalsy(tournament.isOrganizer(user), "Not an organizer");
			errorToastIfFalsy(
				match.opponentOne?.id && match.opponentTwo?.id,
				"Teams are missing",
			);
			errorToastIfFalsy(
				match.opponentOne?.result !== "win" &&
					match.opponentTwo?.result !== "win",
				"Match is already over",
			);

			// Determine winner (random if not specified)
			const winnerTeamId = (() => {
				if (data.winnerTeamId) {
					errorToastIfFalsy(
						data.winnerTeamId === match.opponentOne.id ||
							data.winnerTeamId === match.opponentTwo.id,
						"Invalid winner team id",
					);
					return data.winnerTeamId;
				}

				// Random winner: true 50/50 selection
				return Math.random() < 0.5
					? match.opponentOne.id
					: match.opponentTwo.id;
			})();

			logger.info(
				`Ending set by organizer: User ID: ${user.id}; Match ID: ${match.id}; Winner: ${winnerTeamId}; Random: ${!data.winnerTeamId}`,
			);

			sql.transaction(() => {
				manager.update.match({
					id: match.id,
					opponent1: {
						score: match.opponentOne?.score,
						result: winnerTeamId === match.opponentOne!.id ? "win" : "loss",
					},
					opponent2: {
						score: match.opponentTwo?.score,
						result: winnerTeamId === match.opponentTwo!.id ? "win" : "loss",
					},
				});

				endedDroppedMatchIds = endDroppedTeamMatches({
					tournament,
					manager,
				});
			})();

			// the set ended early so no further games will be played; trim weapons
			// reported in advance for map indexes beyond the games actually played
			const playedResults =
				await TournamentMatchRepository.findResultsByMatchId(matchId);
			await ReportedWeaponRepository.deleteExtraByTournamentMatchId({
				tournamentMatchId: matchId,
				gameCount: playedResults.length,
			});

			emitMatchUpdate = true;
			emitTournamentUpdate = true;
			setIsOver = true;

			break;
		}
		case "REPORT_WEAPON": {
			const isMemberOfATeamInTheMatch = match.players.some(
				(p) => p.id === user.id,
			);
			errorToastIfFalsy(isMemberOfATeamInTheMatch, "Unauthorized");
			errorToastIfFalsy(
				tournament.weaponReportingOpen,
				"Weapon reporting is closed",
			);

			await ReportedWeaponRepository.upsertOwnTournament({
				tournamentMatchId: matchId,
				mapIndex: data.mapIndex,
				weaponSplId: data.weaponSplId,
				createdAt: dateToDatabaseTimestamp(tournament.ctx.startTime),
			});

			break;
		}
		case "UNDO_WEAPON_REPORT": {
			const isMemberOfATeamInTheMatch = match.players.some(
				(p) => p.id === user.id,
			);
			errorToastIfFalsy(isMemberOfATeamInTheMatch, "Unauthorized");
			errorToastIfFalsy(
				tournament.weaponReportingOpen,
				"Weapon reporting is closed",
			);

			await ReportedWeaponRepository.deleteOwnByMapIndexTournament({
				tournamentMatchId: matchId,
				mapIndex: data.mapIndex,
			});

			break;
		}
		case "LINK_INGESTED_USERS": {
			const isMemberOfATeamInTheMatch = match.players.some(
				(p) => p.id === user.id,
			);
			errorToastIfFalsy(
				isMemberOfATeamInTheMatch || tournament.isOrganizer(user),
				"Unauthorized",
			);

			const ingestedWeapons =
				await IngestRepository.findIngestedWeaponsByTournamentMatchId(matchId);
			const setParticipantUserIds = new Set(
				(await TournamentMatchRepository.findResultsByMatchId(matchId)).flatMap(
					(result) =>
						result.participants.map((participant) => participant.userId),
				),
			);

			for (const link of data.links) {
				const player = match.players.find((p) => p.id === link.userId);
				errorToastIfFalsy(player, "User is not in the match");
				errorToastIfFalsy(
					setParticipantUserIds.size === 0 ||
						setParticipantUserIds.has(link.userId),
					"User did not play in the match",
				);
				errorToastIfFalsy(
					link.ingestedTeamId === null ||
						player.tournamentTeamId === link.ingestedTeamId,
					"User is not a member of the team",
				);
				errorToastIfFalsy(
					ingestedWeapons.some(
						(w) =>
							w.userId === null &&
							w.ingestedInGameName === link.ingestedInGameName &&
							w.ingestedTeamId === link.ingestedTeamId,
					),
					"Unknown ingested in-game name",
				);
			}

			for (const link of data.links) {
				try {
					await IngestRepository.linkIngestedUser({
						tournamentId,
						ingestedInGameName: link.ingestedInGameName,
						ingestedTeamId: link.ingestedTeamId,
						userId: link.userId,
					});
				} catch (error) {
					if (error instanceof IngestRepository.IngestedLinkConflictError) {
						errorToast(
							`Could not link "${link.ingestedInGameName}": the selected user already has a weapon on one of the games`,
						);
					}
					throw error;
				}
			}

			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	clearTournamentDataCache(tournamentId);

	// update RunningTournaments to make sure sidebar is not showing stale matches at the end
	// of the tournament in case the TO is not finalizing the tournament right away
	if (setIsOver) {
		const refreshedTournament = await tournamentFromDB({ tournamentId, user });
		// the teams that just advanced now populate following matches, so their
		// "waiting for teams" pages need to revalidate too
		followingMatchIds = refreshedTournament
			.followingMatches(match.id)
			.map((followingMatch) => followingMatch.id);
	}

	if (emitMatchUpdate) {
		const otherMatchIdsToRevalidate = Array.from(
			new Set([...endedDroppedMatchIds, ...followingMatchIds]),
		).filter((id) => id !== matchId);

		ChatSystemMessage.send([
			{
				room: tournamentMatchWebsocketRoom(matchId),
				type: "TOURNAMENT_MATCH_UPDATED",
				revalidateOnly: true,
			},
			...otherMatchIdsToRevalidate.map((id) => ({
				room: tournamentMatchWebsocketRoom(id),
				type: "TOURNAMENT_MATCH_UPDATED" as const,
				revalidateOnly: true as const,
			})),
		]);
	}
	if (emitTournamentUpdate) {
		ChatSystemMessage.send([
			{
				room: tournamentWebsocketRoom(tournament.ctx.id),
				type: "TOURNAMENT_UPDATED",
				revalidateOnly: true,
			},
		]);
	}

	return null;
};

function canReportTournamentScore({
	match,
	isMemberOfATeamInTheMatch,
	isOrganizer,
}: {
	match: NonNullable<FindMatchById>;
	isMemberOfATeamInTheMatch: boolean;
	isOrganizer: boolean;
}) {
	const matchIsOver =
		match.opponentOne?.result === "win" || match.opponentTwo?.result === "win";

	return !matchIsOver && (isMemberOfATeamInTheMatch || isOrganizer);
}
