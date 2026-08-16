import { describe, expect, test } from "vitest";
import type { LFGFilterValues } from "../lfg-types";
import { type FilterablePost, filterPosts } from "./filtering";

const postOfType = (type: FilterablePost["type"]) =>
	({
		type,
		author: { weaponPool: [] },
		team: null,
	}) as unknown as FilterablePost;

const noFilters: LFGFilterValues = {
	weapons: [],
	type: null,
	timezone: null,
	language: null,
	plusTier: null,
	minTier: null,
	maxTier: null,
};

describe("filterPosts", () => {
	test("no weapons selected shows every post", () => {
		const posts = [postOfType("PLAYER_FOR_TEAM"), postOfType("COACH_FOR_TEAM")];

		const filtered = filterPosts(posts, noFilters, {
			tiersMap: new Map(),
			viewerTimezone: null,
		});

		expect(filtered).toHaveLength(2);
	});

	describe("timezone filter", () => {
		test("shows a post from across the date line when local clock times match", () => {
			// Pacific/Kiritimati (UTC+14) and Pacific/Honolulu (UTC-10) share the
			// exact same local clock time year round
			const post = {
				...postOfType("PLAYER_FOR_TEAM"),
				timezone: "Pacific/Kiritimati",
			};

			const filtered = filterPosts(
				[post],
				{ ...noFilters, timezone: 3 },
				{
					tiersMap: new Map(),
					viewerTimezone: "Pacific/Honolulu",
				},
			);

			expect(filtered).toHaveLength(1);
		});

		test("skips the timezone filter when the viewer's timezone is unknown", () => {
			const post = {
				...postOfType("PLAYER_FOR_TEAM"),
				timezone: "Asia/Tokyo",
			};

			const filtered = filterPosts(
				[post],
				{ ...noFilters, timezone: 0 },
				{
					tiersMap: new Map(),
					viewerTimezone: null,
				},
			);

			expect(filtered).toHaveLength(1);
		});
	});
});
