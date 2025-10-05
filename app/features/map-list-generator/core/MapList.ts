import { err, ok } from "neverthrow";
import * as R from "remeda";
import { modesShort } from "~/modules/in-game-lists/modes";
import type {
	ModeShort,
	ModeWithStage,
	StageId,
} from "~/modules/in-game-lists/types";
import invariant from "~/utils/invariant";
import type { MapPool } from "./map-pool";
import type { ReadonlyMapPoolObject } from "./map-pool-serializer/types";

type ModeWithStagePreferences = Map<string, number>;

interface GenerateNext {
	/** How many maps to return? E.g. for a Bo5 set, amount should be 5 */
	amount: number;
	pattern?: string;
}

interface MaplistPattern {
	mustInclude?: Array<{
		mode: ModeShort;
		isGuaranteed: boolean;
	}>;
	pattern: Array<"ANY" | ModeShort>;
}

export function* generate(args: {
	mapPool: MapPool;
	preferences?: ModeWithStagePreferences;
	/** Should the function bias in favor of maps not played? E.g. maps 4 & 5 in a Bo5 format (not every team plays them). Should be true if generating for tournament with best of format. */
	considerGuaranteed?: boolean;
}): Generator<Array<ModeWithStage>, Array<ModeWithStage>, GenerateNext> {
	if (args.mapPool.isEmpty()) {
		while (true) yield [];
	}

	const modes = args.mapPool.modes;

	const stageCounts = initializeStageCounts(modes, args.mapPool.parsed);
	const orderedModes = modeOrders(modes);
	const stageUsageTracker = new Map<StageId, number>();
	let currentOrderIndex = 0;

	const firstArgs = yield [];
	let amount = firstArgs.amount;
	let pattern = firstArgs.pattern
		? parsePattern(firstArgs.pattern).unwrapOr(null)
		: null;

	while (true) {
		const result: ModeWithStage[] = [];

		let currentModeOrder =
			orderedModes[currentOrderIndex % orderedModes.length];
		if (pattern) {
			currentModeOrder = modifyModeOrderByPattern(
				currentModeOrder,
				pattern,
				amount,
			);
		}

		for (let i = 0; i < amount; i++) {
			const mode = currentModeOrder[i % currentModeOrder.length];
			const possibleStages = R.shuffle(args.mapPool.parsed[mode]);
			const isNotGuaranteedToBePlayed = args.considerGuaranteed
				? Math.ceil(amount / 2) <= i
				: false;

			replenishStageIds({ possibleStages, stageCounts, stageUsageTracker });
			const stageId = mostRarelySeenStage(possibleStages, stageCounts);

			result.push({ mode, stageId });
			stageCounts.set(
				stageId,
				stageCounts.get(stageId)! + (isNotGuaranteedToBePlayed ? 0.5 : 1),
			);
			stageUsageTracker.set(stageId, currentOrderIndex);
		}

		currentOrderIndex++;
		const nextArgs = yield result;
		amount = nextArgs.amount;
		pattern = nextArgs.pattern
			? parsePattern(nextArgs.pattern).unwrapOr(null)
			: null;
	}
}

function initializeStageCounts(
	modes: ModeShort[],
	mapPool: ReadonlyMapPoolObject,
) {
	const counts = new Map<StageId, number>();
	const stageIds = modes.flatMap((mode) => mapPool[mode]);

	for (const stageId of stageIds) {
		counts.set(stageId, 0);
	}

	return counts;
}

