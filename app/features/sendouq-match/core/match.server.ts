import * as R from "remeda";
import type { ParsedMemento, UserMapModePreferences } from "~/db/tables";
import * as MapList from "~/features/map-list-generator/core/MapList";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import * as Seasons from "~/features/mmr/core/Seasons";
import { userSkills } from "~/features/mmr/tiered.server";
import { getDefaultMapWeights } from "~/features/sendouq/core/default-maps.server";
import { addSkillsToGroups } from "~/features/sendouq/core/groups.server";
import { SENDOUQ_BEST_OF } from "~/features/sendouq/q-constants";
import type { LookingGroupWithInviteCode } from "~/features/sendouq/q-types";
import {
	BANNED_MAPS,
	SENDOUQ_MAP_POOL,
} from "~/features/sendouq-settings/banned-maps";
import { modesShort } from "~/modules/in-game-lists/modes";
import type { ModeShort, ModeWithStage } from "~/modules/in-game-lists/types";
import type {
	TournamentMapListMap,
	TournamentMaplistSource,
} from "~/modules/tournament-map-list-generator/types";
import { logger } from "~/utils/logger";
import { averageArray } from "~/utils/number";
import type { MatchById } from "../queries/findMatchById.server";

type WeightsMap = Map<string, number>;

async function calculateMapWeights(
	groupOnePreferences: UserMapModePreferences[],
	groupTwoPreferences: UserMapModePreferences[],
	modesIncluded: ModeShort[],
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

/**
 * Normalizes and combines map weights from two teams.
 *
 * When both teams have weights, team one's weights are normalized to match
 * team two's total before combining. This ensures fair weighting when teams
 * have different numbers of preferences.
 *
 * @returns Combined weights map with all keys from both teams
 */
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

/**
 * Applies default map weights to combined weights for any maps not already weighted.
 *
 * Fetches global default weights and adds them to the combined weights map for any
 * map-mode combinations that don't already have weights. This ensures the pool always
 * has a baseline selection of maps.
 *
 * @returns Combined weights with defaults applied
 */
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
	modesIncluded: ModeShort[],
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
		ignoreModePreferences?: boolean;
	},
	groupTwo: {
		preferences: { userId: number; preferences: UserMapModePreferences }[];
		id: number;
		ignoreModePreferences?: boolean;
	},
): Promise<TournamentMapListMap[]> {
	const modesIncluded = mapModePreferencesToModeList(
		groupOne.ignoreModePreferences
			? []
			: groupOne.preferences.map(({ preferences }) => preferences.modes),
		groupTwo.ignoreModePreferences
			? []
			: groupTwo.preferences.map(({ preferences }) => preferences.modes),
	);

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

// xxx: delete
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
	match: MatchById;
	winners: ("ALPHA" | "BRAVO")[];
	newReporterGroupId: number;
	previousReporterGroupId?: number;
}) {
	// match has not been reported before
	if (!match.reportedByUserId) return "FIRST_REPORT";

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
			previousWinnerGroupId === match.alphaGroupId ? "ALPHA" : "BRAVO";

		if (previousWinner !== newWinner) return differentConstant;
	}

	// same group reporting the same exact score
	if (sameGroupReporting) return "DUPLICATE";

	return "SAME";
}

type CreateMatchMementoArgs = {
	own: {
		group: LookingGroupWithInviteCode;
		preferences: { userId: number; preferences: UserMapModePreferences }[];
	};
	their: {
		group: LookingGroupWithInviteCode;
		preferences: { userId: number; preferences: UserMapModePreferences }[];
	};
	mapList: TournamentMapListMap[];
};
export function createMatchMemento(
	args: CreateMatchMementoArgs,
): Omit<ParsedMemento, "mapPreferences"> {
	const skills = userSkills(Seasons.currentOrPrevious()!.nth);
	const withTiers = addSkillsToGroups({
		groups: {
			neutral: [],
			likesReceived: [args.their.group],
			own: args.own.group,
		},
		...skills,
	});

	const ownWithTier = withTiers.own;
	const theirWithTier = withTiers.likesReceived[0];

	return {
		modePreferences: modePreferencesMemento(args),
		pools: poolsMemento(args),
		users: Object.fromEntries(
			[...args.own.group.members, ...args.their.group.members].map((member) => {
				const skill = skills.userSkills[member.id];

				return [
					member.id,
					{
						plusTier: member.plusTier ?? undefined,
						skill:
							!skill || skill.approximate ? ("CALCULATING" as const) : skill,
					},
				];
			}),
		),
		groups: Object.fromEntries(
			[ownWithTier, theirWithTier].map((group) => [
				group!.id,
				{
					tier: group!.tier,
				},
			]),
		),
	};
}

function modePreferencesMemento(args: CreateMatchMementoArgs) {
	const result: NonNullable<ParsedMemento["modePreferences"]> = {};

	const modesIncluded: ModeShort[] = [];

	for (const { mode } of args.mapList) {
		if (!modesIncluded.includes(mode)) modesIncluded.push(mode);
	}

	for (const mode of modesIncluded) {
		for (const { preferences, userId } of [
			...args.own.preferences,
			...args.their.preferences,
		]) {
			const hasOnlyNeutral = preferences.modes.every((m) => !m.preference);
			if (hasOnlyNeutral) continue;

			const found = preferences.modes.find((pref) => pref.mode === mode);

			if (!result[mode]) result[mode] = [];

			result[mode].push({
				userId,
				preference: found?.preference,
			});
		}
	}

	return result;
}

function poolsMemento(args: CreateMatchMementoArgs): ParsedMemento["pools"] {
	return [...args.own.preferences, ...args.their.preferences].flatMap((p) => {
		const avoidedModes = p.preferences.modes
			.filter((m) => m.preference === "AVOID")
			.map((m) => m.mode);

		const pool = p.preferences.pool.filter(
			(pool) => !avoidedModes.includes(pool.mode),
		);

		if (pool.length === 0) return [];

		return {
			userId: p.userId,
			pool,
		};
	});
}
