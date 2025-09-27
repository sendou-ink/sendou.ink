import type { ModeShort, ModeWithStage, StageId } from '$lib/constants/in-game/types';
import * as MapPool from '$lib/core/maps/MapPool';
import invariant from '$lib/utils/invariant';

type ModeWithStagePreferences = Map<string, number>;

interface GenerateNext {
	/** How many maps to return? E.g. for a Bo5 set, amount should be 5 */
	amount: number;
	pattern?: string;
}

interface MaplistPattern {
	mustInclude?: ModeWithStage[];
	pattern: Array<'ANY' | ModeShort>;
}

export function* generate(args: {
	mapPool: MapPool.PartialMapPool;
	preferences?: ModeWithStagePreferences;
}): Generator<Array<ModeWithStage>, Array<ModeWithStage>, GenerateNext> {
	const modes = MapPool.toModes(args.mapPool);
	const stageCounts = initializeStageCounts(args.mapPool);

	const firstArgs = yield [];
	let amount = firstArgs.amount;
	let _pattern = firstArgs.pattern;

	while (true) {
		const result: ModeWithStage[] = [];

		for (let i = 0; i < amount; i++) {
			const mode = modes[i % modes.length];
			const possibleStages = args.mapPool[mode]!;

			const stageId = mostRarelySeenStage(possibleStages, stageCounts);

			result.push({ mode, stageId });
			stageCounts.set(stageId, stageCounts.get(stageId)! + 1);
		}

		const nextArgs = yield result;
		amount = nextArgs.amount;
		_pattern = nextArgs.pattern;
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

export function* generateBalanced(_args: {
	mapPool: MapPool.PartialMapPool;
	preferences: [ModeWithStagePreferences, ModeWithStagePreferences];
}) {}

export function parsePattern(_pattern: string): MaplistPattern {
	return {
		pattern: []
	};
}
