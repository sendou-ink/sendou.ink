import type { ActionFunction } from "@remix-run/node";
import { sql } from "~/db/sql";
import { requireUser } from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { notify } from "~/features/notifications/core/notify.server";
import { createSwissBracketInTransaction } from "~/features/tournament/queries/createSwissBracketInTransaction.server";
import { updateRoundMaps } from "~/features/tournament/queries/updateRoundMaps.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import * as TournamentMatchRepository from "~/features/tournament-bracket/TournamentMatchRepository.server";
import invariant from "~/utils/invariant";
import {
	errorToastIfErr,
	errorToastIfFalsy,
	parseParams,
	parseRequestPayload,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { idObject } from "~/utils/zod";
import type { PreparedMaps } from "../../../db/tables";
import { updateTeamSeeds } from "../../tournament/queries/updateTeamSeeds.server";
import { getServerTournamentManager } from "../core/brackets-manager/manager.server";
import { roundMapsFromInput } from "../core/mapList.server";
import * as Swiss from "../core/Swiss";
import type { Tournament } from "../core/Tournament";
import {
	clearTournamentDataCache,
	tournamentFromDB,
	tournamentFromDBCached,
} from "../core/Tournament.server";
import { bracketSchema } from "../tournament-bracket-schemas.server";
import {
	fillWithNullTillPowerOfTwo,
	tournamentWebsocketRoom,
} from "../tournament-bracket-utils";

export const action: ActionFunction = async ({ params, request }) => {
	const user = await requireUser(request);
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});
	const tournament = await tournamentFromDB({ tournamentId, user });
	const data = await parseRequestPayload({ request, schema: bracketSchema });
	const manager = getServerTournamentManager();

	let emitTournamentUpdate = false;
	let recalculateStartedAtForBracketIdx = null;

	switch (data._action) {
		case "START_BRACKET": {
			errorToastIfFalsy(tournament.isOrganizer(user), "Not an organizer");

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

			// for swiss bracket set in `createSwissBracketInTransaction` already
			if (bracket.type !== "swiss") {
				recalculateStartedAtForBracketIdx = data.bracketIdx;
			}

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

			const hasThirdPlaceMatch = tournament.bracketManagerSettings(
				bracket.settings,
				bracket.type,
				data.eliminationTeamCount ?? (bracket.seeding ?? []).length,
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

			const matches = Swiss.generateMatchUps({
				bracket,
				groupId: data.groupId,
			});

			errorToastIfErr(matches);

			await TournamentRepository.insertSwissMatches(matches.value);

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

			await TournamentRepository.deleteSwissMatches({
				groupId: data.groupId,
				roundId: data.roundId,
			});

			emitTournamentUpdate = true;

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

			emitTournamentUpdate = true;

			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	clearTournamentDataCache(tournamentId);

	if (typeof recalculateStartedAtForBracketIdx === "number") {
		const tournament = await tournamentFromDBCached({ tournamentId, user });
		const bracket = tournament.bracketByIdx(recalculateStartedAtForBracketIdx);
		invariant(bracket, "Bracket not found");

		await TournamentMatchRepository.markManyAsStarted(bracket.ongoingMatches());
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
