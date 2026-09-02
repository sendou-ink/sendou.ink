import { add, sub } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as ScrimPostFactory from "~/db/seed/factories/ScrimPostFactory";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { DuplicateEntryError } from "~/utils/errors";
import { withUserId } from "~/utils/Test";
import * as ScrimPostRepository from "./ScrimPostRepository.server";

const users = UserFactory.pool();

const BOOKED_AT = add(new Date(), { hours: 10 });

const dbTs = (date: Date) => dateToDatabaseTimestamp(date);

const WINDOW = {
	startTime: dbTs(sub(BOOKED_AT, { hours: 1 })),
	endTime: dbTs(add(BOOKED_AT, { hours: 1 })),
};

/**
 * A "flexible time" post whose window opened `windowOpensInMinutes` from now,
 * booked by a request that picked a start `bookedInMinutes` from now.
 */
async function createBookedRangeScrim({
	windowOpensInMinutes,
	bookedInMinutes,
}: {
	windowOpensInMinutes: number;
	bookedInMinutes: number;
}) {
	const now = new Date();
	const bookedAt = add(now, { minutes: bookedInMinutes });

	const { id } = await ScrimPostFactory.create(
		{
			startsAt: dbTs(add(now, { minutes: windowOpensInMinutes })),
			rangeEndsAt: dbTs(add(now, { minutes: windowOpensInMinutes + 120 })),
			users: [{ userId: users.id(1), isOwner: 1 }],
		},
		{
			requests: [
				{
					startsAt: dbTs(bookedAt),
					users: [{ userId: users.id(2), isOwner: 1 }],
					isAccepted: true,
				},
			],
		},
	);

	return { id, bookedAt: dbTs(bookedAt) };
}

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

	test("lists a booked range scrim whose post window opened before the booked start", async () => {
		const { id } = await createBookedRangeScrim({
			windowOpensInMinutes: -30,
			bookedInMinutes: 45,
		});

		const scrims = await ScrimPostRepository.findUserScrims(users.id(1));

		expect(scrims.map((scrim) => scrim.id)).toContain(id);
	});

	test("reports the booked start of a range scrim, not the start of its window", async () => {
		const { id, bookedAt } = await createBookedRangeScrim({
			windowOpensInMinutes: 30,
			bookedInMinutes: 90,
		});

		const scrims = await ScrimPostRepository.findUserScrims(users.id(2));
		const scrim = scrims.find((scrim) => scrim.id === id);

		expect(scrim?.status).toBe("booked");
		expect(scrim?.startsAt).toBe(bookedAt);
	});
});

describe("findAcceptedScrimsBetweenTwoTimestamps", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	const startingWithinTheHour = async () => {
		const now = new Date();

		return ScrimPostRepository.findAcceptedScrimsBetweenTwoTimestamps({
			startTime: now,
			endTime: add(now, { hours: 1 }),
			excludeRecentlyCreated: add(now, { minutes: 1 }),
		});
	};

	test("finds a range scrim booked to start inside the window", async () => {
		const { id } = await createBookedRangeScrim({
			windowOpensInMinutes: -30,
			bookedInMinutes: 45,
		});

		const scrims = await startingWithinTheHour();

		expect(scrims.map((scrim) => scrim.id)).toContain(id);
	});

	test("leaves out a range scrim booked to start after the window", async () => {
		const { id } = await createBookedRangeScrim({
			windowOpensInMinutes: 30,
			bookedInMinutes: 120,
		});

		const scrims = await startingWithinTheHour();

		expect(scrims.map((scrim) => scrim.id)).not.toContain(id);
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

describe("acceptRequest", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	const setupPostWithRequest = async ({
		requestStartsAt,
	}: {
		requestStartsAt?: Date;
	} = {}) => {
		const { id: postId } = await ScrimPostFactory.create({
			startsAt: dbTs(BOOKED_AT),
			users: [{ userId: users.id(1), isOwner: 1 }],
		});
		const team = await TeamFactory.create({ memberUserIds: [users.id(2)] });
		const requestId = await ScrimPostRepository.insertRequest({
			scrimPostId: postId,
			teamId: team.id,
			message: null,
			startsAt: requestStartsAt ? dbTs(requestStartsAt) : null,
			users: [{ userId: users.id(2), isOwner: 1 }],
		});

		return { postId, requestId };
	};

	const roomOfPost = async (postId: number) => {
		const post = await ScrimPostRepository.findById(postId);
		return db
			.selectFrom("ChatRoom")
			.selectAll()
			.where("id", "=", post!.chatRoomId!)
			.executeTakeFirstOrThrow();
	};

	test("creates a SCRIM chat room expiring a day after the scrim's start time", async () => {
		const { postId, requestId } = await setupPostWithRequest();

		await ScrimPostRepository.acceptRequest(requestId);

		const room = await roomOfPost(postId);
		expect(room.type).toBe("SCRIM");
		expect(room.expiresAt).toBe(dbTs(BOOKED_AT) + 24 * 60 * 60);
	});

	test("room expiry follows the accepted request's start time when it has one", async () => {
		const requestStartsAt = add(BOOKED_AT, { hours: 5 });
		const { postId, requestId } = await setupPostWithRequest({
			requestStartsAt,
		});

		await ScrimPostRepository.acceptRequest(requestId);

		const room = await roomOfPost(postId);
		expect(room.expiresAt).toBe(dbTs(requestStartsAt) + 24 * 60 * 60);
	});
});

describe("deleteById", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	test("deletes the scrim's chat room with the post", async () => {
		const { id: postId } = await ScrimPostFactory.create({
			startsAt: dbTs(BOOKED_AT),
			users: [{ userId: users.id(1), isOwner: 1 }],
		});
		const team = await TeamFactory.create({ memberUserIds: [users.id(2)] });
		const requestId = await ScrimPostRepository.insertRequest({
			scrimPostId: postId,
			teamId: team.id,
			message: null,
			startsAt: null,
			users: [{ userId: users.id(2), isOwner: 1 }],
		});
		await ScrimPostRepository.acceptRequest(requestId);

		await ScrimPostRepository.deleteById(postId);

		const rooms = await db.selectFrom("ChatRoom").selectAll().execute();
		expect(rooms).toHaveLength(0);
	});
});

describe("cancelScrim", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	test("marks the scrim's chat room inactive", async () => {
		const { id: postId } = await ScrimPostFactory.create({
			startsAt: dbTs(BOOKED_AT),
			users: [{ userId: users.id(1), isOwner: 1 }],
		});
		const team = await TeamFactory.create({ memberUserIds: [users.id(2)] });
		const requestId = await ScrimPostRepository.insertRequest({
			scrimPostId: postId,
			teamId: team.id,
			message: null,
			startsAt: null,
			users: [{ userId: users.id(2), isOwner: 1 }],
		});
		await ScrimPostRepository.acceptRequest(requestId);

		await withUserId(users.id(1), () =>
			ScrimPostRepository.cancelScrim(postId, "Can't make it"),
		);

		const room = await db
			.selectFrom("ChatRoom")
			.selectAll()
			.executeTakeFirstOrThrow();
		expect(room.inactive).toBe(1);
	});
});
