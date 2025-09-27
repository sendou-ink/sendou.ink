import { describe, expect, it } from 'vitest';
import * as MapList from './MapList';
import * as MapPool from './MapPool';
import * as R from 'remeda';

const ALL_MODES_TEST_MAP_POOL: MapPool.PartialMapPool = {
	TW: [1, 2, 3],
	SZ: [4, 5, 6],
	TC: [7, 8, 9],
	RM: [10, 11, 12],
	CB: [13, 14, 15]
};

describe('MapList.generate()', () => {
	function initGenerator(mapPool = ALL_MODES_TEST_MAP_POOL) {
		const gen = MapList.generate({ mapPool });
		gen.next();
		return gen;
	}

	describe('singular map list', () => {
		it('returns array with given amount of items', () => {
			const gen = initGenerator();
			expect(gen.next({ amount: 3 }).value).toHaveLength(3);
		});

		it('includes only maps from the given map pool', () => {
			const gen = initGenerator();
			const maps = gen.next({ amount: 3 }).value;

			for (const map of maps!) {
				expect(MapPool.toArray(ALL_MODES_TEST_MAP_POOL)).toContainEqual(map);
			}
		});

		it('contains only unique maps, when possible', () => {
			const gen = initGenerator();
			const maps = gen.next({ amount: 3 }).value;

			expect(maps).toHaveLength(new Set(maps!.map((m) => `${m.mode}-${m.stageId}`)).size);
		});

		it('repeats maps when amount is larger than pool size', () => {
			const gen = initGenerator({ TW: [1] });
			const maps = gen.next({ amount: 3 }).value;

			expect(maps).toHaveLength(3);
			for (const map of maps!) {
				expect(map).toEqual({ mode: 'TW', stageId: 1 });
			}
		});

		it('contains every mode once before repeating', () => {
			const gen = initGenerator();
			const maps = gen.next({ amount: 5 }).value;
			const modes = maps!.map((m) => m.mode);

			for (const modeShort of ['TW', 'SZ', 'TC', 'RM', 'CB'] as const) {
				expect(modes).toContain(modeShort);
			}
		});

		it('repeats a mode following the pattern when amount bigger than mode count', () => {
			const gen = initGenerator();
			const maps = gen.next({ amount: 6 }).value;

			expect(maps![0].mode).toBe(maps![5].mode);
		});
	});

	describe('many map lists', () => {
		it('generates many map lists', () => {
			const gen = initGenerator();
			const first = gen.next({ amount: 3 }).value;
			const second = gen.next({ amount: 3 }).value;

			expect(first).toBeInstanceOf(Array);
			expect(second).toBeInstanceOf(Array);
		});

		it('has different maps in each list', () => {
			// TW, SZ & TC with 3 maps each
			const mapPool = R.pick(ALL_MODES_TEST_MAP_POOL, ['TW', 'SZ', 'TC']);

			const gen = initGenerator(mapPool);
			const first = gen.next({ amount: 3 }).value;
			const second = gen.next({ amount: 3 }).value;
			const third = gen.next({ amount: 3 }).value;
			const all = [...first, ...second, ...third];

			console.log(all);

			expect(all).toContainEqual({ mode: 'TW', stageId: 1 });
			expect(all).toContainEqual({ mode: 'TW', stageId: 2 });
			expect(all).toContainEqual({ mode: 'TW', stageId: 3 });
			expect(all).toContainEqual({ mode: 'SZ', stageId: 4 });
			expect(all).toContainEqual({ mode: 'SZ', stageId: 5 });
			expect(all).toContainEqual({ mode: 'SZ', stageId: 6 });
			expect(all).toContainEqual({ mode: 'TC', stageId: 7 });
			expect(all).toContainEqual({ mode: 'TC', stageId: 8 });
			expect(all).toContainEqual({ mode: 'TC', stageId: 9 });
		});

		// it('rotates the mode order', () => {

		// it('works when have to start repeating stages', () => {

		// it('repeats stages in a different order than the original', () => {
	});
});
