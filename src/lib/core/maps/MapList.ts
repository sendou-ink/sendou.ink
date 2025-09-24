import type { ModeWithStage } from '$lib/constants/in-game/types';
import * as MapPool from '$lib/core/maps/MapPool';

type ModeWithStagePreferences = Map<ModeWithStage, number>;

interface GenerateInputCommon {
	mapPool: MapPool.PartialMapPool;
	/** How many maps to return? E.g. for a Bo5 set, amount should be 5 */
	amount: number;
	pattern?: string;
}

interface GenerateInput extends GenerateInputCommon {
	preferences?: ModeWithStagePreferences;
}

interface GenerateBalancedInput extends GenerateInputCommon {
	preferences: [ModeWithStagePreferences, ModeWithStagePreferences];
}

export function* generate(args: GenerateInput) {
	const modes = MapPool.toModes(args.mapPool);
	let globalCounter = 0;

	while (true) {
		const result = [];
		let currModeIdx = 0;

		for (let i = 0; i < args.amount; i++) {
			const mode = modes[currModeIdx];
			const stages = args.mapPool[mode]!;

			// Calculate which stage to use for this mode based on how many times we've used this mode
			const modeUsageCount = Math.floor((globalCounter + i) / modes.length);
			const stageIndex = modeUsageCount % stages.length;

			result.push({
				mode,
				stageId: stages[stageIndex]
			});

			if (currModeIdx === modes.length - 1) {
				currModeIdx = 0;
			} else {
				currModeIdx++;
			}
		}

		globalCounter += args.amount;
		yield result;
	}
}

export function* generateBalanced(_args: GenerateBalancedInput) {}
