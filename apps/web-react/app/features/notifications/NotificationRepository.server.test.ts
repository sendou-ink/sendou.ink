import { beforeEach, describe, expect, test } from "vitest";
import * as NotificationFactory from "~/db/seed/factories/NotificationFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { withUserId } from "~/utils/Test";
import * as NotificationRepository from "./NotificationRepository.server";

const users = UserFactory.pool();

const seenStatusOf = async (userId: number) => {
	const notifications = await NotificationRepository.findByUserId(userId);
	return notifications.map(({ type, seen }) => ({ type, seen }));
};

describe("markAsSeenByType", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	test("marks unseen notification of the type as seen", async () => {
		await NotificationFactory.create({
			notification: { type: "SQ_READY_CHECK" },
			users: [{ userId: users.id(1) }],
		});

		await NotificationRepository.markAsSeenByType({
			userIds: [users.id(1)],
			type: "SQ_READY_CHECK",
		});

		expect(await seenStatusOf(users.id(1))).toEqual([
			{ type: "SQ_READY_CHECK", seen: 1 },
		]);
	});

	test("leaves other users' notifications unseen", async () => {
		await NotificationFactory.create({
			notification: { type: "SQ_READY_CHECK" },
			users: [{ userId: users.id(1) }, { userId: users.id(2) }],
		});

		await NotificationRepository.markAsSeenByType({
			userIds: [users.id(1)],
			type: "SQ_READY_CHECK",
		});

		expect(await seenStatusOf(users.id(2))).toEqual([
			{ type: "SQ_READY_CHECK", seen: 0 },
		]);
	});

	test("leaves notifications of other types unseen", async () => {
		await NotificationFactory.create({
			notification: { type: "SQ_READY_CHECK" },
			users: [{ userId: users.id(1) }],
		});
		await NotificationFactory.create({
			notification: { type: "SQ_NEW_MATCH", meta: { matchId: 1 } },
			users: [{ userId: users.id(1) }],
		});

		await NotificationRepository.markAsSeenByType({
			userIds: [users.id(1)],
			type: "SQ_READY_CHECK",
		});

		expect(await seenStatusOf(users.id(1))).toEqual([
			{ type: "SQ_NEW_MATCH", seen: 0 },
			{ type: "SQ_READY_CHECK", seen: 1 },
		]);
	});

	test("meta filter only matches notifications with the given values", async () => {
		await NotificationFactory.create({
			notification: { type: "SQ_NEW_MATCH", meta: { matchId: 1 } },
			users: [{ userId: users.id(1) }],
		});
		await NotificationFactory.create({
			notification: { type: "SQ_NEW_MATCH", meta: { matchId: 2 } },
			users: [{ userId: users.id(1) }],
		});

		await NotificationRepository.markAsSeenByType({
			userIds: [users.id(1)],
			type: "SQ_NEW_MATCH",
			meta: { matchId: 2 },
		});

		expect(await seenStatusOf(users.id(1))).toEqual([
			{ type: "SQ_NEW_MATCH", seen: 1 },
			{ type: "SQ_NEW_MATCH", seen: 0 },
		]);
	});

	test("matches on a subset of meta keys, both string and number valued", async () => {
		await NotificationFactory.create({
			notification: {
				type: "SCRIM_NEW_REQUEST",
				meta: { fromUserId: 1, fromUsername: "alice", scrimPostId: 7 },
			},
			users: [{ userId: users.id(1) }],
		});
		await NotificationFactory.create({
			notification: {
				type: "SCRIM_NEW_REQUEST",
				meta: { fromUserId: 2, fromUsername: "bob", scrimPostId: 7 },
			},
			users: [{ userId: users.id(1) }],
		});

		await NotificationRepository.markAsSeenByType({
			userIds: [users.id(1)],
			type: "SCRIM_NEW_REQUEST",
			meta: { fromUsername: "alice" },
		});

		expect(await seenStatusOf(users.id(1))).toEqual([
			{ type: "SCRIM_NEW_REQUEST", seen: 0 },
			{ type: "SCRIM_NEW_REQUEST", seen: 1 },
		]);
	});

	test("marks the notification as seen for every given user", async () => {
		await NotificationFactory.create({
			notification: { type: "SQ_READY_CHECK" },
			users: [
				{ userId: users.id(1) },
				{ userId: users.id(2) },
				{ userId: users.id(3) },
			],
		});

		await NotificationRepository.markAsSeenByType({
			userIds: [users.id(1), users.id(3)],
			type: "SQ_READY_CHECK",
		});

		expect(await seenStatusOf(users.id(1))).toEqual([
			{ type: "SQ_READY_CHECK", seen: 1 },
		]);
		expect(await seenStatusOf(users.id(2))).toEqual([
			{ type: "SQ_READY_CHECK", seen: 0 },
		]);
		expect(await seenStatusOf(users.id(3))).toEqual([
			{ type: "SQ_READY_CHECK", seen: 1 },
		]);
	});
});

