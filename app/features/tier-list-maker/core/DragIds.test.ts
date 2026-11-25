import { describe, expect, test } from "vitest";
import type { TierListItem } from "../tier-list-maker-schemas";
import * as DragIds from "./DragIds";

describe("DragIds.itemId", () => {
	test.each([
		{
			why: "without nth",
			item: { type: "main-weapon", id: 40 },
			expected: "main-weapon:40",
		},
		{
			why: "with nth",
			item: { type: "main-weapon", id: 40, nth: 2 },
			expected: "main-weapon:40:2",
		},
		{
			why: "a stage + mode pair",
			item: { type: "stage-mode", id: "1-SZ" },
			expected: "stage-mode:1-SZ",
		},
	] satisfies Array<{ why: string; item: TierListItem; expected: string }>)(
		"$why -> $expected",
		({ item, expected }) => {
			expect(DragIds.itemId(item)).toBe(expected);
		},
	);
});

describe("DragIds.parseItemId", () => {
	test.each([
		{ why: "weapon", item: { type: "main-weapon", id: 40 } },
		{ why: "duplicate", item: { type: "sub-weapon", id: 3, nth: 2 } },
		{ why: "stage", item: { type: "stage", id: 0 } },
		{ why: "mode", item: { type: "mode", id: "TC" } },
		{ why: "stage + mode", item: { type: "stage-mode", id: "10-RM" } },
		{ why: "ability", item: { type: "ability", id: "ISM" } },
	] satisfies Array<{ why: string; item: TierListItem }>)(
		"round trips a $why",
		({ item }) => {
			expect(DragIds.parseItemId(DragIds.itemId(item))).toEqual({
				nth: undefined,
				...item,
			});
		},
	);

	test.each([
		{ why: "a tier's drop zone", id: "tier-x" },
		{ why: "the pool", id: DragIds.POOL_ID },
		{ why: "a tier row", id: DragIds.tierSortableId("tier-x") },
	])("returns null for $why", ({ id }) => {
		expect(DragIds.parseItemId(id)).toBeNull();
	});
});

describe("DragIds.tierSortableId", () => {
	test("differs from the tier's own id", () => {
		expect(DragIds.tierSortableId("tier-x")).not.toBe("tier-x");
	});
});

describe("DragIds.tierIdFromSortableId", () => {
	test("returns the tier id of a tier row", () => {
		expect(DragIds.tierIdFromSortableId(DragIds.tierSortableId("tier-x"))).toBe(
			"tier-x",
		);
	});

	test.each([
		{ why: "a tier's drop zone", id: "tier-x" },
		{ why: "an item", id: "main-weapon:40" },
	])("returns null for $why", ({ id }) => {
		expect(DragIds.tierIdFromSortableId(id)).toBeNull();
	});
});
