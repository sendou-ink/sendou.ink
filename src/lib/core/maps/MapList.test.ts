import { describe, expect, it } from 'vitest';
import * as MapList from './MapList';
import * as MapPool from './MapPool';
import * as R from 'remeda';
import { stageIds } from '$lib/constants/in-game/stage-ids';
import { Err } from 'neverthrow';

const ALL_MODES_TEST_MAP_POOL: MapPool.PartialMapPool = {
	TW: [1, 2, 3],
	SZ: [4, 5, 6],
	TC: [7, 8, 9],
	RM: [10, 11, 12],
	CB: [13, 14, 15]
};

const ALL_MAPS_TEST_MAP_POOL: MapPool.PartialMapPool = {
	TW: [...stageIds],
	SZ: [...stageIds],
	TC: [...stageIds],
	RM: [...stageIds],
	CB: [...stageIds]
};

describe('MapList.generate()', () => {
	function initGenerator(mapPool = ALL_MODES_TEST_MAP_POOL) {
		const gen = MapList.generate({ mapPool });
		gen.next();
		return gen;
	}

	describe('singular map list', () => {
		it('returns an array with given amount of items', () => {
			const gen = initGenerator();
			expect(gen.next({ amount: 3 }).value).toHaveLength(3);
		});

		it('returns an array with only one item', () => {
			const gen = initGenerator();
			expect(gen.next({ amount: 1 }).value).toHaveLength(1);
		});

		it('includes only maps from the given map pool', () => {
			const gen = initGenerator();
			const maps = gen.next({ amount: 3 }).value;

			for (const map of maps) {
				expect(MapPool.toArray(ALL_MODES_TEST_MAP_POOL)).toContainEqual(map);
			}
		});

		it('contains only unique maps, when possible', () => {
			const gen = initGenerator();
			const maps = gen.next({ amount: 3 }).value;

			expect(maps).toHaveLength(new Set(maps.map((m) => `${m.mode}-${m.stageId}`)).size);
		});

		it('repeats maps when amount is larger than pool size', () => {
			const gen = initGenerator({ TW: [1] });
			const maps = gen.next({ amount: 3 }).value;

			expect(maps).toHaveLength(3);
			for (const map of maps) {
				expect(map).toEqual({ mode: 'TW', stageId: 1 });
			}
		});

		it('contains every mode once before repeating', () => {
			const gen = initGenerator();
			const maps = gen.next({ amount: 5 }).value;
			const modes = maps.map((m) => m.mode);

			for (const modeShort of ['TW', 'SZ', 'TC', 'RM', 'CB'] as const) {
				expect(modes).toContain(modeShort);
			}
		});

		it('repeats a mode following the pattern when amount bigger than mode count', () => {
			const gen = initGenerator();
			const maps = gen.next({ amount: 6 }).value;

			expect(maps[0].mode).toBe(maps[5].mode);
		});

		it('handles empty map pool', () => {
			const gen = initGenerator({});
			const maps = gen.next({ amount: 3 }).value;

			expect(maps).toHaveLength(0);
		});

		it('follows a pattern', () => {
			for (let i = 0; i < 10; i++) {
				const gen = initGenerator();
				const maps = gen.next({ amount: 3, pattern: '*SZ*' }).value;

				expect(maps).toHaveLength(3);
				expect(maps[1].mode).toBe('SZ');
			}
		});

		it('follows and repeats a pattern', () => {
			const gen = initGenerator();
			const maps = gen.next({ amount: 5, pattern: '*SZ*' }).value;

			expect(maps).toHaveLength(5);
			expect(maps[1].mode).toBe('SZ');
			expect(maps[3].mode).toBe('SZ');
		});

		it('follows a one mode only pattern', () => {
			const gen = initGenerator();
			const maps = gen.next({ amount: 3, pattern: 'SZ' }).value;

			expect(maps[0].mode).toBe('SZ');
			expect(maps[1].mode).toBe('SZ');
			expect(maps[2].mode).toBe('SZ');
		});

		it('includes a mustInclude mode', () => {
			for (let i = 0; i < 10; i++) {
				const gen = initGenerator();
				const maps = gen.next({ amount: 1, pattern: '[SZ]' }).value;

				expect(maps[0].mode).toBe('SZ');
			}
		});

		it('follows a pattern with multiple specific modes', () => {
			const gen = initGenerator();
			const maps = gen.next({ amount: 5, pattern: 'SZ*TC' }).value;

			expect(maps).toHaveLength(5);
			expect(maps[0].mode).toBe('SZ');
			expect(maps[2].mode).toBe('TC');
		});

		it('handles a conflict between pattern and must include', () => {
			const gen = initGenerator();
			const maps = gen.next({ amount: 1, pattern: 'TW[SZ]' }).value;

			expect(maps).toHaveLength(1);
			expect(maps[0].mode).toBe('TW'); // pattern has priority
		});

		it('handles more must include modes than amount', () => {
			const gen = initGenerator();
			const maps = gen.next({ amount: 1, pattern: '[TW][SZ]' }).value;

			expect(maps).toHaveLength(1);
			expect(['TW', 'SZ']).toContain(maps[0].mode);
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

		it('randomizes the stage order', () => {
			const stagesSeen = new Set<number>();
			for (let i = 0; i < 10; i++) {
				const gen = initGenerator(ALL_MAPS_TEST_MAP_POOL);
				const maps = gen.next({ amount: 5 }).value;

				stagesSeen.add(maps[0].stageId);
			}

			expect(stagesSeen.size).toBeGreaterThan(1);
		});

		it('rotates the mode order', () => {
			const gen = initGenerator();
			const first = gen.next({ amount: 5 }).value;
			const second = gen.next({ amount: 5 }).value;

			const firstModes = first!.map((m) => m.mode);
			const secondModes = second!.map((m) => m.mode);

			expect(firstModes).not.toEqual(secondModes);
		});

		it('starts with a different mode each time modes are rotated', () => {
			for (let i = 0; i < 10; i++) {
				const gen = initGenerator();
				const first = gen.next({ amount: 5 }).value;
				const second = gen.next({ amount: 5 }).value;

				const firstModes = first!.map((m) => m.mode);
				const secondModes = second!.map((m) => m.mode);

				expect(firstModes[0]).not.toEqual(secondModes[0]);
			}
		});

		// it replenishes the stage id pool when exhausted
	});
});

describe('MapList.parsePattern()', () => {
	it('parses a simple pattern', () => {
		expect(MapList.parsePattern('SZ*TC')._unsafeUnwrap()).toEqual({
			pattern: ['SZ', 'ANY', 'TC']
		});
	});

	it('handles extra spaces', () => {
		expect(MapList.parsePattern(' *  SZ    ')._unsafeUnwrap()).toEqual({
			pattern: ['ANY', 'SZ']
		});
	});

	it('handles the same mode twice in pattern', () => {
		expect(MapList.parsePattern('SZ*SZ')._unsafeUnwrap()).toEqual({
			pattern: ['SZ', 'ANY', 'SZ']
		});
	});

	it('returns error on invalid mode', () => {
		expect(MapList.parsePattern('*INVALID*')).toBeInstanceOf(Err);
	});

	it('if starts and ends with ANY, the ending ANY is dropped', () => {
		expect(MapList.parsePattern('*SZ*')._unsafeUnwrap()).toEqual({
			pattern: ['ANY', 'SZ']
		});
	});

	it('parses a mustInclude mode', () => {
		expect(MapList.parsePattern('[SZ]')._unsafeUnwrap()).toEqual({
			mustInclude: ['SZ'],
			pattern: []
		});
	});

	it('parses a complex pattern', () => {
		expect(MapList.parsePattern(' * [SZ] * TC [TW]')._unsafeUnwrap()).toEqual({
			mustInclude: ['TW', 'SZ'],
			pattern: ['ANY', 'ANY', 'TC']
		});
	});

	it('ignores repeated must include mode', () => {
		expect(MapList.parsePattern('[SZ][SZ]')._unsafeUnwrap()).toEqual({
			mustInclude: ['SZ'],
			pattern: []
		});
	});

	it('parses an empty pattern', () => {
		expect(MapList.parsePattern('')._unsafeUnwrap()).toEqual({
			pattern: []
		});
	});

	it('return error on lorem ipsum', () => {
		expect(
			MapList.parsePattern(
				'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi ut varius velit. Ut egestas lacus dolor, sit amet iaculis justo dictum sed. Fusce aliquet sed nunc sit amet ullamcorper. Interdum et malesuada fames ac ante ipsum primis in faucibus. Integer leo ex, congue eu porta nec, imperdiet sed neque.'
			)
		).toBeInstanceOf(Err);
	});
});
