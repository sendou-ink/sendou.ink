import shuffle from "just-shuffle";
import type { ParsedMemento, UserMapModePreferences } from "~/db/tables";
import {
	type DbMapPoolList,
	MapPool,
} from "~/features/map-list-generator/core/map-pool";
import { currentOrPreviousSeason } from "~/features/mmr/season";
import { userSkills } from "~/features/mmr/tiered.server";
import { BANNED_MAPS } from "~/features/sendouq-settings/banned-maps";
import type { ModeShort, StageId } from "~/modules/in-game-lists";
import { modesShort } from "~/modules/in-game-lists";
import {
	type TournamentMapListMap,
	createTournamentMapList,
} from "~/modules/tournament-map-list-generator";
import { SENDOUQ_DEFAULT_MAPS } from "~/modules/tournament-map-list-generator/constants";
import invariant from "~/utils/invariant";
import { averageArray } from "~/utils/number";
import { SENDOUQ_BEST_OF } from "../q-constants";
import type { LookingGroupWithInviteCode } from "../q-types";
import type { MatchById } from "../queries/findMatchById.server";
import { addSkillsToGroups } from "./groups.server";

export function matchMapList(
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
) {
	const modesIncluded = mapModePreferencesToModeList(
		groupOne.ignoreModePreferences
			? []
			: groupOne.preferences.map(({ preferences }) => preferences.modes),
		groupTwo.ignoreModePreferences
			? []
			: groupTwo.preferences.map(({ preferences }) => preferences.modes),
	);

	try {
		return createTournamentMapList({
			count: SENDOUQ_BEST_OF,
			seed: String(groupOne.id),
			modesIncluded,
			tiebreakerMaps: new MapPool([]),
			followModeOrder: true,
			teams: [
				{
					id: groupOne.id,
					maps: mapLottery(
						groupOne.preferences.map((p) => p.preferences),
						modesIncluded,
					),
				},
				{
					id: groupTwo.id,
					maps: mapLottery(
						groupTwo.preferences.map((p) => p.preferences),
						modesIncluded,
					),
				},
			],
		});
		// in rare cases, the map list generator can fail
		// in that case, just return a map list from our default set of maps
	} catch (e) {
		console.error(e);
		return createTournamentMapList({
			count: SENDOUQ_BEST_OF,
			seed: String(groupOne.id),
			modesIncluded,
			tiebreakerMaps: new MapPool([]),
			teams: [
				{
					id: groupOne.id,
					maps: new MapPool([]),
				},
				{
					id: groupTwo.id,
					maps: new MapPool([]),
				},
			],
		});
	}
}

const MAPS_PER_MODE = 7;

export function mapLottery(
	preferences: UserMapModePreferences[],
	modes: ModeShort[],
) {
	invariant(modes.length > 0, "mapLottery: no modes");

	const mapPoolList: DbMapPoolList = [];

	for (const mode of modes) {
		const stageIdsFromPools = shuffle(
			preferences.flatMap((preference) => {
				// if they disliked the mode don't include their maps
				// they are just saved in the DB so they can be restored later
				if (
					preference.modes.find((mp) => mp.mode === mode)?.preference ===
					"AVOID"
				) {
					return [];
				}

				return preference.pool.find((pool) => pool.mode === mode)?.stages ?? [];
			}),
		);

		const modeStageIdsForMatch: StageId[] = [];
		for (const stageId of stageIdsFromPools) {
			if (modeStageIdsForMatch.length === MAPS_PER_MODE) break;
			if (
				modeStageIdsForMatch.includes(stageId) ||
				BANNED_MAPS[mode].includes(stageId)
			) {
				continue;
			}

			modeStageIdsForMatch.push(stageId);
		}

		if (modeStageIdsForMatch.length === MAPS_PER_MODE) {
			for (const stageId of modeStageIdsForMatch) {
				mapPoolList.push({ mode, stageId });
			}
			// this should only happen if they made no map picks at all yet
			// as when everyone avoids a mode it can't appear
			// and if they select mode as neutral/prefer you need to pick 7 maps
		} else {
			mapPoolList.push(
				...SENDOUQ_DEFAULT_MAPS[mode].map((stageId) => ({ mode, stageId })),
			);
		}
	}

	return new MapPool(mapPoolList);
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

	const result = shuffle(modesShort).filter((mode) => {
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

		const leastWorstModesResult = shuffle(modesShort).filter((mode) => {
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
	const skills = userSkills(currentOrPreviousSeason(new Date())!.nth);
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
