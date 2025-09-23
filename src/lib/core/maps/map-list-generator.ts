// xxx: delete file
// Original version by Lean

import type { ModeShort, ModeWithStage, StageId } from '$lib/constants/in-game/types';
import * as MapPool from '$lib/core/maps/MapPool';
import invariant from '$lib/utils/invariant';
import * as R from 'remeda';

const BACKLOG = 2;

export type Popularity = Map<ModeShort, Map<StageId, number>>;

type MapBucket = Map<number, MapPool.MapPool>;

/**
 * @param mapPool Map pool to work with as dictionary
 * @param modeList List of modes that define the order of modes
 * @param games list of ints. Each entry is one round of x maps.
 * @param popularity Popularity List, dict of [mode][map] -> votes
 * @returns List of maps and mode combinations
 */
export function generateMapList(
	partialMapPool: MapPool.PartialMapPool,
	modeList: ModeShort[],
	games: number[],
	popularity?: Popularity
) {
	const mapPool = MapPool.partialMapPoolToFull(partialMapPool);

	let modeIndex = 0;
	const mapList: ModeWithStage[][] = [];
	const buckets: MapBucket = new Map();
	const mapHistory: StageId[] = [];
	let newMap: StageId | null = null;

	for (let i = 0; i < games.length; i++) {
		const roundMapList: ModeWithStage[] = [];

		for (let j = 0; j < games[i]; j++) {
			const mode = modeList[modeIndex];
			invariant(mode, 'Mode is missing');

			if (!popularity) {
				newMap = getMap(mapPool, mode, buckets, mapHistory);
			} else {
				newMap = getMapPopular(mapPool, mode, popularity, mapHistory);
			}

			mapHistory.push(newMap);
			roundMapList.push({ mode, stageId: newMap });
			modeIndex = (modeIndex + 1) % modeList.length;
		}

		mapList.push(roundMapList);
	}

	return mapList;
}

function isValid(stageId: StageId, mapHistory: StageId[]) {
	// [1,2,3,4,5,6,7,8,9,10].slice(-2)
	// > (2) [9, 10]
	return !mapHistory.slice(-BACKLOG).includes(stageId);
}

function addAndReturnMap(stageId: StageId, mode: ModeShort, buckets: MapBucket, bucketNum: number) {
	// if next bucket doesnt exists then create it
	const nextBucket = bucketNum + 1;
	if (!buckets.has(nextBucket)) {
		buckets.set(nextBucket, {
			TW: [],
			SZ: [],
			TC: [],
			RM: [],
			CB: []
		} as MapPool.MapPool);
	}

	buckets.get(bucketNum)![mode] = buckets.get(bucketNum)![mode].filter((map) => map !== stageId);

	buckets.get(nextBucket)![mode].push(stageId);
	return stageId;
}

function getMapPopular(
	mapPool: MapPool.MapPool,
	mode: ModeShort,
	popularity: Popularity,
	mapHistory: StageId[]
): StageId {
	const popularity_map_pool = new Map();
	for (const [stageId, votes] of popularity.get(mode)!.entries()) {
		if (mapPool[mode].includes(stageId)) {
			popularity_map_pool.set(stageId, votes);
		}
	}
	let stageId = randomMap(popularity_map_pool);
	while (!isValid(stageId, mapHistory)) {
		stageId = randomMap(popularity_map_pool);
	}
	return stageId;
}

function randomMap(popularityList: Map<StageId, number>) {
	const maxNumber = Array.from(popularityList.values()).reduce((a, b) => a + b, 0);
	const randInt = Math.floor(Math.random() * maxNumber);
	let counter = 0;
	let lastStageId: StageId | null = null;
	for (const [stageId, votes] of popularityList) {
		counter += votes;
		if (counter >= randInt) {
			return stageId;
		}
		lastStageId = stageId;
	}

	invariant(lastStageId, 'Last stage id is missing');
	return lastStageId;
}

/**
 * Shuffles array in place.
 * @param {Array} a items An array containing the items.
 */
function shuffle<T>(a: Array<T>) {
	let j: number;
	let x: T;
	let i: number;
	for (i = a.length - 1; i > 0; i--) {
		j = Math.floor(Math.random() * (i + 1));
		x = a[i];
		a[i] = a[j]!;
		a[j] = x!;
	}
	return a;
}

function getMap(
	mapPool: MapPool.MapPool,
	mode: ModeShort,
	buckets: MapBucket,
	mapHistory: StageId[]
) {
	if (!buckets.size) {
		buckets.set(0, structuredClone(mapPool));
	}

	for (let bucketNum = 0; bucketNum < buckets.size; bucketNum++) {
		const item = buckets.get(bucketNum);
		shuffle(item![mode]);

		for (const [i, stageId] of item![mode].entries()) {
			// fallback solution, might happen if map pool is small
			function isLast() {
				// is actually last
				if (bucketNum === buckets.size - 1 && i === item![mode].length - 1) {
					return true;
				}

				// is last in bucket and next is empty
				const nextBucket = buckets.get(bucketNum + 1);
				if (i === item![mode].length - 1 && nextBucket && nextBucket[mode].length === 0) {
					return true;
				}

				return false;
			}
			if (isLast() || isValid(stageId, mapHistory)) {
				return addAndReturnMap(stageId, mode, buckets, bucketNum);
			}
		}
	}
	throw Error('Invalid bucket configuration');
}

export function modesOrder(type: 'EQUAL' | 'SZ_EVERY_OTHER', modes: ModeShort[]): ModeShort[] {
	if (type === 'EQUAL') {
		return R.shuffle(modes);
	}

	const withoutSZ = R.shuffle(modes.filter((mode) => mode !== 'SZ'));

	return withoutSZ.flatMap((mode) => [mode, 'SZ']);
}
