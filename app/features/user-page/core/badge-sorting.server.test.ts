import { describe, expect, it } from "vitest";
import { sortBadgesByFavorites } from "./badge-sorting.server";

const badge = (id: number) => ({
	id,
	displayName: `Badge ${id}`,
	code: `b${id}`,
});

describe("sortBadgesByFavorites", () => {
	it("returns badges sorted by descending id when no favorites", () => {
		const result = sortBadgesByFavorites({
			favoriteBadgeIds: null,
			badges: [badge(1), badge(3), badge(2)],
			patronTier: null,
		});

		expect(result.badges.map((b) => b.id)).toEqual([3, 2, 1]);
		expect(result.favoriteBadgeIds).toBeNull();
	});

	it("places favorites first in order for supporters", () => {
		const result = sortBadgesByFavorites({
			favoriteBadgeIds: [2, 1],
			badges: [badge(1), badge(2), badge(3)],
			patronTier: 2,
		});

		expect(result.badges.map((b) => b.id)).toEqual([2, 1, 3]);
		expect(result.favoriteBadgeIds).toEqual([2, 1]);
	});

	it("limits non-supporters to one favorite", () => {
		const result = sortBadgesByFavorites({
			favoriteBadgeIds: [2, 3],
			badges: [badge(1), badge(2), badge(3)],
			patronTier: null,
		});

		expect(result.favoriteBadgeIds).toEqual([2]);
		expect(result.badges[0].id).toBe(2);
	});

	it("filters out unowned favorite badge ids", () => {
		const result = sortBadgesByFavorites({
			favoriteBadgeIds: [99, 1],
			badges: [badge(1), badge(2)],
			patronTier: 2,
		});

		expect(result.favoriteBadgeIds).toEqual([1]);
	});

	it("returns null favoriteBadgeIds when all favorites are unowned", () => {
		const result = sortBadgesByFavorites({
			favoriteBadgeIds: [99],
			badges: [badge(1), badge(2)],
			patronTier: 2,
		});

		expect(result.favoriteBadgeIds).toBeNull();
	});
});
