// a map both teams picked, else one from the pool neither picked, played longest ago; seeded

import { logger } from "~/utils/logger";
import { seededRandom } from "~/utils/random";
import type { ModeWithStage } from "../in-game-lists/types";
import { leastRecentlyPlayed } from "./recently-played";
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

	const leastRecent = <T extends ModeWithStage>(maps: T[]) =>
		leastRecentlyPlayed(maps, args.recentlyPlayedMaps);

	const commonMap = resolveRandomCommonMap(
		args.teams,
		seededShuffle,
		leastRecent,
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

	const randomMap = leastRecent(neitherPicked);
	if (randomMap) {
		return [{ ...randomMap, source: "RANDOM" }];
	}

	logger.warn(
		`starterMap: fallback choice, both teams together picked every pool map. Team IDs: ${args.teams.map((t) => t.id).join(", ")}`,
	);

	const fallbackMap = leastRecent(poolMaps);

	return fallbackMap ? [{ ...fallbackMap, source: "RANDOM" }] : [];
}

function resolveRandomCommonMap(
	teams: StarterMapArgs["teams"],
	shuffle: <T>(o: T[]) => T[],
	leastRecent: (maps: ModeWithStage[]) => ModeWithStage | undefined,
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

	return leastRecent(commonMaps) ?? null;
}
