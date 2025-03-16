import type { TournamentRoundMaps } from "~/db/tables";
import type {
	ModeShort,
	ModeWithStage,
	StageId,
} from "~/modules/in-game-lists";
import type { TournamentMapListMap } from "~/modules/tournament-map-list-generator";
import { removeDuplicates } from "~/utils/arrays";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import { assertUnreachable } from "~/utils/types";
import { isSetOverByResults } from "../tournament-bracket-utils";
import type { TournamentDataTeam } from "./Tournament.server";

export function turnOf({
	results,
	maps,
	teams,
	mapList,
}: {
	results: Array<{ winnerTeamId: number }>;
	maps: TournamentRoundMaps;
	teams: [number, number];
	mapList?: TournamentMapListMap[] | null;
}) {
	if (!maps.pickBan) return null;
	if (!mapList) return null;

	switch (maps.pickBan) {
		case "BAN_2": {
			// typically lower seed is the "bottom team" and they pick first
			const [secondPicker, firstPicker] = teams;

			if (
				!mapList.some((map) => map.bannedByTournamentTeamId === firstPicker)
			) {
				return firstPicker;
			}

			if (
				!mapList.some((map) => map.bannedByTournamentTeamId === secondPicker)
			) {
				return secondPicker;
			}

			return null;
		}
		case "COUNTERPICK": {
			// there exists an unplayed map
			if (mapList.length > results.length) return null;

			if (
				isSetOverByResults({ count: maps.count, results, countType: maps.type })
			) {
				return null;
			}

			const latestWinner = results[results.length - 1]?.winnerTeamId;
			invariant(latestWinner, "turnOf: No winner found");

			const result = teams.find(
				(tournamentTeamId) => latestWinner !== tournamentTeamId,
			);
			invariant(result, "turnOf: No result found");

			return result;
		}
		default: {
			assertUnreachable(maps.pickBan);
		}
	}
}

export function isLegal({
	map,
	...rest
}: MapListWithStatusesArgs & { map: ModeWithStage }) {
	const pool = mapsListWithLegality(rest);

	return pool.some(
		(m) => m.mode === map.mode && m.stageId === map.stageId && m.isLegal,
	);
}

interface MapListWithStatusesArgs {
	results: Array<{ mode: ModeShort; stageId: StageId; winnerTeamId: number }>;
	maps: TournamentRoundMaps | null;
	mapList: TournamentMapListMap[] | null;
	teams: [TournamentDataTeam, TournamentDataTeam];
	pickerTeamId: number;
	tieBreakerMapPool: ModeWithStage[];
	toSetMapPool: Array<{ mode: ModeShort; stageId: StageId }>;
}
export function mapsListWithLegality(args: MapListWithStatusesArgs) {
	const mapPool = (() => {
		if (!args.maps?.pickBan) return [];
		switch (args.maps.pickBan) {
			case "BAN_2": {
				if (!args.mapList) {
					logger.warn("mapsListWithLegality: mapList is empty");
					return [];
				}
				return args.mapList;
			}
			case "COUNTERPICK": {
				if (args.toSetMapPool.length === 0) {
					const combinedPools = [
						...(args.teams[0].mapPool ?? []),
						...(args.teams[1].mapPool ?? []),
						...args.tieBreakerMapPool,
					];

					const result: ModeWithStage[] = [];
					for (const map of combinedPools) {
						if (
							!result.some(
								(m) => m.mode === map.mode && m.stageId === map.stageId,
							)
						) {
							result.push(map);
						}
					}

					return result;
				}

				return args.toSetMapPool;
			}
			default: {
				assertUnreachable(args.maps.pickBan);
			}
		}
	})();

	const modesIncluded = removeDuplicates(mapPool.map((m) => m.mode));

	const unavailableStagesSet = unavailableStages(args);
	const unavailableModesSetAll = unavailableModes(args);
	const unavailableModesSet =
		// one mode tournament
		unavailableModesSetAll.size < modesIncluded.length
			? unavailableModesSetAll
			: new Set();

	const result = mapPool.map((map) => {
		const isLegal =
			!unavailableStagesSet.has(map.stageId) &&
			!unavailableModesSet.has(map.mode);

		return { ...map, isLegal };
	});

	const everythingBanned = result.every((map) => !map.isLegal);
	if (everythingBanned) {
		return result.map((map) => ({ ...map, isLegal: true }));
	}

	return result;
}

function unavailableStages({
	results,
	mapList,
	maps,
}: {
	results: Array<{ mode: ModeShort; stageId: StageId }>;
	mapList?: TournamentMapListMap[] | null;
	maps: TournamentRoundMaps | null;
}): Set<StageId> {
	if (!maps?.pickBan) return new Set();

	switch (maps.pickBan) {
		case "BAN_2": {
			return new Set(
				mapList
					?.filter((m) => m.bannedByTournamentTeamId)
					.map((map) => map.stageId) ?? [],
			);
		}
		case "COUNTERPICK": {
			return new Set(results.map((result) => result.stageId));
		}
		default: {
			assertUnreachable(maps.pickBan);
		}
	}
}

function unavailableModes({
	results,
	pickerTeamId,
	maps,
}: {
	results: Array<{ mode: ModeShort; winnerTeamId: number }>;
	pickerTeamId: number;
	maps: TournamentRoundMaps | null;
}): Set<ModeShort> {
	if (!maps?.pickBan || maps.pickBan === "BAN_2") return new Set();

	// can't pick the same mode last won on
	const result = new Set(
		results
			.filter((result) => result.winnerTeamId === pickerTeamId)
			.slice(-1)
			.map((result) => result.mode),
	);

	return result;
}
