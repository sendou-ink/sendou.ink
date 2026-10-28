import { beforeEach, describe, expect, test } from "bun:test";
import { sub } from "date-fns";
import * as LFGPostFactory from "~/db/seed/factories/LFGPostFactory";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { withNoUser, withUserId } from "~/utils/Test";
import { LFG } from "./lfg-constants";
import * as LFGRepository from "./LFGRepository.server";

const expired = () => sub(new Date(), { days: LFG.POST_FRESHNESS_DAYS + 1 });

const NO_FILTERS = {
	type: null,
	weapons: [],
	plusTier: null,
	language: null,
	timezones: null,
	postIds: null,
};

type BoardFilters = Parameters<
	typeof LFGRepository.findBoardPage
>[0]["filters"];

const boardPostIds = async (filters: Partial<BoardFilters> = {}) => {
	const { items } = await LFGRepository.findBoardPage({
		filters: { ...NO_FILTERS, ...filters },
		page: 1,
		pageSize: 100,
		containingPostId: null,
	});

	return items.map((post) => post.id);
};

describe("LFGRepository.findBoardPage visibility", () => {
	test("shows logged out visitors fresh unrestricted posts only", async () => {
		const author = await UserFactory.create(null, { plusTier: 1 });
		const { id: postId } = await LFGPostFactory.create({
			type: "PLAYER_FOR_TEAM",
			authorId: author.id,
		});
		await LFGPostFactory.create(
			{ type: "PLAYER_FOR_COACH", authorId: author.id },
			{ updatedAt: expired() },
		);
		await LFGPostFactory.create({
			type: "COACH_FOR_TEAM",
			authorId: author.id,
			plusTierVisibility: 1,
		});

		expect(await withNoUser(() => boardPostIds())).toEqual([postId]);
	});

	test("shows the author their expired post, which they can still bump", async () => {
		const author = await UserFactory.create();
		const { id: postId } = await LFGPostFactory.create(
			{ type: "PLAYER_FOR_TEAM", authorId: author.id },
			{ updatedAt: expired() },
		);

		expect(await withUserId(author.id, () => boardPostIds())).toEqual([postId]);
	});

	test("hides an expired post from other viewers", async () => {
		const author = await UserFactory.create();
		const viewer = await UserFactory.create();
		await LFGPostFactory.create(
			{ type: "PLAYER_FOR_TEAM", authorId: author.id },
			{ updatedAt: expired() },
		);

		expect(await withUserId(viewer.id, () => boardPostIds())).toEqual([]);
	});

	test("shows a plus tier restricted post to a viewer with the tier or a better one", async () => {
		const author = await UserFactory.create(null, { plusTier: 2 });
		const viewer = await UserFactory.create(null, { plusTier: 1 });
		const { id: postId } = await LFGPostFactory.create({
			type: "PLAYER_FOR_TEAM",
			authorId: author.id,
			plusTierVisibility: 2,
		});

		expect(await withUserId(viewer.id, () => boardPostIds())).toEqual([postId]);
	});

	test("hides a plus tier restricted post from a viewer without the tier", async () => {
		const author = await UserFactory.create(null, { plusTier: 1 });
		const viewer = await UserFactory.create(null, { plusTier: 3 });
		await LFGPostFactory.create({
			type: "PLAYER_FOR_TEAM",
			authorId: author.id,
			plusTierVisibility: 2,
		});

		expect(await withUserId(viewer.id, () => boardPostIds())).toEqual([]);
	});

	test("puts the viewer's own posts first", async () => {
		const viewer = await UserFactory.create();
		const { id: ownPostId } = await LFGPostFactory.create(
			{ type: "PLAYER_FOR_TEAM", authorId: viewer.id },
			{ updatedAt: sub(new Date(), { days: 1 }) },
		);
		const { id: otherPostId } = await LFGPostFactory.create({
			type: "PLAYER_FOR_TEAM",
			authorId: (await UserFactory.create()).id,
		});

		expect(await withUserId(viewer.id, () => boardPostIds())).toEqual([
			ownPostId,
			otherPostId,
		]);
	});
});

