import { describe, expect, test } from "vitest";
import { sortBadgesByFavorites } from "./badge-sorting.server";

const badge = (id: number) => ({
	id,
	displayName: `Badge ${id}`,
	code: `b${id}`,
});

describe("sortBadgesByFavorites", () => {
	test("returns badges sorted by descending id when no favorites", () => {
		const result = sortBadgesByFavorites({
			favoriteBadgeIds: [],
			badges: [badge(1), badge(3), badge(2)],
			patronTier: null,
		});

		expect(result.map((b) => b.id)).toEqual([3, 2, 1]);
	});

	test("places favorites first in order for supporters", () => {
		const result = sortBadgesByFavorites({
			favoriteBadgeIds: [2, 1],
			badges: [badge(1), badge(2), badge(3)],
			patronTier: 2,
		});

		expect(result.map((b) => b.id)).toEqual([2, 1, 3]);
	});

	test("limits non-supporters to one favorite", () => {
		const result = sortBadgesByFavorites({
			favoriteBadgeIds: [2, 3],
			badges: [badge(1), badge(2), badge(3)],
			patronTier: null,
		});

		expect(result.map((b) => b.id)).toEqual([2, 3, 1]);
	});

	test("ignores favorite badge ids no longer owned", () => {
		const result = sortBadgesByFavorites({
			favoriteBadgeIds: [99, 1],
			badges: [badge(1), badge(2)],
			patronTier: 2,
		});

		expect(result.map((b) => b.id)).toEqual([1, 2]);
	});
});
