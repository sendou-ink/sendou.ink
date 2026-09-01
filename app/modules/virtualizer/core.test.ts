import { describe, expect, test } from "vitest";
import { VirtualizerCore } from "./core";

const ESTIMATED_SIZE = 40;
const GAP = 8;

function naiveStarts(sizes: number[]) {
	const starts: number[] = [];
	let start = 0;
	for (const size of sizes) {
		starts.push(start);
		start += size + GAP;
	}
	return starts;
}

function naiveRange(sizes: number[], scrollTop: number, viewport: number) {
	const starts = naiveStarts(sizes);
	const firstVisible = sizes.findIndex(
		(size, i) => starts[i] + size >= scrollTop,
	);
	if (firstVisible === -1) return [];
	let lastVisible = -1;
	for (let i = 0; i < sizes.length; i++) {
		if (starts[i] <= scrollTop + viewport) lastVisible = i;
	}
	const from = Math.max(0, firstVisible - 3);
	const to = Math.min(sizes.length - 1, lastVisible + 3);
	return Array.from({ length: to - from + 1 }, (_, offset) => ({
		index: from + offset,
		start: starts[from + offset],
	}));
}

function seededSizes(count: number, seed: number) {
	let state = seed;
	return Array.from({ length: count }, () => {
		state = (state * 1103515245 + 12345) % 2147483648;
		return 20 + (state % 120);
	});
}

describe("VirtualizerCore", () => {
	test("offsets and total size match a full recount after out-of-order measurements", () => {
		const sizes = seededSizes(50, 7);
		const core = new VirtualizerCore({
			count: sizes.length,
			estimatedSize: ESTIMATED_SIZE,
			gap: GAP,
		});

		for (const index of [30, 5, 49, 12, 0, 5]) {
			core.measure(index, sizes[index]);
		}
		const applied = sizes.map((size, i) =>
			[30, 5, 49, 12, 0].includes(i) ? size : ESTIMATED_SIZE,
		);
		const starts = naiveStarts(applied);

		for (let i = 0; i < sizes.length; i++) {
			expect(core.startOf(i)).toBe(starts[i]);
		}
		expect(core.totalSize()).toBe(starts[49] + applied[49]);
	});

	test.each([
		{ why: "top", scrollTop: 0, viewport: 300 },
		{ why: "middle", scrollTop: 1234, viewport: 300 },
		{ why: "row boundary", scrollTop: 20 + GAP, viewport: 100 },
		{ why: "zero viewport", scrollTop: 500, viewport: 0 },
		{ why: "past the end", scrollTop: 100_000, viewport: 300 },
	])("range matches a linear scan ($why)", ({ scrollTop, viewport }) => {
		const sizes = seededSizes(80, 3);
		const core = new VirtualizerCore({
			count: sizes.length,
			estimatedSize: ESTIMATED_SIZE,
			gap: GAP,
		});
		for (const [index, size] of sizes.entries()) {
			core.measure(index, size);
		}

		expect(core.range(scrollTop, viewport)).toEqual(
			naiveRange(sizes, scrollTop, viewport),
		);
	});

	test("shrinking the count drops stale measurements and offsets", () => {
		const core = new VirtualizerCore({
			count: 10,
			estimatedSize: ESTIMATED_SIZE,
			gap: GAP,
		});
		core.measure(9, 200);
		expect(core.totalSize()).toBe(9 * (ESTIMATED_SIZE + GAP) + 200);

		core.setCount(5);
		expect(core.totalSize()).toBe(4 * (ESTIMATED_SIZE + GAP) + ESTIMATED_SIZE);

		core.setCount(10);
		expect(core.sizeOf(9)).toBe(ESTIMATED_SIZE);
		expect(core.totalSize()).toBe(9 * (ESTIMATED_SIZE + GAP) + ESTIMATED_SIZE);
	});

	test("measuring a row shifts only the rows after it", () => {
		const core = new VirtualizerCore({
			count: 4,
			estimatedSize: ESTIMATED_SIZE,
			gap: GAP,
		});
		expect(core.measure(1, 100)).toBe(true);
		expect(core.measure(1, 100)).toBe(false);

		expect(core.startOf(1)).toBe(ESTIMATED_SIZE + GAP);
		expect(core.startOf(2)).toBe(ESTIMATED_SIZE + GAP + 100 + GAP);
	});
});