describe("markOwnAsSeen", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("returns the actor's id when a notification flips to seen", async () => {
		const notification = await NotificationFactory.create({
			notification: { type: "SQ_READY_CHECK" },
			users: [{ userId: users.id(1) }],
		});

		const changedUserIds = await withUserId(users.id(1), () =>
			NotificationRepository.markOwnAsSeen([notification.id]),
		);

		expect(changedUserIds).toEqual([users.id(1)]);
		expect(await seenStatusOf(users.id(1))).toEqual([
			{ type: "SQ_READY_CHECK", seen: 1 },
		]);
	});

	test("returns no user ids when the notifications were already seen", async () => {
		const notification = await NotificationFactory.create({
			notification: { type: "SQ_READY_CHECK" },
			users: [{ userId: users.id(1), seen: 1 }],
		});

		const changedUserIds = await withUserId(users.id(1), () =>
			NotificationRepository.markOwnAsSeen([notification.id]),
		);

		expect(changedUserIds).toEqual([]);
	});

	test("returns the actor's id once even if many notifications flip", async () => {
		const notifications = await Promise.all([
			NotificationFactory.create({
				notification: { type: "SQ_READY_CHECK" },
				users: [{ userId: users.id(1) }],
			}),
			NotificationFactory.create({
				notification: { type: "SQ_NEW_MATCH", meta: { matchId: 1 } },
				users: [{ userId: users.id(1) }],
			}),
		]);

		const changedUserIds = await withUserId(users.id(1), () =>
			NotificationRepository.markOwnAsSeen(notifications.map(({ id }) => id)),
		);

		expect(changedUserIds).toEqual([users.id(1)]);
	});

	test("leaves another user's copy of the notification unseen", async () => {
		const notification = await NotificationFactory.create({
			notification: { type: "SQ_READY_CHECK" },
			users: [{ userId: users.id(1) }, { userId: users.id(2) }],
		});

		await withUserId(users.id(1), () =>
			NotificationRepository.markOwnAsSeen([notification.id]),
		);

		expect(await seenStatusOf(users.id(2))).toEqual([
			{ type: "SQ_READY_CHECK", seen: 0 },
		]);
	});
});

describe("upsertOwnSubscription", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	const subscription = (endpoint: string) => ({
		endpoint,
		keys: { auth: "auth", p256dh: "p256dh" },
	});

	test("resubscribing with the same endpoint does not duplicate the subscription", async () => {
		await withUserId(users.id(1), () =>
			NotificationRepository.upsertOwnSubscription(
				subscription("https://push.example.com/1"),
			),
		);
		await withUserId(users.id(1), () =>
			NotificationRepository.upsertOwnSubscription(
				subscription("https://push.example.com/1"),
			),
		);

		const subscriptions =
			await NotificationRepository.findAllSubscriptionsByUserIds([users.id(1)]);
		expect(subscriptions).toHaveLength(1);
	});

	test("another user subscribing on the same browser takes over the endpoint", async () => {
		await withUserId(users.id(1), () =>
			NotificationRepository.upsertOwnSubscription(
				subscription("https://push.example.com/1"),
			),
		);
		await withUserId(users.id(2), () =>
			NotificationRepository.upsertOwnSubscription(
				subscription("https://push.example.com/1"),
			),
		);

		expect(
			await NotificationRepository.findAllSubscriptionsByUserIds([users.id(1)]),
		).toHaveLength(0);
		expect(
			await NotificationRepository.findAllSubscriptionsByUserIds([users.id(2)]),
		).toHaveLength(1);
	});

	test("different endpoints subscribe separately for the same user", async () => {
		await withUserId(users.id(1), () =>
			NotificationRepository.upsertOwnSubscription(
				subscription("https://push.example.com/1"),
			),
		);
		await withUserId(users.id(1), () =>
			NotificationRepository.upsertOwnSubscription(
				subscription("https://push.example.com/2"),
			),
		);

		expect(
			await NotificationRepository.findAllSubscriptionsByUserIds([users.id(1)]),
		).toHaveLength(2);
	});
});

describe("findUnseenSubscriptionsByNotificationId", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	const subscribe = (userId: number, endpoint: string) =>
		withUserId(userId, () =>
			NotificationRepository.upsertOwnSubscription({
				endpoint,
				keys: { auth: "auth", p256dh: "p256dh" },
			}),
		);

	const subscribedEndpointsOf = async (notificationId: number) => {
		const subscriptions =
			await NotificationRepository.findUnseenSubscriptionsByNotificationId(
				notificationId,
			);
		return subscriptions.map(({ subscription }) => subscription.endpoint);
	};

	test("returns the subscriptions of recipients who have not seen the notification", async () => {
		await subscribe(users.id(1), "https://push.example.com/1");
		await subscribe(users.id(2), "https://push.example.com/2");

		const notification = await NotificationFactory.create({
			notification: { type: "SQ_READY_CHECK" },
			users: [{ userId: users.id(1) }, { userId: users.id(2) }],
		});

		expect(await subscribedEndpointsOf(notification.id)).toEqual(
			expect.arrayContaining([
				"https://push.example.com/1",
				"https://push.example.com/2",
			]),
		);
	});

	test("excludes recipients who have seen the notification", async () => {
		await subscribe(users.id(1), "https://push.example.com/1");
		await subscribe(users.id(2), "https://push.example.com/2");

		const notification = await NotificationFactory.create({
			notification: { type: "SQ_READY_CHECK" },
			users: [{ userId: users.id(1), seen: 1 }, { userId: users.id(2) }],
		});

		expect(await subscribedEndpointsOf(notification.id)).toEqual([
			"https://push.example.com/2",
		]);
	});

	test("excludes subscriptions of users who did not receive the notification", async () => {
		await subscribe(users.id(1), "https://push.example.com/1");
		await subscribe(users.id(3), "https://push.example.com/3");

		const notification = await NotificationFactory.create({
			notification: { type: "SQ_READY_CHECK" },
			users: [{ userId: users.id(1) }, { userId: users.id(2) }],
		});

		expect(await subscribedEndpointsOf(notification.id)).toEqual([
			"https://push.example.com/1",
		]);
	});

	test("returns every subscription of an unseen recipient", async () => {
		await subscribe(users.id(1), "https://push.example.com/1");
		await subscribe(users.id(1), "https://push.example.com/2");

		const notification = await NotificationFactory.create({
			notification: { type: "SQ_READY_CHECK" },
			users: [{ userId: users.id(1) }],
		});

		expect(await subscribedEndpointsOf(notification.id)).toHaveLength(2);
	});
});
