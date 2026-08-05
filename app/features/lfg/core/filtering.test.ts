import { describe, expect, test } from "vitest";
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
});
