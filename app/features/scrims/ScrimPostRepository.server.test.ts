import { add, sub } from "date-fns";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { dbInsertUsers, dbReset } from "~/utils/Test";
import * as ScrimPostRepository from "./ScrimPostRepository.server";

const BOOKED_AT = add(new Date(), { hours: 10 });

const dbTs = (date: Date) => dateToDatabaseTimestamp(date);

const WINDOW = {
	startTime: dbTs(sub(BOOKED_AT, { hours: 1 })),
	endTime: dbTs(add(BOOKED_AT, { hours: 1 })),
};

function insertPost({
	at,
	rangeEnd = null,
	users,
}: {
	at: Date;
	rangeEnd?: Date | null;
	users: Array<{ userId: number; isOwner: 0 | 1 }>;
}) {
	return ScrimPostRepository.insert({
		at: dbTs(at),
		rangeEnd: rangeEnd ? dbTs(rangeEnd) : null,
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

	afterEach(() => {
		dbReset();
	});

	test("returns a specific-time pending post in window with its member ids", async () => {
		const postId = await insertPost({
			at: BOOKED_AT,
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
			at: sub(BOOKED_AT, { hours: 2 }),
			rangeEnd: BOOKED_AT,
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
			at: sub(BOOKED_AT, { hours: 5 }),
			rangeEnd: sub(BOOKED_AT, { hours: 3 }),
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
			at: BOOKED_AT,
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
			at: BOOKED_AT,
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
			at: BOOKED_AT,
			users: [{ userId: 1, isOwner: 1 }],
		});
		await ScrimPostRepository.insertRequest({
			scrimPostId: postId,
			teamId: null,
			message: null,
			at: dbTs(BOOKED_AT),
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
			at: add(BOOKED_AT, { hours: 3 }),
			users: [{ userId: 3, isOwner: 1 }],
		});
		await ScrimPostRepository.insertRequest({
			scrimPostId: postId,
			teamId: null,
			message: null,
			at: dbTs(BOOKED_AT),
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
			at: add(BOOKED_AT, { hours: 3 }),
			users: [{ userId: 3, isOwner: 1 }],
		});
		await ScrimPostRepository.insertRequest({
			scrimPostId: postId,
			teamId: null,
			message: null,
			at: dbTs(add(BOOKED_AT, { hours: 3 })),
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