describe("LFGRepository.findBoardPage filters", () => {
	const users = UserFactory.pool();
	const authorId = () => users.id(1);
	const teammateId = () => users.id(2);

	beforeEach(async () => {
		await users.create(2);
	});

	const anonBoardPostIds = (filters: Partial<BoardFilters>) =>
		withNoUser(() => boardPostIds(filters));

	const teamPost = async (memberUserIds = [authorId(), teammateId()]) => {
		const team = await TeamFactory.create({ memberUserIds });

		return LFGPostFactory.create({
			type: "TEAM_FOR_PLAYER",
			authorId: authorId(),
			teamId: team.id,
		});
	};

	test("weapons matches a team member playing another kit of the weapon", async () => {
		const tentatekPlayer = await UserFactory.create(null, {
			matchProfile: { weaponPool: [{ id: 41, isFavorite: false }] },
		});
		const { id: postId } = await teamPost([authorId(), tentatekPlayer.id]);

		expect(await anonBoardPostIds({ weapons: [40] })).toEqual([postId]);
		expect(await anonBoardPostIds({ weapons: [1000] })).toEqual([]);
	});

	test("weapons never matches a coach post", async () => {
		const coach = await UserFactory.create(null, {
			matchProfile: { weaponPool: [{ id: 40, isFavorite: false }] },
		});
		await LFGPostFactory.create({ type: "COACH_FOR_TEAM", authorId: coach.id });

		expect(await anonBoardPostIds({ weapons: [40] })).toEqual([]);
	});

	test("plusTier matches a post whose team member is in a better plus server", async () => {
		const plusMember = await UserFactory.create(null, { plusTier: 1 });
		const { id: postId } = await teamPost([authorId(), plusMember.id]);

		expect(await anonBoardPostIds({ plusTier: 2 })).toEqual([postId]);
	});

	test("language matches posts listing the language", async () => {
		const { id: postId } = await LFGPostFactory.create({
			type: "PLAYER_FOR_TEAM",
			authorId: authorId(),
			languages: JSON.stringify(["fi", "en"]),
		});
		await LFGPostFactory.create({
			type: "PLAYER_FOR_TEAM",
			authorId: teammateId(),
		});

		expect(await anonBoardPostIds({ language: "en" })).toEqual([postId]);
	});

	test("timezones matches posts in one of the timezones", async () => {
		const { id: postId } = await LFGPostFactory.create({
			type: "PLAYER_FOR_TEAM",
			authorId: authorId(),
			timezone: "Asia/Tokyo",
		});

		expect(await anonBoardPostIds({ timezones: ["Asia/Tokyo"] })).toEqual([
			postId,
		]);
		expect(await anonBoardPostIds({ timezones: [] })).toEqual([]);
	});

	test("postIds matches the listed posts only", async () => {
		const { id: postId } = await LFGPostFactory.create({
			type: "PLAYER_FOR_TEAM",
			authorId: authorId(),
		});
		await LFGPostFactory.create({
			type: "PLAYER_FOR_TEAM",
			authorId: teammateId(),
		});

		expect(await anonBoardPostIds({ postIds: [postId] })).toEqual([postId]);
	});
});

describe("LFGRepository.findVisibleById", () => {
	test("still returns the author's own post after they lose their plus tier", async () => {
		// the monthly voting can drop the author from the plus server they restricted the post to,
		// the post must stay visible or DELETE_POST / BUMP_POST 404 forever
		const author = await UserFactory.create();
		const { id: postId } = await LFGPostFactory.create({
			type: "PLAYER_FOR_TEAM",
			authorId: author.id,
			plusTierVisibility: 2,
		});

		const post = await withUserId(author.id, () =>
			LFGRepository.findVisibleById(postId),
		);

		expect(post?.permissions.EDIT).toEqual([author.id]);
	});
});

describe("LFGRepository.findAllVisibleParticipantIds", () => {
	test("lists the author and the team members of a team post", async () => {
		const [author, teammate] = await UserFactory.createMany(2);
		const team = await TeamFactory.create({
			memberUserIds: [author.id, teammate.id],
		});
		await LFGPostFactory.create({
			type: "TEAM_FOR_PLAYER",
			authorId: author.id,
			teamId: team.id,
		});

		const [post] = await withNoUser(() =>
			LFGRepository.findAllVisibleParticipantIds(),
		);

		expect(new Set(post.participantIds)).toEqual(
			new Set([author.id, teammate.id]),
		);
	});
});

describe("LFGRepository.findByAuthorUserId", () => {
	test("hides an expired post from other viewers", async () => {
		const author = await UserFactory.create();
		const viewer = await UserFactory.create();

		await LFGPostFactory.create(
			{ type: "PLAYER_FOR_TEAM", authorId: author.id },
			{ updatedAt: expired() },
		);

		const posts = await withUserId(viewer.id, () =>
			LFGRepository.findByAuthorUserId(author.id),
		);

		expect(posts).toHaveLength(0);
	});

	test("hides an expired post from logged out viewers", async () => {
		const author = await UserFactory.create();

		await LFGPostFactory.create(
			{ type: "PLAYER_FOR_TEAM", authorId: author.id },
			{ updatedAt: expired() },
		);

		const posts = await withNoUser(() =>
			LFGRepository.findByAuthorUserId(author.id),
		);

		expect(posts).toHaveLength(0);
	});

	test("shows an expired post to its author, who can still bump it", async () => {
		const author = await UserFactory.create();

		const { id: postId } = await LFGPostFactory.create(
			{ type: "PLAYER_FOR_TEAM", authorId: author.id },
			{ updatedAt: expired() },
		);

		const posts = await withUserId(author.id, () =>
			LFGRepository.findByAuthorUserId(author.id),
		);

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

		const posts = await withUserId(viewer.id, () =>
			LFGRepository.findByAuthorUserId(author.id),
		);

		expect(posts).toHaveLength(0);
	});

	test("returns a fresh post to any viewer", async () => {
		const author = await UserFactory.create();

		const { id: postId } = await LFGPostFactory.create({
			type: "PLAYER_FOR_TEAM",
			authorId: author.id,
		});

		const posts = await withNoUser(() =>
			LFGRepository.findByAuthorUserId(author.id),
		);

		expect(posts.map((post) => post.id)).toEqual([postId]);
	});
});
