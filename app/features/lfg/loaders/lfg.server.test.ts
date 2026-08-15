import { beforeEach, describe, expect, test } from "vitest";
import * as LFGPostFactory from "~/db/seed/factories/LFGPostFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import type { SerializeFrom } from "~/utils/remix";
import { wrappedLoader } from "~/utils/Test";
import { LFG_PAGE } from "~/utils/urls";
import * as LFGRepository from "../LFGRepository.server";
import { LFG } from "../lfg-constants";
import { lfgSearchParams } from "../lfg-search-params";
import { loader } from "./lfg.server";

const users = UserFactory.pool();

const lfgLoader = wrappedLoader<SerializeFrom<typeof loader>>({ loader });

// one post per author per type is all the database allows
const createPlayerPosts = async () => {
	for (const authorId of users.ids()) {
		await LFGPostFactory.create({ authorId, type: "PLAYER_FOR_TEAM" });
	}
};

const orderedPostIds = async () =>
	(await LFGRepository.findAllPosts()).map((post) => post.id);

const postIds = (data: SerializeFrom<typeof loader>) =>
	data.posts.map((post) => post.id);

describe("lfg loader", () => {
	beforeEach(async () => {
		await users.create(LFG.POSTS_PER_PAGE + 2);
	});

	test("slices the posts of the page asked for", async () => {
		await createPlayerPosts();
		const allIds = await orderedPostIds();

		const firstPage = await lfgLoader({ url: LFG_PAGE });
		const secondPage = await lfgLoader({
			url: lfgSearchParams.href(LFG_PAGE, { page: 2 }),
		});

		expect(firstPage.pagesCount).toBe(2);
		expect(postIds(firstPage)).toEqual(allIds.slice(0, LFG.POSTS_PER_PAGE));
		expect(postIds(secondPage)).toEqual(allIds.slice(LFG.POSTS_PER_PAGE));
	});

	test("serves the page containing the linked post", async () => {
		await createPlayerPosts();
		const linkedPostId = (await orderedPostIds())[LFG.POSTS_PER_PAGE];

		const data = await lfgLoader({
			url: lfgSearchParams.href(LFG_PAGE, { post: linkedPostId }),
		});

		expect(data.currentPage).toBe(2);
		expect(postIds(data)).toContain(linkedPostId);
	});

	test("falls back to the page param when the linked post is filtered out", async () => {
		await createPlayerPosts();
		const { id: coachPostId } = await LFGPostFactory.create({
			authorId: users.id(1),
			type: "COACH_FOR_TEAM",
		});

		const data = await lfgLoader({
			url: lfgSearchParams.href(LFG_PAGE, {
				post: coachPostId,
				type: "PLAYER_FOR_TEAM",
				page: 2,
			}),
		});

		expect(data.currentPage).toBe(2);
		expect(postIds(data)).not.toContain(coachPostId);
	});

	test("falls back to the page param when the linked post does not exist", async () => {
		await createPlayerPosts();

		const data = await lfgLoader({
			url: lfgSearchParams.href(LFG_PAGE, { post: 999_999 }),
		});

		expect(data.currentPage).toBe(1);
	});
});
