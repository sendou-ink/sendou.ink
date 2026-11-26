import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import { db } from "~/db/sql";
import * as ReplayCodes from "~/features/scanner-ingest/core/ReplayCodes";
import * as ScannerIngestRepository from "~/features/scanner-ingest/ScannerIngestRepository.server";
import { tournamentSharedCached } from "~/features/tournament-bracket/core/Tournament.server";
import { getFixedTForLanguage } from "~/modules/i18n/i18next.server";
import { parseMaplistSource } from "~/modules/tournament-map-list-generator/source";
import { jsonArrayFrom } from "~/utils/kysely.server";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import type { GetTournamentMatchesResponse } from "../schema";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const t = await getFixedTForLanguage("en", ["game-misc"]);
	const { id: tournamentId } = parseParams({ params, schema: idObject });

	const tournament = await tournamentSharedCached(tournamentId);

	const playedMaps = await db
		.selectFrom("TournamentMatchGameResult")
		.innerJoin(
			"TournamentMatch",
			"TournamentMatch.id",
			"TournamentMatchGameResult.matchId",
		)
		.innerJoin(
			"TournamentStage",
			"TournamentStage.id",
			"TournamentMatch.stageId",
		)
		.select(({ eb }) => [
			"TournamentMatchGameResult.id",
			"TournamentMatchGameResult.matchId",
			"TournamentMatchGameResult.stageId",
			"TournamentMatchGameResult.mode",
			"TournamentMatchGameResult.winnerTeamId",
			"TournamentMatchGameResult.source",
			"TournamentMatchGameResult.ko",
			jsonArrayFrom(
				eb
					.selectFrom("TournamentMatchGameResultParticipant")
					.select("TournamentMatchGameResultParticipant.userId")
					.whereRef(
						"TournamentMatchGameResultParticipant.matchGameResultId",
						"=",
						"TournamentMatchGameResult.id",
					),
			).as("participants"),
		])
		.where("TournamentStage.tournamentId", "=", tournamentId)
		.orderBy("TournamentMatchGameResult.matchId", "asc")
		.orderBy("TournamentMatchGameResult.number", "asc")
		.execute();

	const playedMapsByMatchId = R.groupBy(playedMaps, (map) => map.matchId);
	const replayCodeByMatchGameResultId = await viewableReplayCodes(tournamentId);

	const result: GetTournamentMatchesResponse = tournament.brackets.flatMap(
		(bracket, bracketIdx) => {
			if (bracket.preview) return [];

			return bracket.data.match.flatMap((match) => {
				if (!match.opponent1?.id || !match.opponent2?.id) return [];

				const teamOne = {
					id: match.opponent1.id,
					score: match.opponent1.score ?? 0,
				};
				const teamTwo = {
					id: match.opponent2.id,
					score: match.opponent2.score ?? 0,
				};

				return [
					{
						id: match.id,
						bracketIdx,
						bracketName: bracket.name,
						roundName:
							tournament.matchContextNamesById(match.id)
								.roundNameWithoutMatchIdentifier ?? null,
						teamOne,
						teamTwo,
						winnerTeamId:
							match.winnerSide === "opponent1"
								? teamOne.id
								: match.winnerSide === "opponent2"
									? teamTwo.id
									: null,
						playedMaps: (playedMapsByMatchId[match.id] ?? []).map(
							(playedMap) => ({
								map: {
									mode: playedMap.mode,
									stage: {
										id: playedMap.stageId,
										name: t(`game-misc:STAGE_${playedMap.stageId}`),
									},
								},
								participatedUserIds: playedMap.participants.map(
									(participant) => participant.userId,
								),
								winnerTeamId: playedMap.winnerTeamId,
								source: parseMaplistSource(playedMap.source),
								ko: playedMap.ko !== null ? Boolean(playedMap.ko) : null,
								replayCode:
									replayCodeByMatchGameResultId.get(playedMap.id) ?? null,
							}),
						),
						url: `https://sendou.ink/to/${tournamentId}/matches/${match.id}`,
					},
				];
			});
		},
	);

	return Response.json(result);
};

/** The earliest linked replay code per game result that still opens. */
async function viewableReplayCodes(tournamentId: number) {
	const now = new Date();
	const result = new Map<number, string>();

	for (const row of await ScannerIngestRepository.findReplayCodesByTournamentId(
		tournamentId,
	)) {
		const replayCode = row.replayCode.trim();
		if (!replayCode || result.has(row.matchGameResultId)) continue;
		if (!ReplayCodes.isViewable({ uploadedAt: row.createdAt, now })) continue;

		result.set(row.matchGameResultId, replayCode);
	}

	return result;
}
