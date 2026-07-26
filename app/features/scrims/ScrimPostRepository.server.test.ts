import { add, sub } from "date-fns";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { DuplicateEntryError } from "~/utils/errors";
import { dbInsertUsers, dbReset } from "~/utils/Test";
import * as ScrimPostRepository from "./ScrimPostRepository.server";

const BOOKED_AT = add(new Date(), { hours: 10 });

const dbTs = (date: Date) => dateToDatabaseTimestamp(date);

const WINDOW = {
	startTime: dbTs(sub(BOOKED_AT, { hours: 1 })),
	endTime: dbTs(add(BOOKED_AT, { hours: 1 })),
};

function insertPost({
	startsAt,
	rangeEndsAt = null,
	users,
}: {
	startsAt: Date;
	rangeEndsAt?: Date | null;
	users: Array<{ userId: number; isOwner: 0 | 1 }>;
}) {
	return ScrimPostRepository.insert({
		startsAt: dbTs(startsAt),
		rangeEndsAt: rangeEndsAt ? dbTs(rangeEndsAt) : null,
		maxDiv: null,
		minDiv: null,
		teamId: null,
		text: null,
		maps: null,
		mapsTournamentId: null,
		users,
		visibility: null,
		managedByAnyone: false,
		isScheduledForFuture: false,
	});
}

