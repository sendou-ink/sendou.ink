import { add, sub } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as ScrimPostFactory from "~/db/seed/factories/ScrimPostFactory";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { DuplicateEntryError } from "~/utils/errors";
import * as ScrimPostRepository from "./ScrimPostRepository.server";

const users = UserFactory.pool();

const BOOKED_AT = add(new Date(), { hours: 10 });

const dbTs = (date: Date) => dateToDatabaseTimestamp(date);

const WINDOW = {
	startTime: dbTs(sub(BOOKED_AT, { hours: 1 })),
	endTime: dbTs(add(BOOKED_AT, { hours: 1 })),
};

describe("findPendingOverlapsForUsers", () => {
	beforeEach(async () => {
		await users.create(5);
	});

	test("returns a specific-time pending post in window with its member ids", async () => {
		const { id: postId } = await ScrimPostFactory.create({
			startsAt: dbTs(BOOKED_AT),
			users: [
				{ userId: users.id(1), isOwner: 1 },
				{ userId: users.id(2), isOwner: 0 },
			],
		});

		const { posts } = await ScrimPostRepository.findPendingOverlapsForUsers({
			userIds: [users.id(1)],
			...WINDOW,
			excludePostId: -1,
		});

		expect(posts).toHaveLength(1);
		expect(posts[0]!.id).toBe(postId);
		expect(posts[0]!.memberIds.sort()).toEqual(
			[users.id(1), users.id(2)].sort(),
		);
	});

	test("returns a ranged post whose interval overlaps the window even if its start is outside", async () => {
		const { id: postId } = await ScrimPostFactory.create({
			startsAt: dbTs(sub(BOOKED_AT, { hours: 2 })),
			rangeEndsAt: dbTs(BOOKED_AT),
			users: [{ userId: users.id(1), isOwner: 1 }],
		});

		const { posts } = await ScrimPostRepository.findPendingOverlapsForUsers({
			userIds: [users.id(1)],
			...WINDOW,
			excludePostId: -1,
		});

		expect(posts.map((p) => p.id)).toEqual([postId]);
	});

	test("does not return a ranged post whose interval does not overlap the window", async () => {
		await ScrimPostFactory.create({
			startsAt: dbTs(sub(BOOKED_AT, { hours: 5 })),
			rangeEndsAt: dbTs(sub(BOOKED_AT, { hours: 3 })),
			users: [{ userId: users.id(1), isOwner: 1 }],
		});

		const { posts } = await ScrimPostRepository.findPendingOverlapsForUsers({
			userIds: [users.id(1)],
			...WINDOW,
			excludePostId: -1,
		});

		expect(posts).toHaveLength(0);
	});

	test("excludes the just-booked post even when it overlaps", async () => {
		const { id: postId } = await ScrimPostFactory.create({
			startsAt: dbTs(BOOKED_AT),
			users: [{ userId: users.id(1), isOwner: 1 }],
		});

		const { posts } = await ScrimPostRepository.findPendingOverlapsForUsers({
			userIds: [users.id(1)],
			...WINDOW,
			excludePostId: postId,
		});

		expect(posts).toHaveLength(0);
	});

	test("does not return posts that involve none of the given users", async () => {
		await ScrimPostFactory.create({
			startsAt: dbTs(BOOKED_AT),
			users: [{ userId: users.id(3), isOwner: 1 }],
		});

		const { posts } = await ScrimPostRepository.findPendingOverlapsForUsers({
			userIds: [users.id(1), users.id(2)],
			...WINDOW,
			excludePostId: -1,
		});

		expect(posts).toHaveLength(0);
	});

	test("excludes already-accepted (booked) posts", async () => {
		await ScrimPostFactory.create(
			{
				startsAt: dbTs(BOOKED_AT),
				users: [{ userId: users.id(1), isOwner: 1 }],
			},
			{
				requests: [
					{
						users: [{ userId: users.id(3), isOwner: 1 }],
						startsAt: dbTs(BOOKED_AT),
						isAccepted: true,
					},
				],
			},
		);

		const { posts, requestIds } =
			await ScrimPostRepository.findPendingOverlapsForUsers({
				userIds: [users.id(1), users.id(3)],
				...WINDOW,
				excludePostId: -1,
			});

		expect(posts).toHaveLength(0);
		expect(requestIds).toHaveLength(0);
	});

	test("returns pending request ids whose effective time falls in the window", async () => {
		const { id: postId } = await ScrimPostFactory.create(
			{
				startsAt: dbTs(add(BOOKED_AT, { hours: 3 })),
				users: [{ userId: users.id(3), isOwner: 1 }],
			},
			{
				requests: [
					{
						users: [{ userId: users.id(1), isOwner: 1 }],
						startsAt: dbTs(BOOKED_AT),
					},
				],
			},
		);
		const post = await ScrimPostRepository.findById(postId);
		const requestId = post!.requests[0]!.id;

		const { posts, requestIds } =
			await ScrimPostRepository.findPendingOverlapsForUsers({
				userIds: [users.id(1)],
				...WINDOW,
				excludePostId: -1,
			});

		expect(posts).toHaveLength(0);
		expect(requestIds).toEqual([requestId]);
	});

	test("does not return pending requests whose effective time is outside the window", async () => {
		await ScrimPostFactory.create(
			{
				startsAt: dbTs(add(BOOKED_AT, { hours: 3 })),
				users: [{ userId: users.id(3), isOwner: 1 }],
			},
			{
				requests: [
					{
						users: [{ userId: users.id(1), isOwner: 1 }],
						startsAt: dbTs(add(BOOKED_AT, { hours: 3 })),
					},
				],
			},
		);

		const { requestIds } =
			await ScrimPostRepository.findPendingOverlapsForUsers({
				userIds: [users.id(1)],
				...WINDOW,
				excludePostId: -1,
			});

		expect(requestIds).toHaveLength(0);
	});
});

