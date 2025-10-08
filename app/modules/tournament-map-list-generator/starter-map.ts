// if one mode -> try to find common, otherwise something neither picked
// if a tie breaker -> random tiebreaker
// seed = always same

import { stageIds } from "~/modules/in-game-lists/stage-ids";
import { logger } from "~/utils/logger";
import { modesShort } from "../in-game-lists/modes";
import type { ModeWithStage } from "../in-game-lists/types";
import type { TournamentMapListMap, TournamentMaplistInput } from "./types";
import { seededRandom } from "./utils";

type StarterMapArgs = Pick<
	TournamentMaplistInput,
	"modesIncluded" | "tiebreakerMaps" | "seed" | "teams" | "recentlyPlayedMaps"
>;

export function starterMap(args: StarterMapArgs): Array<TournamentMapListMap> {
	const { shuffle } = seededRandom(args.seed);

	const isRecentlyPlayed = (map: ModeWithStage) => {
		return Boolean(
			args.recentlyPlayedMaps?.some(
				(recent) => recent.stageId === map.stageId && recent.mode === map.mode,
			),
		);
	};

	const commonMap = resolveRandomCommonMap(
		args.teams,
		shuffle,
		isRecentlyPlayed,
	);
	if (commonMap) {
		return [{ ...commonMap, source: "BOTH" }];
	}

	if (!args.tiebreakerMaps.isEmpty()) {
		const tiebreakers = shuffle(args.tiebreakerMaps.stageModePairs);
		const nonRecentTiebreaker = tiebreakers.find((tb) => !isRecentlyPlayed(tb));
		const randomTiebreaker = nonRecentTiebreaker ?? tiebreakers[0];

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
			) &&
			!isRecentlyPlayed(map)
		) {
			return [{ ...map, source: "DEFAULT" }];
		}
	}

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

	logger.warn("starterMap: fallback choice");

	return [{ ...allAvailableMaps[0], source: "DEFAULT" }];
}

function resolveRandomCommonMap(
	teams: StarterMapArgs["teams"],
	shuffle: <T>(o: T[]) => T[],
	isRecentlyPlayed: (map: ModeWithStage) => boolean,
): ModeWithStage | null {
	const teamOnePicks = shuffle(teams[0].maps.stageModePairs);
	const teamTwoPicks = shuffle(teams[1].maps.stageModePairs);

	for (const map of teamOnePicks) {
		for (const map2 of teamTwoPicks) {
			if (
				map.mode === map2.mode &&
				map.stageId === map2.stageId &&
				!isRecentlyPlayed(map)
			) {
				return map;
			}
		}
	}

	for (const map of teamOnePicks) {
		for (const map2 of teamTwoPicks) {
			if (map.mode === map2.mode && map.stageId === map2.stageId) {
				return map;
			}
		}
	}

	return null;
}
