import type { ActionFunction } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { notify } from "~/features/notifications/core/notify.server";
import {
	calculateTournamentTierFromTeams,
	MIN_TEAMS_FOR_TIERING,
} from "~/features/tournament/core/tiering";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import {
	errorToastIfErr,
	errorToastIfFalsy,
	parseParams,
	parseRequestPayload,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { idObject } from "~/utils/zod";
import type { PreparedMaps } from "../../../db/tables";
import * as BracketRepository from "../BracketRepository.server";
import * as AbDivisions from "../core/AbDivisions";
import * as Engine from "../core/engine";
import * as PreparedMapsUtils from "../core/PreparedMaps";
import type { Tournament } from "../core/Tournament";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "../core/Tournament.server";
import { bracketSchema } from "../tournament-bracket-schemas.server";
import { tournamentWebsocketRoom } from "../tournament-bracket-utils";

export const action: ActionFunction = async ({ params, request }) => {
	const user = requireUser();
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});
	const tournament = await tournamentFromDB({ tournamentId, user });
	const data = await parseRequestPayload({ request, schema: bracketSchema });

	let emitTournamentUpdate = false;

	switch (data._action) {
		case "START_BRACKET": {
			errorToastIfFalsy(tournament.isOrganizer(user), "Not an organizer");
			errorToastIfFalsy(
				!tournament.isDraft,
				"Tournament must be opened before starting a bracket",
			);

			const bracket = tournament.bracketByIdx(data.bracketIdx);
			invariant(bracket, "Bracket not found");

			const seeding = bracket.seeding;
			errorToastIfFalsy(seeding, "Bracket already started");

			errorToastIfFalsy(
				bracket.canBeStarted,
				"Bracket is not ready to be started",
			);

			const groupCount = new Set(bracket.data.round.map((r) => r.group_id))
				.size;

			const hasThirdPlaceMatch = Engine.hasThirdPlaceMatch({
				type: bracket.type,
				settings: bracket.settings,
				participantsCount: seeding.length,
			});

			const maps = hasThirdPlaceMatch
				? adjustLinkedRounds({
						maps: data.maps,
						thirdPlaceMatchLinked: data.thirdPlaceMatchLinked,
					})
				: data.maps;

			const abDivisions =
				bracket.type === "round_robin" && bracket.settings?.hasAbDivisions
					? abDivisionsForSeeding(seeding, tournament, groupCount)
					: undefined;

			// in rr/swiss every group shares one map list per round number, and
			// groups can have different round counts when teams divide unevenly,
			// so compare against the number of distinct round numbers
			const distinctRoundNumberCount = new Set(
				bracket.data.round.map((round) => round.number),
			).size;

			errorToastIfFalsy(
				bracket.type === "round_robin" || bracket.type === "swiss"
					? distinctRoundNumberCount === maps.length
					: bracket.data.round.length === maps.length,
				"Invalid map count",
			);

			const createdBracket = Engine.create({
				// xxx: will we really need tournamentId here?
				tournamentId,
				// xxx: will we really need name?
				name: bracket.name,
				type: bracket.type,
				seeding,
				settings: bracket.settings,
				independentRounds: tournament.isLeagueDivision,
				abDivisions,
				maps,
			});

			await BracketRepository.insertBracket({
				tournamentId,
				bracket: createdBracket,
			});

			// persist maps as prepared even if they weren't initially so sibling brackets can reuse them
			const existingPreparedMaps =
				await TournamentRepository.findPreparedMapsById(tournamentId);
			if (!existingPreparedMaps?.[data.bracketIdx]) {
				await TournamentRepository.upsertPreparedMaps({
					bracketIdx: data.bracketIdx,
					tournamentId,
					maps: {
						maps,
						eliminationTeamCount:
							bracket.type === "single_elimination" ||
							bracket.type === "double_elimination"
								? PreparedMapsUtils.eliminationTeamCountOptions(
										seeding.length,
									)[0].max
								: undefined,
					},
				});
			}

			// ensures autoseeding is disabled
			const isAllSeedsPersisted = tournament.ctx.teams.every(
				(team) => typeof team.seed === "number",
			);
			if (!isAllSeedsPersisted) {
				await TournamentRepository.updateTeamSeeds({
					tournamentId: tournament.ctx.id,
					teamIds: tournament.ctx.teams.map((team) => team.id),
					teamsWithMembers: tournament.ctx.teams.map((team) => ({
						teamId: team.id,
						members: team.members.map((m) => ({
							userId: m.userId,
							username: m.username,
						})),
					})),
				});
			}

			if (data.bracketIdx === 0 && seeding.length >= MIN_TEAMS_FOR_TIERING) {
				const checkedInTeams = tournament.ctx.teams
					.filter((team) => seeding.includes(team.id))
					.map((team) => ({ avgOrdinal: team.avgSeedingSkillOrdinal }));

				const { tierNumber } = calculateTournamentTierFromTeams(
					checkedInTeams,
					seeding.length,
				);

				if (tierNumber !== null) {
					await TournamentRepository.updateTournamentTier({
						tournamentId: tournament.ctx.id,
						tier: tierNumber,
					});
				}
			}

			if (!tournament.isTest && !tournament.isDraft) {
				notify({
					userIds: seeding.flatMap((tournamentTeamId) =>
						tournament.teamById(tournamentTeamId)!.members.map((m) => m.userId),
					),
					notification: {
						type: "TO_BRACKET_STARTED",
						meta: {
							tournamentId,
							bracketIdx: data.bracketIdx,
							bracketName: bracket.name,
							tournamentName: tournament.ctx.name,
						},
					},
				});
			}

			// update RunningTournaments
			await tournamentFromDB({ tournamentId, user });

			emitTournamentUpdate = true;

			break;
		}
		case "PREPARE_MAPS": {
			errorToastIfFalsy(tournament.isOrganizer(user), "Not an organizer");

			const bracket = tournament.bracketByIdx(data.bracketIdx);
			invariant(bracket, "Bracket not found");

			errorToastIfFalsy(
				bracket.preview,
				"Bracket has started, preparing maps no longer possible",
			);

			const hasThirdPlaceMatch = Engine.hasThirdPlaceMatch({
				type: bracket.type,
				settings: bracket.settings,
				participantsCount:
					data.eliminationTeamCount ?? (bracket.seeding ?? []).length,
			});

			await TournamentRepository.upsertPreparedMaps({
				bracketIdx: data.bracketIdx,
				tournamentId,
				maps: {
					maps: hasThirdPlaceMatch
						? adjustLinkedRounds({
								maps: data.maps,
								thirdPlaceMatchLinked: data.thirdPlaceMatchLinked,
							})
						: data.maps,
					eliminationTeamCount: data.eliminationTeamCount ?? undefined,
				},
			});

			break;
		}
		case "ADVANCE_BRACKET": {
			errorToastIfFalsy(tournament.isOrganizer(user), "Not an organizer");

			const bracket = tournament.bracketByIdx(data.bracketIdx);
			errorToastIfFalsy(bracket, "Bracket not found");

			const round = Engine.generateRound(bracket.data, {
				groupId: data.groupId,
				standings: bracket.standings,
				settings: bracket.settings,
			});

			errorToastIfErr(round);

			const stageId = bracket.data.match.find(
				(match) => match.group_id === data.groupId,
			)?.stage_id;
			errorToastIfFalsy(stageId, "No matches found for group");

			await BracketRepository.insertRoundMatches({
				stageId,
				round: round.value,
			});

			emitTournamentUpdate = true;

			break;
		}
		case "UNADVANCE_BRACKET": {
			errorToastIfFalsy(tournament.isOrganizer(user), "Not an organizer");

			const bracket = tournament.bracketByIdx(data.bracketIdx);
			errorToastIfFalsy(bracket, "Bracket not found");
			errorToastIfFalsy(
				bracket.type === "swiss",
				"Can't unadvance non-swiss bracket",
			);
			errorToastIfFalsyNoFollowUpBrackets(tournament);

			await BracketRepository.deleteRoundMatches({
				groupId: data.groupId,
				roundId: data.roundId,
			});

			emitTournamentUpdate = true;

			break;
		}
		case "BRACKET_CHECK_IN": {
			const bracket = tournament.bracketByIdx(data.bracketIdx);
			invariant(bracket, "Bracket not found");

			const teamMemberOf = tournament.teamMemberOfByUser(user);
			invariant(teamMemberOf, "User is not in a team");

			errorToastIfFalsy(bracket.canCheckIn(user), "Not an organizer");

			logger.info(
				`Checking in (bracket try): tournament team id: ${teamMemberOf.id} - user id: ${user.id} - tournament id: ${tournament.ctx.id} - bracket idx: ${data.bracketIdx}`,
			);

			await TournamentTeamRepository.checkIn(teamMemberOf.id, {
				bracketIdx: data.bracketIdx,
			});

			logger.info(
				`Checking in (bracket success): tournament team id: ${teamMemberOf.id} - user id: ${user.id} - tournament id: ${tournament.ctx.id} - bracket idx: ${data.bracketIdx}`,
			);
			break;
		}
		case "OVERRIDE_BRACKET_PROGRESSION": {
			errorToastIfFalsy(tournament.isOrganizer(user), "Not an organizer");

			const allDestinationBrackets = Progression.destinationsFromBracketIdx(
				data.sourceBracketIdx,
				tournament.ctx.settings.bracketProgression,
			);
			errorToastIfFalsy(
				data.destinationBracketIdx === -1 ||
					allDestinationBrackets.includes(data.destinationBracketIdx),
				"Invalid destination bracket",
			);
			errorToastIfFalsy(
				allDestinationBrackets.every(
					(bracketIdx) => tournament.bracketByIdx(bracketIdx)!.preview,
				),
				"Can't override progression if follow-up brackets are started",
			);

			await TournamentRepository.overrideTeamBracketProgression({
				tournamentTeamId: data.tournamentTeamId,
				sourceBracketIdx: data.sourceBracketIdx,
				destinationBracketIdx: data.destinationBracketIdx,
				tournamentId,
			});

			emitTournamentUpdate = true;

			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	clearTournamentDataCache(tournamentId);

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

function errorToastIfFalsyNoFollowUpBrackets(tournament: Tournament) {
	const followUpBrackets = tournament.brackets.filter((b) =>
		b.sources?.some((source) => source.bracketIdx === 0),
	);

	errorToastIfFalsy(
		followUpBrackets.every((b) => b.preview),
		"Follow-up brackets are already started",
	);
}

function abDivisionsForSeeding(
	seeding: number[],
	tournament: Tournament,
	groupCount: number,
): (0 | 1)[] {
	const abDivisionsBySeedOrder = seeding.map((teamId) => {
		const team = tournament.teamById(teamId);
		errorToastIfFalsy(team, "Team not found when building A/B divisions");
		return team.abDivision;
	});

	const result = AbDivisions.validate({ abDivisionsBySeedOrder, groupCount });
	errorToastIfErr(result);

	return result.value;
}

function adjustLinkedRounds({
	maps,
	thirdPlaceMatchLinked,
}: {
	maps: Omit<PreparedMaps, "createdAt">["maps"];
	thirdPlaceMatchLinked: boolean;
}): Omit<PreparedMaps, "createdAt">["maps"] {
	if (thirdPlaceMatchLinked) {
		const finalsMaps = maps
			.filter((m) => m.groupId === 0)
			.sort((a, b) => b.roundId - a.roundId)[0];
		invariant(finalsMaps, "Missing finals maps");

		return [
			...maps.filter((m) => m.groupId === 0),
			{ ...finalsMaps, groupId: 1, roundId: finalsMaps.roundId + 1 },
		];
	}

	invariant(
		maps.some((m) => m.groupId === 1),
		"Missing 3rd place match maps",
	);

	return maps;
}
