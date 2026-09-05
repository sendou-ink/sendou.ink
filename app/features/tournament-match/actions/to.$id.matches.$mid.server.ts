import type { ActionFunction } from "react-router";
import { db } from "~/db/sql";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import * as Engine from "~/features/tournament-bracket/core/engine";
import { executeBracketOperation } from "~/features/tournament-bracket/core/executeBracketOperation.server";
import * as PickBan from "~/features/tournament-bracket/core/PickBan";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import {
	clearTournamentDataCache,
	requireTournamentOrganizer,
	tournamentFromDB,
	tournamentFromParams,
} from "~/features/tournament-bracket/core/Tournament.server";
import {
	matchPageParamsSchema,
	matchSchema,
} from "~/features/tournament-bracket/tournament-bracket-schemas";
import {
	showsOneGroupAtATime,
	tournamentBracketChannel,
	tournamentChannel,
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
import { noDuplicates } from "~/utils/schema";
import { errorIsSqliteUniqueConstraintFailure } from "~/utils/sql";
import { assertUnreachable } from "~/utils/types";
import { executeRoll } from "../core/executeRoll.server";
import { resolveMatchMapList } from "../core/mapList.server";
import { reportScore } from "../core/reportScore.server";
import type { FindMatchById } from "../TournamentMatchRepository.server";
import { tournamentMatchChannel } from "../tournament-match-utils";

export const action: ActionFunction = async ({ params, request }) => {
	const { tournament, tournamentId, user } = await tournamentFromParams(
		params,
		{ for: "action" },
	);
	const { mid: matchId } = parseParams({
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
	// lets broadcast receivers skip revalidating the tournament layout and root loaders
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
			// a set ending (or dropped teams' matches ending) changes the layout's bracketsMeta
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
				noDuplicates(data.roster) &&
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
			requireTournamentOrganizer(tournament, user);
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
					// the no-mode-repeat restriction only applies while choosing, not to the stored event
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
				// another request already recorded this pick/ban, let their page refresh to pick it up
				if (errorIsSqliteUniqueConstraintFailure(error)) {
					return null;
				}
				throw error;
			}

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
			requireTournamentOrganizer(tournament, user);
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
					// round robin edge case: leave the match as is, lock it and unlock later to continue (should not really ever happen)
					if (bracketFormat !== "round_robin") {
						for (const followingMatch of followingMatches) {
							await TournamentMatchRepository.deletePickBanEventsByMatchId(
								followingMatch.id,
								trx,
							);
						}
					}

					// a force-ended set inserted no result for the forced win, so its last result is a
					// played game that must stay or the score desyncs from the results
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

			// teams pulled back out of following matches: their "waiting for teams" pages revalidate too
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
			requireTournamentOrganizer(tournament, user);
			errorToastIfFalsy(
				match.opponentOne?.id && match.opponentTwo?.id,
				"Teams are missing",
			);
			errorToastIfFalsy(!match.winnerSide, "Match is already over");

			const winnerTeamId = (() => {
				if (data.winnerTeamId) {
					errorToastIfFalsy(
						data.winnerTeamId === match.opponentOne.id ||
							data.winnerTeamId === match.opponentTwo.id,
						"Invalid winner team id",
					);
					return data.winnerTeamId;
				}

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

			// no further games: trim weapons reported in advance for maps beyond the games played
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

	// refresh RunningTournaments so the sidebar doesn't show stale matches while the TO delays finalizing
	if (setIsOver) {
		const refreshedTournament = await tournamentFromDB(tournamentId);
		// teams just advanced into following matches: their "waiting for teams" pages revalidate too
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
				channel: tournamentMatchChannel(matchId),
				revalidateScope,
			},
			...otherMatchIdsToRevalidate.map((id) => ({
				channel: tournamentMatchChannel(id),
				revalidateScope,
			})),
		]);
	}
	if (emitTournamentUpdate) {
		ChatSystemMessage.send([
			{
				channel: onlyMatchResultsChanged
					? matchResultsRoom(tournament, match)
					: tournamentChannel(tournament.ctx.id),
				revalidateScope,
			},
		]);
	}

	return null;
};

/** Room of the brackets page views rendering this match; the whole tournament's room if its bracket can't be resolved. */
function matchResultsRoom(
	tournament: Tournament,
	match: NonNullable<FindMatchById>,
) {
	const bracketIdx = tournament.matchIdToBracketIdx(match.id);

	if (typeof bracketIdx !== "number") {
		logger.error("matchResultsRoom: Bracket not found");
		return tournamentChannel(tournament.ctx.id);
	}

	const { type } = tournament.ctx.settings.bracketProgression[bracketIdx];

	return tournamentBracketChannel({
		tournamentId: tournament.ctx.id,
		bracketIdx,
		groupId: showsOneGroupAtATime(type) ? match.groupId : null,
	});
}

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
