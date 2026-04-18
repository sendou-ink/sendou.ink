import type { TFunction } from "i18next";
import * as R from "remeda";
import type { TournamentRoundMaps } from "~/db/tables";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import type { TournamentDataTeam } from "~/features/tournament-bracket/core/Tournament.server";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type { TournamentMaplistSource } from "~/modules/tournament-map-list-generator/types";
import { logger } from "~/utils/logger";
import { seededRandom } from "~/utils/random";

export const tournamentMatchWebsocketRoom = (matchId: number) =>
	`match__${matchId}`;

const NUM_MAP = {
	"1": ["1", "2", "4"],
	"2": ["2", "1", "3", "5"],
	"3": ["3", "2", "6"],
	"4": ["4", "1", "5", "7"],
	"5": ["5", "2", "4", "6", "8"],
	"6": ["6", "3", "5", "9"],
	"7": ["7", "4", "8"],
	"8": ["8", "7", "5", "9", "0"],
	"9": ["9", "6", "8"],
	"0": ["0", "8"],
};
/**
 * Generates a deterministic 4-digit Splatoon private battle room password based on the provided seed.
 *
 * Given the same seed, this function will always return the same password.
 */
export function resolveRoomPass(seed: number | string) {
	let pass = "5";
	for (let i = 0; i < 3; i++) {
		const { seededShuffle } = seededRandom(`${seed}-${i}`);

		const key = pass[i] as keyof typeof NUM_MAP;
		const opts = NUM_MAP[key];
		const next = seededShuffle(opts)[0];
		pass += next;
	}

	// prevent 5555 since many use it as a default pass
	// making it a bit more common guess
	if (pass === "5555") return "5800";

	return pass;
}

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
	const scoreSum = scores.reduce((acc, curr) => acc + curr, 0);

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
	const winCounts = new Map<number, number>();

	for (const result of results) {
		const count = winCounts.get(result.winnerTeamId) ?? 0;
		winCounts.set(result.winnerTeamId, count + 1);
	}

	if (countType === "PLAY_ALL") {
		return R.sum(Array.from(winCounts.values())) === count;
	}

	const maxWins = Math.max(...Array.from(winCounts.values()));

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
