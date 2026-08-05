import { afterEach, describe, expect, test, vi } from "vitest";
import type { LFGLoaderPost } from "../routes/lfg";
import { filterPosts } from "./filtering";

const postOfType = (type: LFGLoaderPost["type"]) =>
	({
		type,
		author: { weaponPool: [] },
		team: null,
	}) as unknown as LFGLoaderPost;

describe("filterPosts", () => {
	test("a weapon filter with no weapons selected shows every post", () => {
		const posts = [postOfType("PLAYER_FOR_TEAM"), postOfType("COACH_FOR_TEAM")];

		const filtered = filterPosts(
			posts,
			[{ _tag: "Weapon", weaponSplIds: [] }],
			new Map(),
		);

		expect(filtered).toHaveLength(2);
	});

	describe("timezone filter", () => {
		afterEach(() => {
			vi.restoreAllMocks();
		});

		const stubUserTimezone = (timeZone: string) => {
			vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
				resolvedOptions: () => ({ timeZone }),
			} as unknown as Intl.DateTimeFormat);
		};

		test("shows a post from across the date line when local clock times match", () => {
			// Pacific/Kiritimati (UTC+14) and Pacific/Honolulu (UTC-10) share the
			// exact same local clock time year round
			stubUserTimezone("Pacific/Honolulu");

			const post = {
				...postOfType("PLAYER_FOR_TEAM"),
				timezone: "Pacific/Kiritimati",
			};

			const filtered = filterPosts(
				[post],
				[{ _tag: "Timezone", maxHourDifference: 3 }],
				new Map(),
			);

			expect(filtered).toHaveLength(1);
		});
	});
});
