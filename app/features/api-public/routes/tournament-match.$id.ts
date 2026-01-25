import { jsonArrayFrom } from "kysely/helpers/sqlite";
import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { db } from "~/db/sql";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { resolveMapList } from "~/features/tournament-bracket/core/mapList.server";
import { tournamentFromDBCached } from "~/features/tournament-bracket/core/Tournament.server";
import { i18next } from "~/modules/i18n/i18next.server";
import { logger } from "~/utils/logger";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import { id } from "~/utils/zod";
import type { GetTournamentMatchResponse } from "../schema";

const paramsSchema = z.object({
	id,
});

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const t = await i18next.getFixedT("en", ["game-misc"]);
	const { id } = parseParams({
		params,
		schema: paramsSchema,
	});

	const match = notFoundIfFalsy(
		await db
			.selectFrom("TournamentMatch")
			.innerJoin(
				"TournamentStage",
				"TournamentStage.id",
				"TournamentMatch.stageId",
			)
			.innerJoin("Tournament", "Tournament.id", "TournamentStage.tournamentId")
			.innerJoin(
				"TournamentRound",
				"TournamentRound.id",
				"TournamentMatch.roundId",
			)
			.select(({ eb }) => [
				"TournamentStage.tournamentId",
				"TournamentMatch.id",
				"TournamentMatch.opponentOne",
				"TournamentMatch.opponentTwo",
				"Tournament.mapPickingStyle",
				"TournamentRound.maps",
				jsonArrayFrom(
					eb
						.selectFrom("TournamentMatchGameResult")
						.select(({ eb: innerEb }) => [
							"TournamentMatchGameResult.stageId",
							"TournamentMatchGameResult.mode",
							"TournamentMatchGameResult.winnerTeamId",
							"TournamentMatchGameResult.source",
							"TournamentMatchGameResult.opponentOnePoints",
							"TournamentMatchGameResult.opponentTwoPoints",
							jsonArrayFrom(
								innerEb
									.selectFrom("TournamentMatchGameResultParticipant")
									.select("TournamentMatchGameResultParticipant.userId")
									.whereRef(
										"TournamentMatchGameResultParticipant.matchGameResultId",
										"=",
										"TournamentMatchGameResult.id",
									),
							).as("participants"),
						])
						.where("TournamentMatchGameResult.matchId", "=", id)
						.orderBy("TournamentMatchGameResult.number", "asc"),
				).as("playedMapList"),
			])
			.where("TournamentMatch.id", "=", id)
			.executeTakeFirst(),
	);

	const parseSource = (
		rawSource: string,
	): NonNullable<GetTournamentMatchResponse["mapList"]>[number]["source"] => {
		const parsed = Number(rawSource);
		if (Number.isNaN(parsed)) {
			return rawSource as "DEFAULT" | "TIEBREAKER" | "BOTH";
		}

		return parsed;
	};
	const mapList = async (): Promise<GetTournamentMatchResponse["mapList"]> => {
		if (!match.opponentOne.id || !match.opponentTwo.id) {
			return null;
		}

		if (
			match.opponentOne.result === "win" ||
			match.opponentTwo.result === "win"
		) {
			return match.playedMapList.map((playedMap) => ({
				map: {
					mode: playedMap.mode,
					stage: {
						id: playedMap.stageId,
						name: t(`game-misc:STAGE_${playedMap.stageId}`),
					},
				},
				participatedUserIds: playedMap.participants.map((p) => p.userId),
				winnerTeamId: playedMap.winnerTeamId,
				source: parseSource(playedMap.source),
				points:
					playedMap.opponentOnePoints && playedMap.opponentTwoPoints
						? [playedMap.opponentOnePoints, playedMap.opponentTwoPoints]
						: null,
			}));
		}

		const pickBanEvents = match.maps?.pickBan
			? await TournamentRepository.pickBanEventsByMatchId(match.id)
			: [];

		return resolveMapList({
			tournamentId: match.tournamentId,
			matchId: id,
			teams: [match.opponentOne.id, match.opponentTwo.id],
			mapPickingStyle: match.mapPickingStyle,
			maps: match.maps,
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
		}).map((mapListMap) => {
			return {
				map: {
					mode: mapListMap.mode,
					stage: {
						id: mapListMap.stageId,
						name: t(`game-misc:STAGE_${mapListMap.stageId}`),
					},
				},
				participatedUserIds: null,
				winnerTeamId: null,
				source: mapListMap.source,
				points: null,
			};
		});
	};

	const { bracketName, roundNameWithoutMatchIdentifier } = (
		await tournamentFromDBCached({
			tournamentId: match.tournamentId,
			user: undefined,
		})
	).matchContextNamesById(id);

	const result: GetTournamentMatchResponse = {
		teamOne: match.opponentOne.id
			? {
					id: match.opponentOne.id,
					score: match.opponentOne.score ?? 0,
				}
			: null,
		teamTwo: match.opponentTwo.id
			? {
					id: match.opponentTwo.id,
					score: match.opponentTwo.score ?? 0,
				}
			: null,
		url: `https://sendou.ink/to/${match.tournamentId}/matches/${id}`,
		mapList: await mapList(),
		bracketName: bracketName ?? null,
		roundName: roundNameWithoutMatchIdentifier ?? null,
	};

	return Response.json(result);
};