describe("findPendingOverlapsForUsers", () => {
	beforeEach(async () => {
		await dbInsertUsers(5);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("returns a specific-time pending post in window with its member ids", async () => {
		const postId = await insertPost({
			startsAt: BOOKED_AT,
			users: [
				{ userId: 1, isOwner: 1 },
				{ userId: 2, isOwner: 0 },
			],
		});

		const { posts } = await ScrimPostRepository.findPendingOverlapsForUsers({
			userIds: [1],
			...WINDOW,
			excludePostId: -1,
		});

		expect(posts).toHaveLength(1);
		expect(posts[0]!.id).toBe(postId);
		expect(posts[0]!.memberIds.sort()).toEqual([1, 2]);
	});

	test("returns a ranged post whose interval overlaps the window even if its start is outside", async () => {
		const postId = await insertPost({
			startsAt: sub(BOOKED_AT, { hours: 2 }),
			rangeEndsAt: BOOKED_AT,
			users: [{ userId: 1, isOwner: 1 }],
		});

		const { posts } = await ScrimPostRepository.findPendingOverlapsForUsers({
			userIds: [1],
			...WINDOW,
			excludePostId: -1,
		});

		expect(posts.map((p) => p.id)).toEqual([postId]);
	});

	test("does not return a ranged post whose interval does not overlap the window", async () => {
		await insertPost({
			startsAt: sub(BOOKED_AT, { hours: 5 }),
			rangeEndsAt: sub(BOOKED_AT, { hours: 3 }),
			users: [{ userId: 1, isOwner: 1 }],
		});

		const { posts } = await ScrimPostRepository.findPendingOverlapsForUsers({
			userIds: [1],
			...WINDOW,
			excludePostId: -1,
		});

		expect(posts).toHaveLength(0);
	});

	test("excludes the just-booked post even when it overlaps", async () => {
		const postId = await insertPost({
			startsAt: BOOKED_AT,
			users: [{ userId: 1, isOwner: 1 }],
		});

		const { posts } = await ScrimPostRepository.findPendingOverlapsForUsers({
			userIds: [1],
			...WINDOW,
			excludePostId: postId,
		});

		expect(posts).toHaveLength(0);
	});

	test("does not return posts that involve none of the given users", async () => {
		await insertPost({
			startsAt: BOOKED_AT,
			users: [{ userId: 3, isOwner: 1 }],
		});

		const { posts } = await ScrimPostRepository.findPendingOverlapsForUsers({
			userIds: [1, 2],
			...WINDOW,
			excludePostId: -1,
		});

		expect(posts).toHaveLength(0);
	});

	test("excludes already-accepted (booked) posts", async () => {
		const postId = await insertPost({
			startsAt: BOOKED_AT,
			users: [{ userId: 1, isOwner: 1 }],
		});
		await ScrimPostRepository.insertRequest({
			scrimPostId: postId,
			teamId: null,
			message: null,
			startsAt: dbTs(BOOKED_AT),
			users: [{ userId: 3, isOwner: 1 }],
		});
		const post = await ScrimPostRepository.findById(postId);
		await ScrimPostRepository.acceptRequest(post!.requests[0]!.id);

		const { posts, requestIds } =
			await ScrimPostRepository.findPendingOverlapsForUsers({
				userIds: [1, 3],
				...WINDOW,
				excludePostId: -1,
			});

		expect(posts).toHaveLength(0);
		expect(requestIds).toHaveLength(0);
	});

	test("returns pending request ids whose effective time falls in the window", async () => {
		const postId = await insertPost({
			startsAt: add(BOOKED_AT, { hours: 3 }),
			users: [{ userId: 3, isOwner: 1 }],
		});
		await ScrimPostRepository.insertRequest({
			scrimPostId: postId,
			teamId: null,
			message: null,
			startsAt: dbTs(BOOKED_AT),
			users: [{ userId: 1, isOwner: 1 }],
		});
		const post = await ScrimPostRepository.findById(postId);
		const requestId = post!.requests[0]!.id;

		const { posts, requestIds } =
			await ScrimPostRepository.findPendingOverlapsForUsers({
				userIds: [1],
				...WINDOW,
				excludePostId: -1,
			});

		expect(posts).toHaveLength(0);
		expect(requestIds).toEqual([requestId]);
	});

	test("does not return pending requests whose effective time is outside the window", async () => {
		const postId = await insertPost({
			startsAt: add(BOOKED_AT, { hours: 3 }),
			users: [{ userId: 3, isOwner: 1 }],
		});
		await ScrimPostRepository.insertRequest({
			scrimPostId: postId,
			teamId: null,
			message: null,
			startsAt: dbTs(add(BOOKED_AT, { hours: 3 })),
			users: [{ userId: 1, isOwner: 1 }],
		});

		const { requestIds } =
			await ScrimPostRepository.findPendingOverlapsForUsers({
				userIds: [1],
				...WINDOW,
				excludePostId: -1,
			});

		expect(requestIds).toHaveLength(0);
	});
});

describe("findUserScrims", () => {
	beforeEach(async () => {
		await dbInsertUsers(5);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("passed-over requester does not see the scrim booked between the post and another team", async () => {
		const postId = await insertPost({
			startsAt: BOOKED_AT,
			users: [{ userId: 3, isOwner: 1 }],
		});
		await ScrimPostRepository.insertRequest({
			scrimPostId: postId,
			teamId: null,
			message: null,
			startsAt: null,
			users: [
				{ userId: 1, isOwner: 1 },
				{ userId: 2, isOwner: 0 },
			],
		});
		await ScrimPostRepository.insertRequest({
			scrimPostId: postId,
			teamId: null,
			message: null,
			startsAt: null,
			users: [
				{ userId: 4, isOwner: 1 },
				{ userId: 5, isOwner: 0 },
			],
		});

		const post = await ScrimPostRepository.findById(postId);
		const acceptedRequest = post!.requests.find((request) =>
			request.users.some((user) => user.id === 4),
		);
		await ScrimPostRepository.acceptRequest(acceptedRequest!.id);

		const passedOverRequesterScrims =
			await ScrimPostRepository.findUserScrims(1);

		expect(passedOverRequesterScrims).toHaveLength(0);
	});

	test("post owner sees the accepted request's side as the opponent", async () => {
		const postId = await insertPost({
			startsAt: BOOKED_AT,
			users: [{ userId: 3, isOwner: 1 }],
		});
		await ScrimPostRepository.insertRequest({
			scrimPostId: postId,
			teamId: null,
			message: null,
			startsAt: null,
			users: [{ userId: 1, isOwner: 1 }],
		});
		await ScrimPostRepository.insertRequest({
			scrimPostId: postId,
			teamId: null,
			message: null,
			startsAt: null,
			users: [{ userId: 4, isOwner: 1 }],
		});

		const post = await ScrimPostRepository.findById(postId);
		const acceptedRequest = post!.requests.find((request) =>
			request.users.some((user) => user.id === 4),
		);
		await ScrimPostRepository.acceptRequest(acceptedRequest!.id);

		const postOwnerScrims = await ScrimPostRepository.findUserScrims(3);

		expect(postOwnerScrims).toHaveLength(1);
		expect(postOwnerScrims[0]!.status).toBe("booked");
	});
});

describe("insertRequest", () => {
	beforeEach(async () => {
		await dbInsertUsers(5);
	});

	afterEach(async () => {
		await dbReset();
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
		const postId = await insertPost({
			startsAt: BOOKED_AT,
			users: [{ userId: 1, isOwner: 1 }],
		});
		const team = await TeamRepository.create({
			name: "Team Olive",
			ownerUserId: 2,
			isMainTeam: true,
		});

		await insertTeamRequest({
			scrimPostId: postId,
			teamId: team.id,
			userId: 2,
		});

		await expect(
			insertTeamRequest({ scrimPostId: postId, teamId: team.id, userId: 3 }),
		).rejects.toThrowError(DuplicateEntryError);

		const post = await ScrimPostRepository.findById(postId);
		expect(post!.requests).toHaveLength(1);
	});

	test("allows the team to request another post", async () => {
		const postId = await insertPost({
			startsAt: BOOKED_AT,
			users: [{ userId: 1, isOwner: 1 }],
		});
		const otherPostId = await insertPost({
			startsAt: BOOKED_AT,
			users: [{ userId: 4, isOwner: 1 }],
		});
		const team = await TeamRepository.create({
			name: "Team Olive",
			ownerUserId: 2,
			isMainTeam: true,
		});

		await insertTeamRequest({
			scrimPostId: postId,
			teamId: team.id,
			userId: 2,
		});
		await insertTeamRequest({
			scrimPostId: otherPostId,
			teamId: team.id,
			userId: 2,
		});

		const otherPost = await ScrimPostRepository.findById(otherPostId);
		expect(otherPost!.requests).toHaveLength(1);
	});
});
