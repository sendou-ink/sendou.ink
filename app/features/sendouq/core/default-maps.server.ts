import { differenceInDays } from "date-fns";
import * as MapList from "~/features/map-list-generator/core/MapList";
import * as Seasons from "~/features/mmr/core/Seasons";
import { modesShort } from "~/modules/in-game-lists/modes";
import { logger } from "~/utils/logger";
import { SENDOUQ_BEST_OF } from "../q-constants";
import * as SQGroupRepository from "../SQGroupRepository.server";

let cachedDefaults: Map<string, number> | null = null;

const ONE_WEEK_IN_DAYS = 7;
const DEFAULT_MAP_WEIGHT = -SENDOUQ_BEST_OF;
const TOP_MAPS_PER_MODE = 7;

export function clearCacheForTesting() {
	cachedDefaults = null;
}

export async function getDefaultMapWeights(): Promise<Map<string, number>> {
	const season = resolveSeasonForDefaults();
	if (!season) {
		logger.warn(
			"[getDefaultMapWeights] No season found for default map weights",
		);
		return new Map();
	}

	if (cachedDefaults) {
		return cachedDefaults;
	}

	const weights = await calculateSeasonDefaultMaps(season.nth);
	logger.info(
		`[getDefaultMapWeights] Calculated default map weights: ${JSON.stringify(Object.fromEntries(weights))}`,
	);
	cachedDefaults = weights;

	return weights;
}

function resolveSeasonForDefaults() {
	const currentSeason = Seasons.current();
	if (!currentSeason) {
		return Seasons.previous();
	}

	const daysSinceSeasonStart = differenceInDays(
		new Date(),
		currentSeason.starts,
	);
	if (daysSinceSeasonStart < ONE_WEEK_IN_DAYS) {
		return Seasons.previous();
	}

	return currentSeason;
}

async function calculateSeasonDefaultMaps(
	seasonNth: number,
): Promise<Map<string, number>> {
	const activeUsersWithPreferences =
		await SQGroupRepository.mapModePreferencesBySeasonNth(seasonNth);

	const mapModeCounts = new Map<string, number>();

	for (const row of activeUsersWithPreferences) {
		const preferences = row.mapModePreferences;
		if (!preferences?.pool) continue;

		for (const poolEntry of preferences.pool) {
			const avoidedMode = preferences.modes.find(
				(m) => m.mode === poolEntry.mode && m.preference === "AVOID",
			);
			if (avoidedMode) continue;

			for (const stageId of poolEntry.stages) {
				mapModeCounts.set(
					MapList.modeStageKey(poolEntry.mode, stageId),
					(mapModeCounts.get(MapList.modeStageKey(poolEntry.mode, stageId)) ??
						0) + 1,
				);
			}
		}
	}

	const weights = new Map<string, number>();
	for (const mode of modesShort) {
		const mapsForMode = Array.from(mapModeCounts.entries())
			.filter(([key]) => key.includes(mode))
			.sort((a, b) => b[1] - a[1])
			.slice(0, TOP_MAPS_PER_MODE);

		for (const [key] of mapsForMode) {
			weights.set(key, DEFAULT_MAP_WEIGHT);
		}
	}

	return weights;
}
