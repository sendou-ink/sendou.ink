import { describe, expect, it } from 'vitest';
import * as MapList from './MapList';
import * as MapPool from './MapPool';

const ALL_MODES_TEST_MAP_POOL: MapPool.MapPool = {
	TW: [1, 2, 3],
	SZ: [4, 5, 6],
	TC: [7, 8, 9],
	RM: [10, 11, 12],
	CB: [13, 14, 15]
};

describe('MapList.generate()', () => {
	it('returns array with given amount of items', () => {
		expect(
			MapList.generate({
				amount: 5,
				mapPool: ALL_MODES_TEST_MAP_POOL
			}).next().value
		).toHaveLength(5);
	});
});
