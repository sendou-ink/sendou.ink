import type { ModeShort, ModeWithStage, StageId } from '$lib/constants/in-game/types';
import * as MapPool from '$lib/core/maps/MapPool';
import invariant from '$lib/utils/invariant';

type ModeWithStagePreferences = Map<string, number>;

interface GenerateInputCommon {
	mapPool: MapPool.PartialMapPool;

	// TODO: these should be arguments of the "next" function
	/** How many maps to return? E.g. for a Bo5 set, amount should be 5 */
	amount: number;
	pattern?: string;
}

interface GenerateInput extends GenerateInputCommon {
	/** What maps to prefer? Value can be either positive which means it is preferred or negative which means it should be avoided */
	preferences?: ModeWithStagePreferences;
}

interface GenerateBalancedInput extends GenerateInputCommon {
	preferences: [ModeWithStagePreferences, ModeWithStagePreferences];
}

interface MaplistPattern {
	mustInclude?: ModeWithStage[];
	pattern: Array<'ANY' | ModeShort>;
}

export function* generate(
	args: GenerateInput
): Generator<Array<ModeWithStage>, Array<ModeWithStage>, unknown> {
	const modes = MapPool.toModes(args.mapPool);
	const stageCounts = initializeStageCounts(args.mapPool);

	while (true) {
		const result: ModeWithStage[] = [];

		for (let i = 0; i < args.amount; i++) {
			const mode = modes[i % modes.length];
			const possibleStages = args.mapPool[mode]!;

			const stageId = mostRarelySeenStage(possibleStages, stageCounts);

			result.push({ mode, stageId });
			stageCounts.set(stageId, stageCounts.get(stageId)! + 1);
		}

		yield result;
	}
}

function initializeStageCounts(mapPool: MapPool.PartialMapPool) {
	const counts = new Map<StageId, number>();
	const stageIds = MapPool.toStageIds(mapPool);

	for (const stageId of stageIds) {
		counts.set(stageId, 0);
	}

	return counts;
}

function mostRarelySeenStage(possibleStages: StageId[], stageCounts: Map<StageId, number>) {
	const result = possibleStages.toSorted((a, b) => stageCounts.get(a)! - stageCounts.get(b)!)[0];
	invariant(typeof result === 'number', 'Expected to find at least one stage ID');

	return result;
}

export function* generateBalanced(_args: GenerateBalancedInput) {}

export function parsePattern(_pattern: string): MaplistPattern {
	return {
		pattern: []
	};
}
