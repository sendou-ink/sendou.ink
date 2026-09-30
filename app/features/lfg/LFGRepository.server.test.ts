import { sub } from "date-fns";
import { describe, expect, test } from "vitest";
import * as LFGPostFactory from "~/db/seed/factories/LFGPostFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as LFGRepository from "./LFGRepository.server";
import { LFG } from "./lfg-constants";

describe("LFGRepository.findAllPosts plus-tier visibility", () => {
	test("still returns the author's own post after they lose their plus tier", async () => {
		const author = await UserFactory.create(null, { plusTier: 2 });

		const { id: postId } = await LFGPostFactory.create({
			type: "PLAYER_FOR_TEAM",
			authorId: author.id,
			plusTierVisibility: 2,
		});

		// while +2, the author can of course see (and thus manage) their own post
		const whileMember = await LFGRepository.findAllPosts({
			id: author.id,
			plusTier: 2,
		});
		expect(whileMember.map((post) => post.id)).toContain(postId);

		// monthly voting drops the author from the plus server (plusTier -> null); their own post
		// must stay visible or DELETE_POST / BUMP_POST (resolved through findAllPosts) 404 forever
		const afterDrop = await LFGRepository.findAllPosts({
			id: author.id,
			plusTier: null,
		});
		expect(afterDrop.map((post) => post.id)).toContain(postId);
	});
});

describe("LFGRepository.findByAuthorUserId", () => {
	const expired = () => sub(new Date(), { days: LFG.POST_FRESHNESS_DAYS + 1 });

	test("hides an expired post from other viewers", async () => {
		const author = await UserFactory.create();
		const viewer = await UserFactory.create();

		await LFGPostFactory.create(
			{ type: "PLAYER_FOR_TEAM", authorId: author.id },
			{ updatedAt: expired() },
		);

		const posts = await LFGRepository.findByAuthorUserId(author.id, {
			id: viewer.id,
			plusTier: null,
		});

		expect(posts).toHaveLength(0);
	});

	test("hides an expired post from logged out viewers", async () => {
		const author = await UserFactory.create();

		await LFGPostFactory.create(
			{ type: "PLAYER_FOR_TEAM", authorId: author.id },
			{ updatedAt: expired() },
		);

		expect(await LFGRepository.findByAuthorUserId(author.id)).toHaveLength(0);
	});

	test("shows an expired post to its author, who can still bump it", async () => {
		const author = await UserFactory.create();

		const { id: postId } = await LFGPostFactory.create(
			{ type: "PLAYER_FOR_TEAM", authorId: author.id },
			{ updatedAt: expired() },
		);

		const posts = await LFGRepository.findByAuthorUserId(author.id, {
			id: author.id,
			plusTier: null,
		});

		expect(posts.map((post) => post.id)).toEqual([postId]);
	});

	test("hides a plus tier restricted post from a viewer without the tier", async () => {
		const author = await UserFactory.create(null, { plusTier: 1 });
		const viewer = await UserFactory.create(null, { plusTier: 3 });

		await LFGPostFactory.create({
			type: "PLAYER_FOR_TEAM",
			authorId: author.id,
			plusTierVisibility: 2,
		});

		expect(
			await LFGRepository.findByAuthorUserId(author.id, {
				id: viewer.id,
				plusTier: 3,
			}),
		).toHaveLength(0);
	});

	test("returns a fresh post to any viewer", async () => {
		const author = await UserFactory.create();

		const { id: postId } = await LFGPostFactory.create({
			type: "PLAYER_FOR_TEAM",
			authorId: author.id,
		});

		const posts = await LFGRepository.findByAuthorUserId(author.id);

		expect(posts.map((post) => post.id)).toEqual([postId]);
	});
});