/** This function is used for controlling in which order we start reusing the stage ids */
function replenishStageIds({
	possibleStages,
	stageCounts,
	stageUsageTracker,
}: {
	possibleStages: StageId[];
	stageCounts: Map<StageId, number>;
	stageUsageTracker: Map<StageId, number>;
}) {
	const allOptionsEqual = possibleStages.every(
		(stageId) =>
			stageCounts.get(stageId) === stageCounts.get(possibleStages[0]),
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

function mostRarelySeenStage(
	possibleStages: StageId[],
	stageCounts: Map<StageId, number>,
) {
	const result = possibleStages.toSorted(
		(a, b) => stageCounts.get(a)! - stageCounts.get(b)!,
	)[0];
	invariant(
		typeof result === "number",
		"Expected to find at least one stage ID",
	);

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
	mapPool: MapPool;
	preferences: [ModeWithStagePreferences, ModeWithStagePreferences];
}) {}

function modifyModeOrderByPattern(
	modeOrder: ModeShort[],
	pattern: MaplistPattern,
	amount: number,
) {
	const result: ModeShort[] = modeOrder
		.filter((mode) => !pattern.pattern.includes(mode))
		.slice(0, amount);

	const expandedPattern = new Array(result.length)
		.fill(null)
		.map((_, i) => pattern.pattern[i % pattern.pattern.length])
		.slice(0, amount);

	if (pattern.mustInclude) {
		for (const { mode } of pattern.mustInclude) {
			// impossible must include, mode is not in the pool
			if (!modeOrder.includes(mode)) continue;

			const possibleIndices = expandedPattern.every((part) => part !== "ANY")
				? // inflexible pattern fallback
					expandedPattern.map((_, idx) => idx)
				: expandedPattern.flatMap((part, idx) => (part === "ANY" ? [idx] : []));

			const isAlreadyIncluded = result.includes(mode);
			// "good spot" means a spot where the pattern allows ANY mode
			const isInGoodSpot = possibleIndices.includes(result.indexOf(mode));

			if (!isAlreadyIncluded) {
				const randomIndex = R.sample(possibleIndices, 1)[0];
				invariant(typeof randomIndex === "number");
				result[randomIndex] = mode;
			} else if (!isInGoodSpot) {
				const currentIndex = result.indexOf(mode);
				const targetIndex = R.sample(
					possibleIndices.filter((idx) => idx !== currentIndex),
					1,
				)[0];
				invariant(typeof targetIndex === "number");

				[result[currentIndex], result[targetIndex]] = [
					result[targetIndex],
					result[currentIndex],
				];
			}
		}
	}

	if (pattern.pattern.every((part) => part === "ANY")) {
		return result;
	}

	for (const [idx, mode] of expandedPattern.entries()) {
		if (mode === "ANY") continue;

		result[idx] = mode;
	}

	return result;
}

const validPatternParts = new Set(["*", ...modesShort] as const);
export function parsePattern(pattern: string) {
	const mustInclude: Array<{ mode: ModeShort; isGuaranteed: boolean }> = [];
	let mutablePattern = pattern;
	for (const mode of modesShort) {
		if (mutablePattern.includes(`[${mode}!]`)) {
			mustInclude.push({ mode, isGuaranteed: true });
			mutablePattern = mutablePattern.replaceAll(`[${mode}!]`, "");
		} else if (mutablePattern.includes(`[${mode}]`)) {
			mustInclude.push({ mode, isGuaranteed: false });
			mutablePattern = mutablePattern.replaceAll(`[${mode}]`, "");
		}
	}

	for (const part of validPatternParts) {
		mutablePattern = mutablePattern.replaceAll(part, `${part},`);
	}

	const parts = mutablePattern
		.split(",")
		.map((part) => part.trim())
		.filter((part) => part.length > 0);

	if (parts.some((part) => !validPatternParts.has(part as ModeShort | "*"))) {
		return err("invalid mode in pattern");
	}

	if (parts.length > 0 && parts[0] === "*" && parts.at(-1) === "*") {
		parts.pop();
	}

	return ok({
		pattern: parts.map((part) =>
			modesShort.includes(part as ModeShort) ? (part as ModeShort) : "ANY",
		),
		mustInclude: mustInclude.length > 0 ? mustInclude : undefined,
	});
}
