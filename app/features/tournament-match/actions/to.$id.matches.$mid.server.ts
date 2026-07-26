import type { Transaction } from "kysely";
import type { ActionFunction } from "react-router";
import { db } from "~/db/sql";
import type { DB } from "~/db/tables";
import { requireUser } from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { endDroppedTeamMatches } from "~/features/tournament/tournament-utils.server";
import * as BracketRepository from "~/features/tournament-bracket/BracketRepository.server";
import * as Engine from "~/features/tournament-bracket/core/engine";
import * as PickBan from "~/features/tournament-bracket/core/PickBan";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import {
	clearTournamentDataCache,
	type TournamentDataTeam,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
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
	errorToastIfFalsy,
	notFoundIfNullish,
	parseParams,
	parseRequestPayload,
} from "~/utils/remix.server";
import { errorIsSqliteUniqueConstraintFailure } from "~/utils/sql";
import { assertUnreachable } from "~/utils/types";
import { executeRoll } from "../core/executeRoll.server";
import { resolveMapList } from "../core/mapList.server";
import type { FindMatchById } from "../TournamentMatchRepository.server";
import {
	matchIsLocked,
	tournamentMatchWebsocketRoom,
} from "../tournament-match-utils";

export const action: ActionFunction = async ({ params, request }) => {
	const user = requireUser();
	const { mid: matchId, id: tournamentId } = parseParams({
		params,
		schema: matchPageParamsSchema,
	});
	const match = notFoundIfNullish(
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
			tournament.matchStatusById(match.id) !== "PENDING",
			"Match is locked, waiting for teams to finish their previous matches",
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

			const bracket = tournament.bracketByIdx(
				tournament.matchIdToBracketIdx(match.id)!,
			)!;
			errorToastIfFalsy(
				!bracket.collectsKos || typeof data.ko === "boolean",
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

			try {
				const { result: reported, endedMatchIds } =
					await executeBracketOperation({
						tournamentId,
						tournament,
						operation: (bracketData) =>
							Engine.reportGameResult(bracketData, {
								matchId: match.id,
								winnerTeamId: data.winnerTeamId,
							}),
						endDroppedTeams: (result) => result.setOver,
						inTransaction: async (_result, trx) => {
							const result = await TournamentMatchRepository.insertResult(
								{
									matchId: match.id,
									mode: currentMap.mode,
									stageId: currentMap.stageId,
									reporterId: user.id,
									winnerTeamId: data.winnerTeamId,
									number: data.position + 1,
									source: String(currentMap.source),
									ko: bracket.collectsKos ? Number(Boolean(data.ko)) : null,
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
				endedDroppedMatchIds = endedMatchIds;
				setIsOver = reported.setOver;
			} catch (error) {
				// another request already reported this game in the race window,
				// let their page refresh to pick up the already-recorded result
				if (errorIsSqliteUniqueConstraintFailure(error)) {
					return null;
				}
				throw error;
			}

			if (setIsOver) {
				// the set ended, so weapons reported in advance for map indexes
				// beyond the games actually played are trimmed
				await ReportedWeaponRepository.deleteExtraByTournamentMatchId({
					tournamentMatchId: matchId,
					gameCount: data.position + 1,
				});
			}

			emitMatchUpdate = true;
			emitTournamentUpdate = true;

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

			await executeBracketOperation({
				tournamentId,
				tournament,
				operation: (bracketData) =>
					Engine.undoGameResult(bracketData, {
						matchId: match.id,
						lastGameWinnerTeamId: lastResult.winnerTeamId,
					}),
				endDroppedTeams: false,
				inTransaction: async (_result, trx) => {
					await TournamentMatchRepository.deleteResultById(lastResult.id, trx);

					for (const number of pickBanEventNumbersToDelete) {
						await TournamentMatchRepository.deletePickBanEvent(
							{ matchId, number },
							trx,
						);
					}
				},
			});

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

			const bracket = tournament.bracketByIdx(
				tournament.matchIdToBracketIdx(match.id)!,
			)!;
			errorToastIfFalsy(
				!bracket.collectsKos || typeof data.ko === "boolean",
				"KO status is required for this bracket",
			);

			const wasKo = Boolean(result.ko);
			if (typeof data.ko === "boolean" && data.ko !== wasKo) {
				// changing the KO status at this point could retroactively change who advanced from the group
				errorToastIfFalsy(
					tournament.matchCanBeReopened(match.id),
					"Bracket has progressed",
				);
			}

			await db.transaction().execute(async (trx) => {
				if (typeof data.ko === "boolean") {
					await TournamentMatchRepository.updateResultKo(
						{ id: result.id, ko: data.ko },
						trx,
					);
				}

				await TournamentMatchRepository.setParticipants(
					{
						resultId: result.id,
						participants: [
							...data.rosters[0].map((userId) => ({
								userId,
								tournamentTeamId: match.opponentOne!.id!,
							})),
							...data.rosters[1].map((userId) => ({
								userId,
								tournamentTeamId: match.opponentTwo!.id!,
							})),
						],
					},
					trx,
				);
			});

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
				matchId: match.id,
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
				if (match.roundMaps.pickBan === "CUSTOM") {
					// a no-mode-repeat pick is stored as a regular map pick; the
					// restriction only applies while choosing, not to the stored event
					return actionType === "PICK_NO_MODE_REPEAT"
						? ("PICK" as const)
						: actionType;
				}
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
			errorToastIfFalsy(tournament.isOrganizer(user), "Not an organizer");
			errorToastIfFalsy(
				tournament.matchCanBeReopened(match.id),
				"Match can't be reopened, bracket has progressed",
			);

			const results =
				await TournamentMatchRepository.findResultsByMatchId(matchId);
			const lastResult = results[results.length - 1];

			const followingMatches = tournament.followingMatches(match.id);
			const bracketFormat = tournament.bracketByIdx(
				tournament.matchIdToBracketIdx(match.id)!,
			)!.type;
			const { result: reopened } = await executeBracketOperation({
				tournamentId,
				tournament,
				operation: (bracketData) => Engine.reopenMatch(bracketData, match.id),
				endDroppedTeams: false,
				inTransaction: async (result, trx) => {
					// edge case but for round robin we can just leave the match as is, lock it then unlock later to continue where they left off (should not really ever happen)
					if (bracketFormat !== "round_robin") {
						for (const followingMatch of followingMatches) {
							await TournamentMatchRepository.deletePickBanEventsByMatchId(
								followingMatch.id,
								trx,
							);
						}
					}

					// when the set was force-ended early no extra result was inserted for
					// the forced win, so the last result is a genuinely played game and must
					// be kept to avoid desyncing the score from the results
					if (!result.endedEarly) {
						invariant(lastResult, "Last result is missing");
						await TournamentMatchRepository.deleteResultById(
							lastResult.id,
							trx,
						);
					}
				},
			});

			logger.info(
				`Reopening match: User ID: ${user.id}; Match ID: ${match.id}; Ended early: ${reopened.endedEarly}`,
			);

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

			// can't lock if the match can already be played, let's update their view to reflect that
			if (tournament.matchStatusById(match.id) !== "PENDING") {
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
			errorToastIfFalsy(!match.winnerSide, "Match is already over");

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

			const { endedMatchIds } = await executeBracketOperation({
				tournamentId,
				tournament,
				operation: (bracketData) =>
					Engine.endSet(bracketData, {
						matchId: match.id,
						winnerTeamId,
					}),
				endDroppedTeams: true,
			});
			endedDroppedMatchIds = endedMatchIds;

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
	return !match.winnerSide && (isMemberOfATeamInTheMatch || isOrganizer);
}

/**
 * Runs an engine operation against freshly hydrated bracket data and persists
 * the resulting match changes, all in one transaction: hydrate → operate →
 * (end dropped teams' matches) → apply changes → extra statements.
 */
async function executeBracketOperation<T extends Engine.EngineResult>({
	tournamentId,
	tournament,
	operation,
	endDroppedTeams,
	inTransaction,
}: {
	tournamentId: number;
	tournament: Tournament;
	operation: (bracketData: Engine.BracketData) => T;
	/** Whether unfinished matches of dropped out teams should be ended after the operation (resolved from its result when given a function). */
	endDroppedTeams: boolean | ((result: T) => boolean);
	/** Extra statements to run inside the same transaction, after the match changes have been applied. */
	inTransaction?: (result: T, trx: Transaction<DB>) => void | Promise<void>;
}): Promise<{ result: T; endedMatchIds: number[] }> {
	let result!: T;
	let endedMatchIds: number[] = [];

	await db.transaction().execute(async (trx) => {
		const bracketData = await BracketRepository.findByTournamentId(
			tournamentId,
			trx,
		);
		result = operation(bracketData);

		let applied: Engine.EngineResult = result;

		const shouldEndDroppedTeamMatches =
			typeof endDroppedTeams === "function"
				? endDroppedTeams(result)
				: endDroppedTeams;
		if (shouldEndDroppedTeamMatches) {
			const droppedResult = endDroppedTeamMatches({
				tournament,
				data: result.data,
			});
			endedMatchIds = droppedResult.endedMatchIds;
			applied = {
				data: droppedResult.data,
				changedMatches: [
					...result.changedMatches,
					...droppedResult.changedMatches,
				],
			};
		}

		await BracketRepository.applyMatchChanges(
			{ previousData: bracketData, result: applied },
			trx,
		);
		await inTransaction?.(result, trx);
	});

	return { result, endedMatchIds };
}
