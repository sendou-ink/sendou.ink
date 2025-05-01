import type { ActionFunction } from "@remix-run/node";
import { sql } from "~/db/sql";
import { requireUser } from "~/features/auth/core/user.server";
import {
	queryCurrentTeamRating,
	queryCurrentUserRating,
	queryCurrentUserSeedingRating,
	queryTeamPlayerRatingAverage,
} from "~/features/mmr/mmr-utils.server";
import { currentSeason } from "~/features/mmr/season";
import { refreshUserSkills } from "~/features/mmr/tiered.server";
import { notify } from "~/features/notifications/core/notify.server";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { createSwissBracketInTransaction } from "~/features/tournament/queries/createSwissBracketInTransaction.server";
import { updateRoundMaps } from "~/features/tournament/queries/updateRoundMaps.server";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import {
	errorToastIfFalsy,
	parseParams,
	parseRequestPayload,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { idObject } from "~/utils/zod";
import type { PreparedMaps } from "../../../db/tables";
import { updateTeamSeeds } from "../../tournament/queries/updateTeamSeeds.server";
import * as Swiss from "../core/Swiss";
import type { Tournament } from "../core/Tournament";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "../core/Tournament.server";
import { getServerTournamentManager } from "../core/brackets-manager/manager.server";
import { roundMapsFromInput } from "../core/mapList.server";
import { tournamentSummary } from "../core/summarizer.server";
import { addSummary } from "../queries/addSummary.server";
import { allMatchResultsByTournamentId } from "../queries/allMatchResultsByTournamentId.server";
import { bracketSchema } from "../tournament-bracket-schemas.server";
import { fillWithNullTillPowerOfTwo } from "../tournament-bracket-utils";

export const action: ActionFunction = async ({ params, request }) => {
	const user = await requireUser(request);
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});
	const tournament = await tournamentFromDB({ tournamentId, user });
	const data = await parseRequestPayload({ request, schema: bracketSchema });
	const manager = getServerTournamentManager();

	switch (data._action) {
		case "START_BRACKET": {
			errorToastIfFalsy(tournament.isOrganizer(user), "Not an organizer");

			const bracket = tournament.bracketByIdx(data.bracketIdx);
			invariant(bracket, "Bracket not found");

			const seeding = bracket.seedingForBracketCreation;
			errorToastIfFalsy(seeding, "Bracket already started");

			errorToastIfFalsy(
				bracket.canBeStarted,
				"Bracket is not ready to be started",
			);

			const groupCount = new Set(bracket.data.round.map((r) => r.group_id))
				.size;

			const settings = tournament.bracketManagerSettings(
				bracket.settings,
				bracket.type,
				seeding.length,
			);

			const maps = settings.consolationFinal
				? adjustLinkedRounds({
						maps: data.maps,
						thirdPlaceMatchLinked: data.thirdPlaceMatchLinked,
					})
				: data.maps;

			errorToastIfFalsy(
				bracket.type === "round_robin" || bracket.type === "swiss"
					? bracket.data.round.length / groupCount === maps.length
					: bracket.data.round.length === maps.length,
				"Invalid map count",
			);

			sql.transaction(() => {
				const stage =
					bracket.type === "swiss"
						? createSwissBracketInTransaction(
								Swiss.create({
									name: bracket.name,
									seeding,
									tournamentId,
									settings,
								}),
							)
						: manager.create({
								tournamentId,
								name: bracket.name,
								type: bracket.type,
								seeding:
									bracket.type === "round_robin"
										? seeding
										: fillWithNullTillPowerOfTwo(seeding),
								settings,
							});

				updateRoundMaps(
					roundMapsFromInput({
						virtualRounds: bracket.data.round,
						roundsFromDB: manager.get.stageData(stage.id).round,
						maps,
						bracket,
					}),
				);

				// ensures autoseeding is disabled
				const isAllSeedsPersisted = tournament.ctx.teams.every(
					(team) => typeof team.seed === "number",
				);
				if (!isAllSeedsPersisted) {
					updateTeamSeeds({
						tournamentId: tournament.ctx.id,
						teamIds: tournament.ctx.teams.map((team) => team.id),
					});
				}
			})();

			if (!tournament.isTest) {
				notify({
					userIds: seeding
						.filter((teamId) => typeof teamId === "number")
						.flatMap((tournamentTeamId) =>
							tournament
								.teamById(tournamentTeamId)!
								.members.map((m) => m.userId),
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

			break;
		}
		case "PREPARE_MAPS": {
			errorToastIfFalsy(tournament.isOrganizer(user), "Not an organizer");

			const bracket = tournament.bracketByIdx(data.bracketIdx);
			invariant(bracket, "Bracket not found");

			errorToastIfFalsy(
				!bracket.canBeStarted,
				"Bracket can already be started, preparing maps no longer possible",
			);
			errorToastIfFalsy(
				bracket.preview,
				"Bracket has started, preparing maps no longer possible",
			);

			const hasThirdPlaceMatch = tournament.bracketManagerSettings(
				bracket.settings,
				bracket.type,
				data.eliminationTeamCount ?? bracket.tournamentTeamIds.length,
			).consolationFinal;

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
					authorId: user.id,
					eliminationTeamCount: data.eliminationTeamCount ?? undefined,
				},
			});

			break;
		}
		case "ADVANCE_BRACKET": {
			errorToastIfFalsy(tournament.isOrganizer(user), "Not an organizer");

			const bracket = tournament.bracketByIdx(data.bracketIdx);
			errorToastIfFalsy(bracket, "Bracket not found");
			errorToastIfFalsy(
				bracket.type === "swiss",
				"Can't advance non-swiss bracket",
			);

			const matches = Swiss.generateMatchUps({
				bracket,
				groupId: data.groupId,
			});

			await TournamentRepository.insertSwissMatches(matches);

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

			await TournamentRepository.deleteSwissMatches({
				groupId: data.groupId,
				roundId: data.roundId,
			});

			break;
		}
		case "FINALIZE_TOURNAMENT": {
			errorToastIfFalsy(
				tournament.canFinalize(user),
				"Can't finalize tournament",
			);

			const _finalStandings = tournament.standings;

			const results = allMatchResultsByTournamentId(tournamentId);
			invariant(results.length > 0, "No results found");

			const season = currentSeason(tournament.ctx.startTime)?.nth;

			const seedingSkillCountsFor = tournament.skillCountsFor;
			const summary = tournamentSummary({
				teams: tournament.ctx.teams,
				finalStandings: _finalStandings,
				results,
				calculateSeasonalStats: tournament.ranked,
				queryCurrentTeamRating: (identifier) =>
					queryCurrentTeamRating({ identifier, season: season! }).rating,
				queryCurrentUserRating: (userId) =>
					queryCurrentUserRating({ userId, season: season! }).rating,
				queryTeamPlayerRatingAverage: (identifier) =>
					queryTeamPlayerRatingAverage({
						identifier,
						season: season!,
					}),
				queryCurrentSeedingRating: (userId) =>
					queryCurrentUserSeedingRating({
						userId,
						type: seedingSkillCountsFor!,
					}),
				seedingSkillCountsFor,
			});

			logger.info(
				`Inserting tournament summary. Tournament id: ${tournamentId}, mapResultDeltas.lenght: ${summary.mapResultDeltas.length}, playerResultDeltas.length ${summary.playerResultDeltas.length}, tournamentResults.length ${summary.tournamentResults.length}, skills.length ${summary.skills.length}, seedingSkills.length ${summary.seedingSkills.length}`,
			);

			if (!tournament.isTest) {
				addSummary({
					tournamentId,
					summary,
					season,
				});
			}

			if (tournament.ranked) {
				try {
					refreshUserSkills(season!);
				} catch (error) {
					logger.warn("Error refreshing user skills", error);
				}
			}

			break;
		}
		case "BRACKET_CHECK_IN": {
			const bracket = tournament.bracketByIdx(data.bracketIdx);
			invariant(bracket, "Bracket not found");

			const ownTeam = tournament.ownedTeamByUser(user);
			invariant(ownTeam, "User doesn't have owned team");

			errorToastIfFalsy(bracket.canCheckIn(user), "Not an organizer");

			await TournamentRepository.checkIn({
				bracketIdx: data.bracketIdx,
				tournamentTeamId: ownTeam.id,
			});
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
			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	clearTournamentDataCache(tournamentId);

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
