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
	describe('singular map list', () => {
		it('returns array with given amount of items', () => {
			expect(
				MapList.generate({
					amount: 3,
					mapPool: ALL_MODES_TEST_MAP_POOL
				}).next().value
			).toHaveLength(3);
		});

		it('includes only maps from the given map pool', () => {
			const maps = MapList.generate({ amount: 3, mapPool: ALL_MODES_TEST_MAP_POOL }).next().value;

			for (const map of maps!) {
				expect(MapPool.toArray(ALL_MODES_TEST_MAP_POOL)).toContainEqual(map);
			}
		});

		it('contains only unique maps, when possible', () => {
			const maps = MapList.generate({ amount: 3, mapPool: ALL_MODES_TEST_MAP_POOL }).next().value;

			expect(maps).toHaveLength(new Set(maps!.map((m) => `${m.mode}-${m.stageId}`)).size);
		});

		it('repeats maps when amount is larger than pool size', () => {
			const maps = MapList.generate({ amount: 3, mapPool: { TW: [1] } }).next().value;

			expect(maps).toHaveLength(3);
			for (const map of maps!) {
				expect(map).toEqual({ mode: 'TW', stageId: 1 });
			}
		});

		it('contains every mode once before repeating', () => {
			const maps = MapList.generate({ amount: 5, mapPool: ALL_MODES_TEST_MAP_POOL }).next().value;
			const modes = maps!.map((m) => m.mode);

			for (const modeShort of ['TW', 'SZ', 'TC', 'RM', 'CB'] as const) {
				expect(modes).toContain(modeShort);
			}
		});

		it('repeats a mode following the pattern when amount bigger than mode count', () => {
			const maps = MapList.generate({ amount: 6, mapPool: ALL_MODES_TEST_MAP_POOL }).next().value;

			expect(maps![0].mode).toBe(maps![5].mode);
		});
	});

	describe('many map lists', () => {
		it('generates many map lists', () => {
			const generator = MapList.generate({ amount: 3, mapPool: ALL_MODES_TEST_MAP_POOL });
			const first = generator.next().value;
			const second = generator.next().value;

			expect(first).toBeInstanceOf(Array);
			expect(second).toBeInstanceOf(Array);
		});
	});
});
