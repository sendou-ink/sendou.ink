// https://web.archive.org/web/20200601102344/https://tl.net/forum/sc2-tournaments/202139-superior-double-elimination-losers-bracket-seeding

import invariant from "~/utils/invariant";
import type { OrderingMap, Seeding, SeedOrdering } from "../types";

export const ordering: OrderingMap = {
	natural: <T>(array: T[]) => [...array],
	reverse: <T>(array: T[]) => [...array].reverse(),
	half_shift: <T>(array: T[]) => [
		...array.slice(array.length / 2),
		...array.slice(0, array.length / 2),
	],
	reverse_half_shift: <T>(array: T[]) => [
		...array.slice(0, array.length / 2).reverse(),
		...array.slice(array.length / 2).reverse(),
	],
	pair_flip: <T>(array: T[]) => {
		const result: T[] = [];
		for (let i = 0; i < array.length; i += 2)
			result.push(array[i + 1], array[i]);
		return result;
	},
	// https://stackoverflow.com/a/11631472
	space_between: <T>(array: T[]) => {
		const numPlayers = array.length;

		const rounds = Math.log(numPlayers) / Math.log(2) - 1;
		let pls = [1, 2];
		for (let i = 0; i < rounds; i++) {
			pls = nextLayer(pls);
		}
		return seedsToOrderedArray(pls);
		function nextLayer(pls: number[]) {
			const out: number[] = [];
			const length = pls.length * 2 + 1;
			for (const d of pls) {
				out.push(d);
				out.push(length - d);
			}
			return out;
		}
		// this part added to the SO answer
		function seedsToOrderedArray(seeds: number[]) {
			return seeds.map((seed) => {
				const participant = array[seed - 1];
				invariant(participant !== undefined, `No participant for seed ${seed}`);
				return participant;
			});
		}
	},
	"groups.seed_optimized": <T>(array: T[], groupCount: number) => {
		const groups = Array.from(Array(groupCount), (_): T[] => []);

		for (let run = 0; run < array.length / groupCount; run++) {
			if (run % 2 === 0) {
				for (let group = 0; group < groupCount; group++)
					groups[group].push(array[run * groupCount + group]);
			} else {
				for (let group = 0; group < groupCount; group++)
					groups[groupCount - group - 1].push(array[run * groupCount + group]);
			}
		}

		return groups.flat();
	},
};

export const defaultMinorOrdering: { [key: number]: SeedOrdering[] } = {
	// 1 or 2: Not possible.
	4: ["natural", "reverse"],
	8: ["natural", "reverse", "natural"],
	16: ["natural", "reverse_half_shift", "reverse", "natural"],
	32: ["natural", "reverse", "half_shift", "natural", "natural"],
	64: ["natural", "reverse", "half_shift", "reverse", "natural", "natural"],
	128: [
		"natural",
		"reverse",
		"half_shift",
		"pair_flip",
		"pair_flip",
		"pair_flip",
		"natural",
	],
};

/**
 * Pads the seeding with BYEs (`null`) until its length is a power of two.
 *
 * @param seeding The seeding of the stage.
 */
export function padSeedingToPowerOfTwo(seeding: Seeding): Seeding {
	return setArraySize(seeding, getNearestPowerOfTwo(seeding.length), null);
}

/**
 * Sets the size of an array with a placeholder if the size is bigger.
 *
 * @param array The original array.
 * @param length The new length.
 * @param placeholder A placeholder to use to fill the empty space.
 */
function setArraySize<T>(array: T[], length: number, placeholder: T): T[] {
	return Array.from(Array(length), (_, i) => array[i] || placeholder);
}

/**
 * Returns the nearest power of two **greater than** or equal to the given number.
 *
 * @param input The input number.
 */
function getNearestPowerOfTwo(input: number): number {
	return 2 ** Math.ceil(Math.log2(input));
}
