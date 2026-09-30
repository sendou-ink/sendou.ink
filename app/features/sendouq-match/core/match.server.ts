import * as R from "remeda";
import type { UserMapModePreferences } from "~/db/tables-json";
import * as MapList from "~/features/map-list-generator/core/MapList";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import {
	BANNED_MAPS,
	SENDOUQ_MAP_POOL,
} from "~/features/match-profile/banned-maps";
import * as Seasons from "~/features/mmr/core/Seasons";
import { userSkills } from "~/features/mmr/tiered.server";
import { getDefaultMapWeights } from "~/features/sendouq/core/default-maps.server";
import type {
	SQMatch,
	SQUncensoredGroup,
} from "~/features/sendouq/core/SendouQ.server";
import { SENDOUQ_BEST_OF } from "~/features/sendouq/q-constants";
import { modesShort } from "~/modules/in-game-lists/modes";
import type { ModeShort, ModeWithStage } from "~/modules/in-game-lists/types";
import type {
	TournamentMapListMap,
	TournamentMaplistSource,
} from "~/modules/tournament-map-list-generator/types";
import { logger } from "~/utils/logger";
import { averageArray } from "~/utils/number";
import type { MatchTiers } from "../SQMatchRepository.server";

type WeightsMap = Map<string, number>;

async function calculateMapWeights(
	groupOnePreferences: UserMapModePreferences[],
	groupTwoPreferences: UserMapModePreferences[],
	modesIncluded: readonly ModeShort[],
): Promise<WeightsMap> {
	const teamOneVotes: WeightsMap = new Map();
	const teamTwoVotes: WeightsMap = new Map();

	countVotesForTeam(modesIncluded, groupOnePreferences, teamOneVotes);
	countVotesForTeam(modesIncluded, groupTwoPreferences, teamTwoVotes);

	const applyWeightFormula = (voteCount: number) =>
		// 1, 4 or 9 (cap)
		Math.min(voteCount * voteCount, 9);

	const teamOneWeights: WeightsMap = new Map();
	const teamTwoWeights: WeightsMap = new Map();

	for (const [key, votes] of teamOneVotes) {
		teamOneWeights.set(key, applyWeightFormula(votes));
	}
	for (const [key, votes] of teamTwoVotes) {
		teamTwoWeights.set(key, applyWeightFormula(votes));
	}

	const combinedWeights = normalizeAndCombineWeights(
		teamOneWeights,
		teamTwoWeights,
	);

	return applyDefaultWeights(combinedWeights);
}

/** Combines two teams' map weights, first normalizing team one's to team two's total so differing preference counts weigh fairly. */
export function normalizeAndCombineWeights(
	teamOneWeights: Map<string, number>,
	teamTwoWeights: Map<string, number>,
): Map<string, number> {
	const teamOneTotal = Array.from(teamOneWeights.values()).reduce(
		(sum, w) => sum + w,
		0,
	);
	const teamTwoTotal = Array.from(teamTwoWeights.values()).reduce(
		(sum, w) => sum + w,
		0,
	);

	const combinedWeights = new Map<string, number>();
	const allKeys = new Set([...teamOneWeights.keys(), ...teamTwoWeights.keys()]);

	for (const key of allKeys) {
		const teamOneWeight = teamOneWeights.get(key) ?? 0;
		const teamTwoWeight = teamTwoWeights.get(key) ?? 0;

		if (teamOneTotal > 0 && teamTwoTotal > 0) {
			const normalizedTeamOne = (teamOneWeight / teamOneTotal) * teamTwoTotal;
			combinedWeights.set(key, normalizedTeamOne + teamTwoWeight);
		} else {
			combinedWeights.set(key, teamOneWeight + teamTwoWeight);
		}
	}

	return combinedWeights;
}

