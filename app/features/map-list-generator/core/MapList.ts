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

interface GenerateNext {
	/** How many maps to return? E.g. for a Bo5 set, amount should be 5 */
	amount: number;
	pattern?: string;
}

interface MaplistPattern {
	mustInclude?: Array<{
		mode: ModeShort;
		/** Should the mode appear in the guaranteed to be played maps of a Best of set e.g. first 3 of a Bo5? */
		isGuaranteed: boolean;
	}>;
	pattern: Array<"ANY" | ModeShort>;
}

/**
 * Generates map lists that avoid repeating stages and optionally allows providing mode pattern.
 *
 * @example
 * const generator = generate({ mapPool: new MapPool(pool) });
 * generator.next();
 * const firstSet = generator.next({ amount: 5 }).value;
 * const secondSet = generator.next({ amount: 3, pattern: "SZ*TC" }).value; // remembers stages used in firstSet
 */
export function* generate(args: {
	/** The map pool to use for generating map lists (MapPool class) */
	mapPool: MapPool;
	/** Should the function bias in favor of maps not played? E.g. maps 4 & 5 in a Bo5 format (not every team plays them). Should be true if generating for tournament with best of format. */
	considerGuaranteed?: boolean;
}): Generator<Array<ModeWithStage>, Array<ModeWithStage>, GenerateNext> {
	if (args.mapPool.isEmpty()) {
		while (true) yield [];
	}

	const modes = args.mapPool.modes;

	const { stageWeights, stageModeWeights } = initializeWeights(
		modes,
		args.mapPool.parsed,
	);
	const orderedModes = modeOrders(modes);
	const stageModeLastUsed = new Map<string, number>();
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
			const possibleStages = args.mapPool.parsed[mode];
			const isNotGuaranteedToBePlayed = args.considerGuaranteed
				? Math.ceil(amount / 2) <= i
				: false;

			const stageId = selectStageWeighted({
				possibleStages,
				mode,
				stageWeights,
				stageModeWeights,
			});

			result.push({ mode, stageId });

			for (const [key, value] of stageWeights.entries()) {
				stageWeights.set(key, value + 1);
			}
			for (const [key, value] of stageModeWeights.entries()) {
				stageModeWeights.set(key, value + 1);
			}

			const stageWeightPenalty = isNotGuaranteedToBePlayed ? -2 : -5;
			const stageModeWeightPenalty = args.mapPool.modes.length > 1 ? -10 : 0;

			stageWeights.set(stageId, stageWeightPenalty);
			stageModeWeights.set(`${stageId}-${mode}`, stageModeWeightPenalty);
			stageModeLastUsed.set(`${stageId}-${mode}`, currentOrderIndex);
		}

		currentOrderIndex++;
		const nextArgs = yield result;
		amount = nextArgs.amount;
		pattern = nextArgs.pattern
			? parsePattern(nextArgs.pattern).unwrapOr(null)
			: null;
	}
}

function initializeWeights(modes: ModeShort[], mapPool: ReadonlyMapPoolObject) {
	const stageWeights = new Map<StageId, number>();
	const stageModeWeights = new Map<string, number>();

	for (const mode of modes) {
		const stageIds = mapPool[mode];
		for (const stageId of stageIds) {
			stageWeights.set(stageId, 0);
			stageModeWeights.set(`${stageId}-${mode}`, 0);
		}
	}

	return { stageWeights, stageModeWeights };
}

function weightedRandomSelect<T>(
	candidates: T[],
	getWeight: (candidate: T) => number,
): T {
	const totalWeight = candidates.reduce(
		(sum, candidate) => sum + Math.max(0, getWeight(candidate)),
		0,
	);

	invariant(totalWeight > 0, "Expected at least one candidate with weight > 0");

	let random = Math.random() * totalWeight;

	for (const candidate of candidates) {
		const weight = Math.max(0, getWeight(candidate));
		random -= weight;
		if (random <= 0) {
			return candidate;
		}
	}

	return candidates[candidates.length - 1];
}

function selectStageWeighted({
	possibleStages,
	mode,
	stageWeights,
	stageModeWeights,
}: {
	possibleStages: readonly StageId[];
	mode: ModeShort;
	stageWeights: Map<StageId, number>;
	stageModeWeights: Map<string, number>;
}): StageId {
	const getCandidates = () =>
		possibleStages.filter((stageId) => {
			const stageWeight = stageWeights.get(stageId) ?? 0;
			const stageModeWeight = stageModeWeights.get(`${stageId}-${mode}`) ?? 0;
			return stageWeight >= 0 && stageModeWeight >= 0;
		});

	let candidates = getCandidates();

	while (candidates.length === 0) {
		for (const [key, value] of stageWeights.entries()) {
			stageWeights.set(key, value + 1);
		}
		for (const [key, value] of stageModeWeights.entries()) {
			stageModeWeights.set(key, value + 1);
		}
		candidates = getCandidates();
	}

	return weightedRandomSelect(candidates, (stageId) => {
		const stageWeight = stageWeights.get(stageId) ?? 0;
		const stageModeWeight = stageModeWeights.get(`${stageId}-${mode}`) ?? 0;
		return stageWeight + stageModeWeight + 1;
	});
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

function modifyModeOrderByPattern(
	modeOrder: ModeShort[],
	pattern: MaplistPattern,
	amount: number,
) {
	const filteredModes = modeOrder.filter(
		(mode) => !pattern.pattern.includes(mode),
	);
	const modesToUse = filteredModes.length > 0 ? filteredModes : modeOrder;
	const result: ModeShort[] = Array.from(
		{ length: amount },
		(_, i) => modesToUse[i % modesToUse.length],
	);

	const expandedPattern = Array.from(
		{ length: amount },
		(_, i) => pattern.pattern[i % pattern.pattern.length],
	);

	if (pattern.mustInclude) {
		for (const { mode, isGuaranteed } of pattern.mustInclude) {
			// impossible must include, mode is not in the pool
			if (!modeOrder.includes(mode)) continue;

			let possibleIndices = expandedPattern.every((part) => part !== "ANY")
				? // inflexible pattern fallback
					expandedPattern.map((_, idx) => idx)
				: expandedPattern.flatMap((part, idx) => (part === "ANY" ? [idx] : []));

			if (isGuaranteed) {
				const guaranteedPositions = Math.ceil(amount / 2);
				possibleIndices = possibleIndices.filter(
					(idx) => idx < guaranteedPositions,
				);
			}

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

		if (modeOrder.includes(mode)) {
			result[idx] = mode;
		}
	}

	return result;
}

const validPatternParts = new Set(["*", ...modesShort] as const);

/**
 * Parses a pattern string into structured pattern data for map list generation.
 *
 * @example
 * parsePattern("SZ*TC").unwrapOr(null); // { pattern: ["SZ", "ANY", "TC"] }
 * parsePattern("[RM!]*SZ").unwrapOr(null); // { pattern: ["ANY", "SZ"], mustInclude: [{ mode: "RM", isGuaranteed: true }] }
 */
export function parsePattern(pattern: string) {
	if (pattern.length > 50) {
		return err("pattern too long");
	}

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
