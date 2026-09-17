// a map both teams picked, else one from the pool neither picked; seeded

import { logger } from "~/utils/logger";
import { seededRandom } from "~/utils/random";
import type { ModeWithStage } from "../in-game-lists/types";
import type { TournamentMapListMap, TournamentMaplistInput } from "./types";

type StarterMapArgs = Pick<
	TournamentMaplistInput,
	| "modesIncluded"
	| "pool"
	| "seed"
	| "teams"
	| "recentlyPlayedMaps"
	| "modeOrder"
>;

export function starterMap(args: StarterMapArgs): Array<TournamentMapListMap> {
	const { seededShuffle } = seededRandom(args.seed);

	const fixedMode = args.modeOrder?.[0] ?? null;
	const isAllowedMode = (map: ModeWithStage) =>
		args.modesIncluded.includes(map.mode) &&
		(fixedMode === null || map.mode === fixedMode);

	const isRecentlyPlayed = (map: ModeWithStage) => {
		return Boolean(
			args.recentlyPlayedMaps?.some(
				(recent) => recent.stageId === map.stageId && recent.mode === map.mode,
			),
		);
	};

	const commonMap = resolveRandomCommonMap(
		args.teams,
		seededShuffle,
		isRecentlyPlayed,
		isAllowedMode,
	);
	if (commonMap) {
		return [{ ...commonMap, source: "BOTH" }];
	}

	const poolMaps = seededShuffle(
		args.pool.stageModePairs.filter(isAllowedMode),
	);
	const pickedByATeam = (map: ModeWithStage) =>
		args.teams.some((team) => team.maps.has(map));

	const neitherPicked = poolMaps.filter((map) => !pickedByATeam(map));

	const randomMap =
		neitherPicked.find((map) => !isRecentlyPlayed(map)) ?? neitherPicked[0];
	if (randomMap) {
		return [{ ...randomMap, source: "RANDOM" }];
	}

	logger.warn(
		`starterMap: fallback choice, both teams together picked every pool map. Team IDs: ${args.teams.map((t) => t.id).join(", ")}`,
	);

	const fallbackMap =
		poolMaps.find((map) => !isRecentlyPlayed(map)) ?? poolMaps[0];

	return fallbackMap ? [{ ...fallbackMap, source: "RANDOM" }] : [];
}

function resolveRandomCommonMap(
	teams: StarterMapArgs["teams"],
	shuffle: <T>(o: T[]) => T[],
	isRecentlyPlayed: (map: ModeWithStage) => boolean,
	isAllowedMode: (map: ModeWithStage) => boolean,
): ModeWithStage | null {
	const teamOnePicks = shuffle(teams[0].maps.stageModePairs);
	const teamTwoPicks = shuffle(teams[1].maps.stageModePairs);

	const commonMaps = teamOnePicks.filter(
		(map) =>
			isAllowedMode(map) &&
			teamTwoPicks.some(
				(map2) => map.mode === map2.mode && map.stageId === map2.stageId,
			),
	);

	return (
		commonMaps.find((map) => !isRecentlyPlayed(map)) ?? commonMaps[0] ?? null
	);
}
