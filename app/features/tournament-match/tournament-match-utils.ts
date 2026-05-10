import type { TFunction } from "i18next";
import * as R from "remeda";
import type { TournamentRoundMaps } from "~/db/tables";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import type { TournamentDataTeam } from "~/features/tournament-bracket/core/Tournament.server";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type { TournamentMaplistSource } from "~/modules/tournament-map-list-generator/types";
import { logger } from "~/utils/logger";

export function resolveHostingTeam(
	teams: [TournamentDataTeam, TournamentDataTeam],
) {
	if (teams[0].prefersNotToHost && !teams[1].prefersNotToHost) return teams[1];
	if (!teams[0].prefersNotToHost && teams[1].prefersNotToHost) return teams[0];
	if (!teams[0].seed && !teams[1].seed) return teams[0];
	if (!teams[0].seed) return teams[1];
	if (!teams[1].seed) return teams[0];
	if (teams[0].seed < teams[1].seed) return teams[0];
	if (teams[1].seed < teams[0].seed) return teams[1];

	logger.error("resolveHostingTeam: unexpected default");
	return teams[0];
}

export function mapCountPlayedInSetWithCertainty({
	bestOf,
	scores,
}: {
	bestOf: number;
	scores: [number, number];
}) {
	const maxScore = Math.max(...scores);
	const scoreSum = R.sum(scores);

	return scoreSum + (Math.ceil(bestOf / 2) - maxScore);
}

export function matchIsLocked({
	tournament,
	matchId,
	scores,
}: {
	tournament: Tournament;
	matchId: number;
	scores: [number, number];
}) {
	if (scores[0] !== 0 || scores[1] !== 0) return false;

	const locked = tournament.ctx.castedMatchesInfo?.lockedMatches ?? [];

	return locked.some((lm) => lm.matchId === matchId);
}

export function pickInfoText({
	map,
	t,
	teams,
}: {
	map?: { stageId: StageId; mode: ModeShort; source: TournamentMaplistSource };
	t: TFunction<["tournament"]>;
	teams: [TournamentDataTeam, TournamentDataTeam];
}) {
	if (!map) return "";

	if (map.source === teams[0].id) {
		return t("tournament:pickInfo.team", { number: 1 });
	}
	if (map.source === teams[1].id) {
		return t("tournament:pickInfo.team", { number: 2 });
	}
	if (map.source === "TIEBREAKER") {
		return t("tournament:pickInfo.tiebreaker");
	}
	if (map.source === "BOTH") return t("tournament:pickInfo.both");
	if (map.source === "DEFAULT") return t("tournament:pickInfo.default");
	if (map.source === "COUNTERPICK") {
		return t("tournament:pickInfo.counterpick");
	}
	if (map.source === "ROLL") {
		return t("tournament:pickInfo.roll");
	}
	if (map.source === "TO") return "";

	logger.error(`Unknown source: ${String(map.source)}`);
	return "";
}

export function isSetOverByResults({
	results,
	count,
	countType,
}: {
	results: Array<{ winnerTeamId: number }>;
	count: number;
	countType: TournamentRoundMaps["type"];
}) {
	const winCounts = R.countBy(results, (r) => r.winnerTeamId);

	if (countType === "PLAY_ALL") {
		return R.sum(Object.values(winCounts)) === count;
	}

	const maxWins = Math.max(...Object.values(winCounts));

	// best of
	return maxWins >= Math.ceil(count / 2);
}

export function isSetOverByScore({
	scores,
	count,
	countType,
}: {
	scores: [number, number];
	count: number;
	countType: TournamentRoundMaps["type"];
}) {
	if (countType === "PLAY_ALL") {
		return R.sum(scores) === count;
	}

	const matchOverAtXWins = Math.ceil(count / 2);
	return scores[0] === matchOverAtXWins || scores[1] === matchOverAtXWins;
}

export function matchEndedEarly({
	opponentOne,
	opponentTwo,
	count,
	countType,
}: {
	opponentOne: { score?: number; result?: "win" | "loss" };
	opponentTwo: { score?: number; result?: "win" | "loss" };
	count: number;
	countType: TournamentRoundMaps["type"];
}) {
	if (opponentOne.result !== "win" && opponentTwo.result !== "win") {
		return false;
	}

	const scores: [number, number] = [
		opponentOne.score ?? 0,
		opponentTwo.score ?? 0,
	];

	return !isSetOverByScore({ scores, count, countType });
}