describe("findUserScrims", () => {
	beforeEach(async () => {
		await users.create(5);
	});

	test("passed-over requester does not see the scrim booked between the post and another team", async () => {
		await ScrimPostFactory.create(
			{
				startsAt: dbTs(BOOKED_AT),
				users: [{ userId: users.id(3), isOwner: 1 }],
			},
			{
				requests: [
					{
						users: [
							{ userId: users.id(1), isOwner: 1 },
							{ userId: users.id(2), isOwner: 0 },
						],
					},
					{
						users: [
							{ userId: users.id(4), isOwner: 1 },
							{ userId: users.id(5), isOwner: 0 },
						],
						isAccepted: true,
					},
				],
			},
		);

		const passedOverRequesterScrims = await ScrimPostRepository.findUserScrims(
			users.id(1),
		);

		expect(passedOverRequesterScrims).toHaveLength(0);
	});

	test("post owner sees the accepted request's side as the opponent", async () => {
		await ScrimPostFactory.create(
			{
				startsAt: dbTs(BOOKED_AT),
				users: [{ userId: users.id(3), isOwner: 1 }],
			},
			{
				requests: [
					{ users: [{ userId: users.id(1), isOwner: 1 }] },
					{ users: [{ userId: users.id(4), isOwner: 1 }], isAccepted: true },
				],
			},
		);

		const postOwnerScrims = await ScrimPostRepository.findUserScrims(
			users.id(3),
		);

		expect(postOwnerScrims).toHaveLength(1);
		expect(postOwnerScrims[0]!.status).toBe("booked");
	});
});

describe("insertRequest", () => {
	beforeEach(async () => {
		await users.create(5);
	});

	const insertTeamRequest = ({
		scrimPostId,
		teamId,
		userId,
	}: {
		scrimPostId: number;
		teamId: number;
		userId: number;
	}) =>
		ScrimPostRepository.insertRequest({
			scrimPostId,
			teamId,
			message: null,
			startsAt: null,
			users: [{ userId, isOwner: 1 }],
		});

	test("throws if the team already has a request for the post", async () => {
		const { id: postId } = await ScrimPostFactory.create({
			startsAt: dbTs(BOOKED_AT),
			users: [{ userId: users.id(1), isOwner: 1 }],
		});
		const team = await TeamFactory.create({ memberUserIds: [users.id(2)] });

		await insertTeamRequest({
			scrimPostId: postId,
			teamId: team.id,
			userId: users.id(2),
		});

		await expect(
			insertTeamRequest({
				scrimPostId: postId,
				teamId: team.id,
				userId: users.id(3),
			}),
		).rejects.toThrowError(DuplicateEntryError);

		const post = await ScrimPostRepository.findById(postId);
		expect(post!.requests).toHaveLength(1);
	});

	test("allows the team to request another post", async () => {
		const { id: postId } = await ScrimPostFactory.create({
			startsAt: dbTs(BOOKED_AT),
			users: [{ userId: users.id(1), isOwner: 1 }],
		});
		const { id: otherPostId } = await ScrimPostFactory.create({
			startsAt: dbTs(BOOKED_AT),
			users: [{ userId: users.id(4), isOwner: 1 }],
		});
		const team = await TeamFactory.create({ memberUserIds: [users.id(2)] });

		await insertTeamRequest({
			scrimPostId: postId,
			teamId: team.id,
			userId: users.id(2),
		});
		await insertTeamRequest({
			scrimPostId: otherPostId,
			teamId: team.id,
			userId: users.id(2),
		});

		const otherPost = await ScrimPostRepository.findById(otherPostId);
		expect(otherPost!.requests).toHaveLength(1);
	});
});
