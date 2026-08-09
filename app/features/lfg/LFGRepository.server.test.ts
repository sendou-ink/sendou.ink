import { describe, expect, test } from "vitest";
import * as LFGPostFactory from "~/db/seed/factories/LFGPostFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as LFGRepository from "./LFGRepository.server";

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

		// next monthly voting drops the author from the plus server: plusTier -> null.
		// Their own post must remain visible to them, otherwise DELETE_POST / BUMP_POST
		// (which resolve the post through findAllPosts) 404 and it can never be taken down.
		const afterDrop = await LFGRepository.findAllPosts({
			id: author.id,
			plusTier: null,
		});
		expect(afterDrop.map((post) => post.id)).toContain(postId);
	});
});