/** Adds the global default weights for map-mode combinations not already weighted, so the pool always has a baseline. */
async function applyDefaultWeights(
	combinedWeights: WeightsMap,
): Promise<WeightsMap> {
	let defaultWeights: WeightsMap;
	try {
		defaultWeights = await getDefaultMapWeights();
	} catch (err) {
		logger.error(
			`[calculateMapWeights] Failed to get default map weights: ${err}`,
		);
		defaultWeights = new Map();
	}

	for (const [key, weight] of defaultWeights) {
		if (!combinedWeights.has(key)) {
			combinedWeights.set(key, weight);
		}
	}

	return combinedWeights;
}

function countVotesForTeam(
	modesIncluded: readonly ModeShort[],
	preferences: UserMapModePreferences[],
	votesMap: WeightsMap,
) {
	for (const preference of preferences) {
		for (const poolEntry of preference.pool) {
			if (!modesIncluded.includes(poolEntry.mode)) continue;

			const avoidedMode = preference.modes.find(
				(m) => m.mode === poolEntry.mode && m.preference === "AVOID",
			);
			if (avoidedMode) continue;

			for (const stageId of poolEntry.stages) {
				if (BANNED_MAPS[poolEntry.mode].includes(stageId)) continue;

				votesMap.set(
					MapList.modeStageKey(poolEntry.mode, stageId),
					(votesMap.get(MapList.modeStageKey(poolEntry.mode, stageId)) ?? 0) +
						1,
				);
			}
		}
	}
}

export async function matchMapList(
	groupOne: {
		preferences: { userId: number; preferences: UserMapModePreferences }[];
		id: number;
	},
	groupTwo: {
		preferences: { userId: number; preferences: UserMapModePreferences }[];
		id: number;
	},
	modesIncluded: readonly ModeShort[],
): Promise<TournamentMapListMap[]> {
	const weights = await calculateMapWeights(
		groupOne.preferences.map((p) => p.preferences),
		groupTwo.preferences.map((p) => p.preferences),
		modesIncluded,
	);

	logger.info(
		`[matchMapList] Generated map weights: ${JSON.stringify(
			Array.from(weights.entries()),
		)}`,
	);

	const generator = MapList.generate({
		mapPool: new MapPool(
			SENDOUQ_MAP_POOL.stageModePairs.filter((pair) =>
				modesIncluded.includes(pair.mode),
			),
		),
		initialWeights: weights,
		skipEnsureMinimumCandidates: true,
	});
	generator.next();

	const maps = generator.next({ amount: SENDOUQ_BEST_OF }).value;

	const resolveSource = (map: ModeWithStage): TournamentMaplistSource => {
		const groupOnePrefers = groupOne.preferences.some((p) =>
			p.preferences.pool.some(
				(pool) => pool.mode === map.mode && pool.stages.includes(map.stageId),
			),
		);
		const groupTwoPrefers = groupTwo.preferences.some((p) =>
			p.preferences.pool.some(
				(pool) => pool.mode === map.mode && pool.stages.includes(map.stageId),
			),
		);

		if (groupOnePrefers && groupTwoPrefers) {
			return "BOTH";
		}
		if (groupOnePrefers) {
			return groupOne.id;
		}
		if (groupTwoPrefers) {
			return groupTwo.id;
		}

		return "DEFAULT";
	};

	const result = maps.map((map) => ({ ...map, source: resolveSource(map) }));

	if (result.some((m) => m.source === "DEFAULT")) {
		logger.info(
			`[matchMapList] Some maps were selected from DEFAULT source. groupOne: ${JSON.stringify(groupOne)}, groupTwo: ${JSON.stringify(groupTwo)}`,
		);
	}

	return result;
}

