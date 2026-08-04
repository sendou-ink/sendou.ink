import type { ActionFunction } from "react-router";
import { db } from "~/db/sql";
import { requireUser } from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import * as Engine from "~/features/tournament-bracket/core/engine";
import { executeBracketOperation } from "~/features/tournament-bracket/core/executeBracketOperation.server";
import * as PickBan from "~/features/tournament-bracket/core/PickBan";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import {
	matchPageParamsSchema,
	matchSchema,
} from "~/features/tournament-bracket/tournament-bracket-schemas.server";
import { tournamentWebsocketRoom } from "~/features/tournament-bracket/tournament-bracket-utils";
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
import { resolveMatchMapList } from "../core/mapList.server";
import { reportScore } from "../core/reportScore.server";
import type { FindMatchById } from "../TournamentMatchRepository.server";
import { tournamentMatchWebsocketRoom } from "../tournament-match-utils";

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

	const mapList = await resolveMatchMapList({ match, tournament });

	let emitMatchUpdate = false;
	let emitTournamentUpdate = false;
	// true when nothing outside match data (scores, pick/ban events) changed, letting
	// broadcast receivers skip revalidating the tournament layout and root loaders
	let onlyMatchResultsChanged = false;
	let setIsOver = false;
	let endedDroppedMatchIds: number[] = [];
	let followingMatchIds: number[] = [];

	switch (data._action) {
		case "REPORT_SCORE": {
			const reported = await reportScore({
				match,
				tournament,
				mapList,
				user,
				position: data.position,
				winnerTeamId: data.winnerTeamId,
				ko: data.ko,
			});

			// the game was already reported, let their page refresh to pick it up
			if (!reported) return null;

			endedDroppedMatchIds = reported.endedMatchIds;
			setIsOver = reported.setOver;

			emitMatchUpdate = true;
			emitTournamentUpdate = true;
			// a set ending (or dropped teams' matches ending) changes bracket state
			// the layout ships (bracketsMeta), so only mid-set reports are scoped
			onlyMatchResultsChanged = !setIsOver && endedDroppedMatchIds.length === 0;

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
				data.roster.every((userId) => team.memberUserIds.includes(userId)),
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

				const pickBanEvents =
					await TournamentRepository.findPickBanEventsByMatchId(match.id);

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
					teamOne.memberUserIds.includes(userId),
				) &&
					data.rosters[1].every((userId) =>
						teamTwo.memberUserIds.includes(userId),
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

			invariant(
				match.opponentOne?.id && match.opponentTwo?.id,
				"Teams are missing",
			);
			const mapPools = await TournamentTeamRepository.findMapPoolsByTeamIds([
				match.opponentOne.id,
				match.opponentTwo.id,
			]);
			const teamOneCtx = tournament.teamById(match.opponentOne.id);
			const teamTwoCtx = tournament.teamById(match.opponentTwo.id);
			invariant(teamOneCtx && teamTwoCtx, "Teams are missing");
			const teamOne = {
				...teamOneCtx,
				mapPool: mapPools.get(match.opponentOne.id) ?? [],
			};
			const teamTwo = {
				...teamTwoCtx,
				mapPool: mapPools.get(match.opponentTwo.id) ?? [],
			};

			invariant(match.roundMaps, "Missing fields to pick/ban");

			const currentPickBanEvents =
				await TournamentRepository.findPickBanEventsByMatchId(match.id);

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
				teams: [teamOne, teamTwo] as [PickBan.MapPoolTeam, PickBan.MapPoolTeam],
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
				await TournamentRepository.insertPickBanEvent({
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
				const updatedEvents =
					await TournamentRepository.findPickBanEventsByMatchId(match.id);
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
			onlyMatchResultsChanged = true;

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
				createdAt: dateToDatabaseTimestamp(tournament.ctx.startsAt),
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

	const revalidateScope = onlyMatchResultsChanged
		? ("MATCH_RESULTS" as const)
		: undefined;

	if (emitMatchUpdate) {
		const otherMatchIdsToRevalidate = Array.from(
			new Set([...endedDroppedMatchIds, ...followingMatchIds]),
		).filter((id) => id !== matchId);

		ChatSystemMessage.send([
			{
				room: tournamentMatchWebsocketRoom(matchId),
				type: "TOURNAMENT_MATCH_UPDATED",
				revalidateOnly: true,
				revalidateScope,
			},
			...otherMatchIdsToRevalidate.map((id) => ({
				room: tournamentMatchWebsocketRoom(id),
				type: "TOURNAMENT_MATCH_UPDATED" as const,
				revalidateOnly: true as const,
				revalidateScope,
			})),
		]);
	}
	if (emitTournamentUpdate) {
		ChatSystemMessage.send([
			{
				room: tournamentWebsocketRoom(tournament.ctx.id),
				type: "TOURNAMENT_UPDATED",
				revalidateOnly: true,
				revalidateScope,
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
