// if one mode -> try to find common, otherwise something neither picked
// if a tie breaker -> random tiebreaker
// seed = always same

import { logger } from "~/utils/logger";
import {
	type TournamentMapListMap,
	type TournamentMaplistInput,
	seededRandom,
} from ".";
import { type ModeWithStage, modesShort, stageIds } from "../in-game-lists";

type StarterMapArgs = Pick<
	TournamentMaplistInput,
	"modesIncluded" | "tiebreakerMaps" | "seed" | "teams"
>;

export function starterMap(args: StarterMapArgs): Array<TournamentMapListMap> {
	const { shuffle } = seededRandom(args.seed);

	const commonMap = resolveRandomCommonMap(args.teams, shuffle);
	if (commonMap) {
		return [{ ...commonMap, source: "BOTH" }];
	}

	if (!args.tiebreakerMaps.isEmpty()) {
		const randomTiebreaker = shuffle(args.tiebreakerMaps.stageModePairs)[0];

		return [
			{
				mode: randomTiebreaker.mode,
				stageId: randomTiebreaker.stageId,
				source: "TIEBREAKER",
			},
		];
	}

	// should be only one mode here always but just in case
	// making it capable of handling many modes too
	const allAvailableMaps = shuffle(
		args.modesIncluded
			.sort((a, b) => modesShort.indexOf(a) - modesShort.indexOf(b))
			.flatMap((mode) => stageIds.map((stageId) => ({ mode, stageId }))),
	);

	for (const map of allAvailableMaps) {
		if (
			!args.teams.some((team) =>
				team.maps.stageModePairs.some(
					(teamMap) =>
						teamMap.mode === map.mode && teamMap.stageId === map.stageId,
				),
			)
		) {
			return [{ ...map, source: "DEFAULT" }];
		}
	}

	logger.warn("startedMap: fallback choice");

	return [{ ...allAvailableMaps[0], source: "DEFAULT" }];
}

function resolveRandomCommonMap(
	teams: StarterMapArgs["teams"],
	shuffle: <T>(o: T[]) => T[],
): ModeWithStage | null {
	const teamOnePicks = shuffle(teams[0].maps.stageModePairs);
	const teamTwoPicks = shuffle(teams[1].maps.stageModePairs);

	for (const map of teamOnePicks) {
		for (const map2 of teamTwoPicks) {
			if (map.mode === map2.mode && map.stageId === map2.stageId) {
				return map;
			}
		}
	}

	return null;
}
