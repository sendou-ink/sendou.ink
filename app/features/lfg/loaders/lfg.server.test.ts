import { beforeEach, describe, expect, test, vi } from "bun:test";
import * as LFGPostFactory from "~/db/seed/factories/LFGPostFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as Seasons from "~/features/mmr/core/Seasons";
import type { TierName } from "~/features/mmr/mmr-constants";
import type { TieredSkill } from "~/features/mmr/tiered.server";
import * as TieredServer from "~/features/mmr/tiered.server";
import { viewerTimezoneAsyncLocalStorage } from "~/features/timezone/timezone-context.server";
import type { SerializeFrom } from "~/utils/remix";
import { withNoUser, wrappedLoader } from "~/utils/Test";
import { LFG_PAGE } from "~/utils/urls";
import { LFG } from "../lfg-constants";
import { lfgSearchParams } from "../lfg-search-params";
import * as LFGRepository from "../LFGRepository.server";
import { loader } from "./lfg.server";

const skillsBySeason = new Map<number, Record<number, TieredSkill>>();

// tiers derived from real skills depend on the whole season's distribution
vi.mock("~/features/mmr/tiered.server", () => ({
	...TieredServer,
	userSkills: async (season: number) => ({
		userSkills: skillsBySeason.get(season) ?? {},
	}),
}));

const users = UserFactory.pool();

const lfgLoader = wrappedLoader<SerializeFrom<typeof loader>>({ loader });

// one post per author per type is all the database allows
const createPlayerPosts = async () => {
	for (const authorId of users.ids()) {
		await LFGPostFactory.create({ authorId, type: "PLAYER_FOR_TEAM" });
	}
};

// the board's order for a logged out visitor, whom the loader is called as
const orderedPostIds = async () => {
	const { items } = await withNoUser(() =>
		LFGRepository.findBoardPage({
			filters: {
				type: null,
				weapons: [],
				plusTier: null,
				language: null,
				timezones: null,
				postIds: null,
			},
			page: 1,
			pageSize: 100,
			containingPostId: null,
		}),
	);

	return items.map((post) => post.id);
};

const postIds = (data: SerializeFrom<typeof loader>) =>
	data.posts.map((post) => post.id);

const latestSeason = () => Seasons.currentOrPrevious()!.nth;

const giveTier = (
	userId: number,
	tierName: TierName,
	{
		season = latestSeason(),
		approximate = false,
	}: { season?: number; approximate?: boolean } = {},
) => {
	skillsBySeason.set(season, {
		...skillsBySeason.get(season),
		[userId]: {
			ordinal: 0,
			tier: { name: tierName, isPlus: false },
			approximate,
		},
	});
};

describe("lfg loader", () => {
	beforeEach(async () => {
		skillsBySeason.clear();
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

	describe("tier filter", () => {
		test.each([
			{
				why: "min tier, better tier",
				tier: "DIAMOND",
				filters: { minTier: "GOLD" },
				shown: true,
			},
			{
				why: "min tier, worse tier",
				tier: "IRON",
				filters: { minTier: "GOLD" },
				shown: false,
			},
			{
				why: "max tier, worse tier",
				tier: "IRON",
				filters: { maxTier: "GOLD" },
				shown: true,
			},
			{
				why: "max tier, better tier",
				tier: "DIAMOND",
				filters: { maxTier: "GOLD" },
				shown: false,
			},
			{
				why: "both, tier within",
				tier: "GOLD",
				filters: { minTier: "SILVER", maxTier: "PLATINUM" },
				shown: true,
			},
			{
				why: "both, tier above",
				tier: "DIAMOND",
				filters: { minTier: "SILVER", maxTier: "PLATINUM" },
				shown: false,
			},
			{
				why: "both, tier below",
				tier: "IRON",
				filters: { minTier: "SILVER", maxTier: "PLATINUM" },
				shown: false,
			},
		] as const)("$why", async ({ tier, filters, shown }) => {
			giveTier(users.id(1), tier);
			const { id: postId } = await LFGPostFactory.create({
				authorId: users.id(1),
				type: "PLAYER_FOR_TEAM",
			});

			const data = await lfgLoader({
				url: lfgSearchParams.href(LFG_PAGE, filters),
			});

			expect(postIds(data).includes(postId)).toBe(shown);
		});

		test("excludes a post whose author has no tier", async () => {
			const { id: postId } = await LFGPostFactory.create({
				authorId: users.id(1),
				type: "PLAYER_FOR_TEAM",
			});

			const data = await lfgLoader({
				url: lfgSearchParams.href(LFG_PAGE, { minTier: "IRON" }),
			});

			expect(postIds(data)).not.toContain(postId);
		});

		test("ignores an approximate tier", async () => {
			giveTier(users.id(1), "DIAMOND", { approximate: true });
			const { id: postId } = await LFGPostFactory.create({
				authorId: users.id(1),
				type: "PLAYER_FOR_TEAM",
			});

			const data = await lfgLoader({
				url: lfgSearchParams.href(LFG_PAGE, { minTier: "GOLD" }),
			});

			expect(postIds(data)).not.toContain(postId);
		});

		test("matches a tier from the previous season only", async () => {
			giveTier(users.id(1), "DIAMOND", { season: latestSeason() - 1 });
			const { id: postId } = await LFGPostFactory.create({
				authorId: users.id(1),
				type: "PLAYER_FOR_TEAM",
			});

			const data = await lfgLoader({
				url: lfgSearchParams.href(LFG_PAGE, { minTier: "GOLD" }),
			});

			expect(postIds(data)).toContain(postId);
		});

		test("excludes coach posts", async () => {
			giveTier(users.id(1), "DIAMOND");
			const { id: postId } = await LFGPostFactory.create({
				authorId: users.id(1),
				type: "COACH_FOR_TEAM",
			});

			const data = await lfgLoader({
				url: lfgSearchParams.href(LFG_PAGE, { minTier: "GOLD" }),
			});

			expect(postIds(data)).not.toContain(postId);
		});
	});

	describe("timezone filter", () => {
		const createPostsInTimezones = async () => {
			const [kiritimati, honolulu, tokyo] = await Promise.all(
				["Pacific/Kiritimati", "Pacific/Honolulu", "Asia/Tokyo"].map(
					(timezone, i) =>
						LFGPostFactory.create({
							authorId: users.id(i + 1),
							type: "PLAYER_FOR_TEAM",
							timezone,
						}),
				),
			);

			return {
				kiritimati: kiritimati.id,
				honolulu: honolulu.id,
				tokyo: tokyo.id,
			};
		};

		test("shows every post when the viewer's timezone is unknown", async () => {
			const posts = await createPostsInTimezones();

			const data = await lfgLoader({
				url: lfgSearchParams.href(LFG_PAGE, { timezone: 0 }),
			});

			expect(postIds(data)).toEqual(
				expect.arrayContaining(Object.values(posts)),
			);
		});

		test("compares local clock times across the date line", async () => {
			const posts = await createPostsInTimezones();

			const data = await viewerTimezoneAsyncLocalStorage.run(
				{ timezone: "Pacific/Honolulu" },
				() =>
					lfgLoader({
						url: lfgSearchParams.href(LFG_PAGE, { timezone: 0 }),
					}),
			);

			expect(postIds(data).sort()).toEqual(
				[posts.kiritimati, posts.honolulu].sort(),
			);
		});
	});
});
