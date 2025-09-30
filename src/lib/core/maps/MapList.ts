import { modesShort } from '$lib/constants/in-game/modes';
import type { ModeShort, ModeWithStage, StageId } from '$lib/constants/in-game/types';
import * as MapPool from '$lib/core/maps/MapPool';
import invariant from '$lib/utils/invariant';
import { err, ok } from 'neverthrow';
import * as R from 'remeda';

type ModeWithStagePreferences = Map<string, number>;

interface GenerateNext {
	/** How many maps to return? E.g. for a Bo5 set, amount should be 5 */
	amount: number;
	pattern?: string;
}

interface MaplistPattern {
	mustInclude?: ModeShort[];
	pattern: Array<'ANY' | ModeShort>;
}

export function* generate(args: {
	mapPool: MapPool.PartialMapPool;
	preferences?: ModeWithStagePreferences;
}): Generator<Array<ModeWithStage>, Array<ModeWithStage>, GenerateNext> {
	if (MapPool.isEmpty(args.mapPool)) {
		while (true) yield [];
	}

	const modes = MapPool.toModes(args.mapPool);
	const stageCounts = initializeStageCounts(args.mapPool);
	const orderedModes = modeOrders(modes);
	const stageUsageTracker = new Map<StageId, number>();
	let currentOrderIndex = 0;

	const firstArgs = yield [];
	let amount = firstArgs.amount;
	let pattern = firstArgs.pattern ? parsePattern(firstArgs.pattern).unwrapOr(null) : undefined;

	while (true) {
		const result: ModeWithStage[] = [];

		let currentModeOrder = orderedModes[currentOrderIndex % orderedModes.length];
		if (pattern) {
			currentModeOrder = modifyModeOrderByPattern(currentModeOrder, pattern, amount);
		}

		for (let i = 0; i < amount; i++) {
			const mode = currentModeOrder[i % currentModeOrder.length];
			const possibleStages = R.shuffle(args.mapPool[mode]!);

			replenishStageIds({ possibleStages, stageCounts, stageUsageTracker });
			const stageId = mostRarelySeenStage(possibleStages, stageCounts);

			result.push({ mode, stageId });
			stageCounts.set(stageId, stageCounts.get(stageId)! + 1);
			stageUsageTracker.set(stageId, currentOrderIndex);
		}

		currentOrderIndex++;
		const nextArgs = yield result;
		amount = nextArgs.amount;
		pattern = nextArgs.pattern ? parsePattern(nextArgs.pattern).unwrapOr(null) : undefined;
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

/** This function is used for controlling in which order we start reusing the stage ids */
function replenishStageIds({
	possibleStages,
	stageCounts,
	stageUsageTracker
}: {
	possibleStages: StageId[];
	stageCounts: Map<StageId, number>;
	stageUsageTracker: Map<StageId, number>;
}) {
	const allOptionsEqual = possibleStages.every(
		(stageId) => stageCounts.get(stageId) === stageCounts.get(possibleStages[0])
	);
	if (!allOptionsEqual) return;

	const relevantStageUsage = Array.from(stageUsageTracker.entries())
		.filter(([stageId]) => possibleStages.includes(stageId))
		.sort((a, b) => a[1] - b[1]);

	const stagesToReplenish: StageId[] = [];

	for (const [stageId] of relevantStageUsage) {
		stagesToReplenish.push(stageId);
		if (stagesToReplenish.length >= possibleStages.length / 2) break;
	}

	for (const stageId of stagesToReplenish) {
		stageCounts.set(stageId, (stageCounts.get(stageId) ?? 0) - 0.5);
	}
}

function mostRarelySeenStage(possibleStages: StageId[], stageCounts: Map<StageId, number>) {
	const result = possibleStages.toSorted((a, b) => stageCounts.get(a)! - stageCounts.get(b)!)[0];
	invariant(typeof result === 'number', 'Expected to find at least one stage ID');

	return result;
}

const MAX_MODE_ORDERS_ITERATIONS = 100;

function modeOrders(modes: ModeShort[]) {
	if (modes.length === 1) return [[modes[0]]] as ModeShort[][];

	const result: ModeShort[][] = [];

	const shuffledModes = R.shuffle(modes);

	for (let i = 0; i < MAX_MODE_ORDERS_ITERATIONS; i++) {
		const startingMode = shuffledModes[i % shuffledModes.length];
		const rest = R.shuffle(shuffledModes.filter((m) => m !== startingMode));

		const candidate = [startingMode, ...rest];

		if (!result.some((r) => R.isShallowEqual(r, candidate))) {
			result.push(candidate);
		}

		if (result.length === 10) break;
	}

	return result;
}

export function* generateBalanced(_args: {
	mapPool: MapPool.PartialMapPool;
	preferences: [ModeWithStagePreferences, ModeWithStagePreferences];
}) {}

function modifyModeOrderByPattern(modeOrder: ModeShort[], pattern: MaplistPattern, amount: number) {
	const result: ModeShort[] = modeOrder.filter((mode) => !pattern.pattern.includes(mode));

	if (pattern.mustInclude) {
		for (const mode of pattern.mustInclude) {
			if (!modeOrder.includes(mode)) continue;

			if (!result.slice(0, amount).includes(mode)) {
				const randomIndex = Math.floor(Math.random() * amount);
				result.splice(randomIndex, 0, mode);
			}
		}
	}

	if (pattern.pattern.every((part) => part === 'ANY')) {
		return result;
	}

	const expandedPattern = new Array(modeOrder.length)
		.fill(null)
		.map((_, i) => pattern.pattern[i % pattern.pattern.length]);

	for (const [idx, mode] of expandedPattern.entries()) {
		if (mode === 'ANY') continue;

		result.splice(idx, 0, mode);
	}

	return result;
}

const validPatternParts = new Set(['*', ...modesShort] as const);
export function parsePattern(pattern: string) {
	const mustInclude: ModeShort[] = [];
	for (const mode of modesShort) {
		if (pattern.includes(`[${mode}]`)) {
			mustInclude.push(mode);
			pattern = pattern.replaceAll(`[${mode}]`, '');
		}
	}

	for (const part of validPatternParts) {
		pattern = pattern.replaceAll(part, `${part},`);
	}

	const parts = pattern
		.split(',')
		.map((part) => part.trim())
		.filter((part) => part.length > 0);

	if (parts.some((part) => !validPatternParts.has(part as any))) {
		return err('invalid mode in pattern');
	}

	if (parts.length > 0 && parts[0] === '*' && parts.at(-1) === '*') {
		parts.pop();
	}

	return ok({
		pattern: parts.map((part) =>
			modesShort.includes(part as ModeShort) ? (part as ModeShort) : 'ANY'
		),
		mustInclude: mustInclude.length > 0 ? mustInclude : undefined
	});
}