export function mapModePreferencesToModeList(
	groupOnePreferences: UserMapModePreferences["modes"][],
	groupTwoPreferences: UserMapModePreferences["modes"][],
): ModeShort[] {
	const groupOneScores = new Map<ModeShort, number>();
	const groupTwoScores = new Map<ModeShort, number>();

	for (const [i, groupPrefences] of [
		groupOnePreferences,
		groupTwoPreferences,
	].entries()) {
		for (const mode of modesShort) {
			const preferences = groupPrefences
				.flat()
				.filter((preference) => preference.mode === mode)
				.map(({ preference }) => (preference === "AVOID" ? -1 : 1));

			const average = averageArray(preferences.length > 0 ? preferences : [0]);
			const roundedAverage = Math.round(average);
			const scoresMap = i === 0 ? groupOneScores : groupTwoScores;

			scoresMap.set(mode, roundedAverage);
		}
	}

	const combinedMap = new Map<ModeShort, number>();
	for (const mode of modesShort) {
		const groupOneScore = groupOneScores.get(mode) ?? 0;
		const groupTwoScore = groupTwoScores.get(mode) ?? 0;
		const combinedScore = groupOneScore + groupTwoScore;
		combinedMap.set(mode, combinedScore);
	}

	const result = R.shuffle(modesShort).filter((mode) => {
		const score = combinedMap.get(mode)!;

		// if opinion is split, don't include
		return score > 0;
	});

	result.sort((a, b) => {
		const aScore = combinedMap.get(a)!;
		const bScore = combinedMap.get(b)!;

		if (aScore === bScore) return 0;
		return aScore > bScore ? -1 : 1;
	});

	if (result.length === 0) {
		const bestScore = Math.max(...combinedMap.values());

		const leastWorstModesResult = R.shuffle(modesShort).filter((mode) => {
			// turf war never included if not positive
			if (mode === "TW") return false;

			const score = combinedMap.get(mode)!;

			return score === bestScore;
		});

		// ok nevermind they are haters but really like turf war for some reason
		if (leastWorstModesResult.length === 0) return ["TW"];

		return leastWorstModesResult;
	}

	return result;
}

export function compareMatchToReportedScores({
	match,
	winners,
	newReporterGroupId,
	previousReporterGroupId,
}: {
	match: Pick<SQMatch, "mapList"> & {
		groupAlpha: { id: number };
		groupBravo: { id: number };
	};
	winners: ("ALPHA" | "BRAVO")[];
	newReporterGroupId: number;
	previousReporterGroupId?: number;
}) {
	if (!match.mapList.some((m) => m.reportedByUserId !== null)) {
		return "FIRST_REPORT";
	}

	const sameGroupReporting = newReporterGroupId === previousReporterGroupId;
	const differentConstant = sameGroupReporting ? "FIX_PREVIOUS" : "DIFFERENT";

	if (
		previousReporterGroupId &&
		match.mapList.filter((m) => m.winnerGroupId).length !== winners.length
	) {
		return differentConstant;
	}

	for (const [
		i,
		{ winnerGroupId: previousWinnerGroupId },
	] of match.mapList.entries()) {
		const newWinner = winners[i] ?? null;

		if (!newWinner && !previousWinnerGroupId) continue;

		if (!newWinner && previousWinnerGroupId) return differentConstant;
		if (newWinner && !previousWinnerGroupId) return differentConstant;

		const previousWinner =
			previousWinnerGroupId === match.groupAlpha.id ? "ALPHA" : "BRAVO";

		if (previousWinner !== newWinner) return differentConstant;
	}

	// same group reporting the same exact score
	if (sameGroupReporting) return "DUPLICATE";

	return "SAME";
}

/** Tiers of the two groups in a starting match and of their members, taken as it is created. */
export async function matchTiers(
	groups: SQUncensoredGroup[],
): Promise<MatchTiers> {
	const { userSkills: skills } = await userSkills(
		Seasons.currentOrPrevious()!.nth,
	);

	return {
		groups: groups.map((group) => ({
			id: group.id,
			tier: group.tier!,
			members: group.members.map((member) => {
				const skill = skills[member.id];

				return {
					userId: member.id,
					tier:
						!skill || skill.approximate ? ("CALCULATING" as const) : skill.tier,
				};
			}),
		})),
	};
}
