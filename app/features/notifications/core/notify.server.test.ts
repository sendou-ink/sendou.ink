import { beforeEach, describe, expect, test, vi } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { withUserId } from "~/utils/Test";
import { APP_ICON_URL } from "~/utils/urls";
import * as NotificationRepository from "../NotificationRepository.server";
import { notificationMeta } from "../notifications-utils";
import {
	clearSentNotificationsForTesting,
	notify,
	PUSH_NOTIFICATION_GRACE_PERIOD_MS,
} from "./notify.server";

const users = UserFactory.pool();

const { mockSendNotification, mockWebPushEnabled } = vi.hoisted(() => ({
	mockSendNotification: vi.fn(),
	mockWebPushEnabled: { value: false },
}));

vi.mock("./webPush.server", () => ({
	get webPushEnabled() {
		return mockWebPushEnabled.value;
	},
	default: {
		sendNotification: mockSendNotification,
	},
}));

vi.mock("~/features/chat/ChatSystemMessage.server", () => ({
	notifyNotificationsChanged: vi.fn(),
}));

describe("notify()", () => {
	beforeEach(async () => {
		await users.create(20);
		clearSentNotificationsForTesting();
		vi.mocked(ChatSystemMessage.notifyNotificationsChanged).mockClear();
	});

	test("different recipients receive same notification", async () => {
		await notify({
			userIds: [users.id(1), users.id(2)],
			notification: {
				type: "SCRIM_NEW_REQUEST",
				meta: { fromUserId: 1, fromUsername: "alice", scrimPostId: 1 },
			},
		});

		await notify({
			userIds: [users.id(3), users.id(4)],
			notification: {
				type: "SCRIM_NEW_REQUEST",
				meta: { fromUserId: 1, fromUsername: "alice", scrimPostId: 1 },
			},
		});

		const user1Notifications = await NotificationRepository.findByUserId(
			users.id(1),
		);
		const user2Notifications = await NotificationRepository.findByUserId(
			users.id(2),
		);
		const user3Notifications = await NotificationRepository.findByUserId(
			users.id(3),
		);
		const user4Notifications = await NotificationRepository.findByUserId(
			users.id(4),
		);

		expect(user1Notifications).toHaveLength(1);
		expect(user2Notifications).toHaveLength(1);
		expect(user3Notifications).toHaveLength(1);
		expect(user4Notifications).toHaveLength(1);

		expect(user1Notifications[0].type).toBe("SCRIM_NEW_REQUEST");
		expect(notificationMeta(user1Notifications[0])).toEqual({
			fromUserId: 1,
			fromUsername: "alice",
			scrimPostId: 1,
		});
	});

	test("same recipients and notification deduplicates", async () => {
		await notify({
			userIds: [users.id(5), users.id(6)],
			notification: {
				type: "BADGE_ADDED",
				meta: { badgeName: "Test", badgeId: 1 },
			},
		});

		await notify({
			userIds: [users.id(5), users.id(6)],
			notification: {
				type: "BADGE_ADDED",
				meta: { badgeName: "Test", badgeId: 1 },
			},
		});

		const user5Notifications = await NotificationRepository.findByUserId(
			users.id(5),
		);
		const user6Notifications = await NotificationRepository.findByUserId(
			users.id(6),
		);

		expect(user5Notifications).toHaveLength(1);
		expect(user6Notifications).toHaveLength(1);
	});

	test("pings recipients' websockets once per delivered notification", async () => {
		await notify({
			userIds: [users.id(1), users.id(2)],
			notification: {
				type: "BADGE_ADDED",
				meta: { badgeName: "Test", badgeId: 1 },
			},
		});

		expect(ChatSystemMessage.notifyNotificationsChanged).toHaveBeenCalledWith([
			users.id(1),
			users.id(2),
		]);

		// deduplicated resend delivers nothing, so it should not ping either
		await notify({
			userIds: [users.id(1), users.id(2)],
			notification: {
				type: "BADGE_ADDED",
				meta: { badgeName: "Test", badgeId: 1 },
			},
		});

		expect(ChatSystemMessage.notifyNotificationsChanged).toHaveBeenCalledTimes(
			1,
		);
	});

	test("identical notification is delivered again when repeated a day later", async () => {
		vi.useFakeTimers();
		try {
			await notify({
				userIds: [users.id(5)],
				notification: {
					type: "SCRIM_NEW_REQUEST",
					meta: { fromUserId: 1, fromUsername: "alice", scrimPostId: 1 },
				},
			});

			vi.advanceTimersByTime(24 * 60 * 60 * 1000);

			await notify({
				userIds: [users.id(5)],
				notification: {
					type: "SCRIM_NEW_REQUEST",
					meta: { fromUserId: 1, fromUsername: "alice", scrimPostId: 1 },
				},
			});
		} finally {
			vi.useRealTimers();
		}

		const notifications = await NotificationRepository.findByUserId(
			users.id(5),
		);

		expect(notifications).toHaveLength(2);
	});

	test("user ID order doesn't affect deduplication", async () => {
		await notify({
			userIds: [users.id(7), users.id(8), users.id(9)],
			notification: {
				type: "SEASON_STARTED",
				meta: { seasonNth: 1 },
			},
		});

		await notify({
			userIds: [users.id(9), users.id(7), users.id(8)],
			notification: {
				type: "SEASON_STARTED",
				meta: { seasonNth: 1 },
			},
		});

		const user7Notifications = await NotificationRepository.findByUserId(
			users.id(7),
		);
		const user8Notifications = await NotificationRepository.findByUserId(
			users.id(8),
		);
		const user9Notifications = await NotificationRepository.findByUserId(
			users.id(9),
		);

		expect(user7Notifications).toHaveLength(1);
		expect(user8Notifications).toHaveLength(1);
		expect(user9Notifications).toHaveLength(1);
	});

	test("bulk notifications (>10 users) bypass deduplication", async () => {
		const userIds = users.ids(11);

		await notify({
			userIds,
			notification: {
				type: "TO_CHECK_IN_OPENED",
				meta: { tournamentId: 1, tournamentName: "Test Tournament" },
			},
		});

		await notify({
			userIds,
			notification: {
				type: "TO_CHECK_IN_OPENED",
				meta: { tournamentId: 1, tournamentName: "Test Tournament" },
			},
		});

		const user1Notifications = await NotificationRepository.findByUserId(
			users.id(1),
		);
		const user11Notifications = await NotificationRepository.findByUserId(
			users.id(11),
		);

		expect(user1Notifications).toHaveLength(2);
		expect(user11Notifications).toHaveLength(2);
	});

	test("different notification types don't deduplicate", async () => {
		await notify({
			userIds: [users.id(10), users.id(11)],
			notification: {
				type: "SCRIM_SCHEDULED",
				meta: { id: 1, opponentTeamName: "Alpha" },
			},
		});

		await notify({
			userIds: [users.id(10), users.id(11)],
			notification: {
				type: "SCRIM_CANCELED",
				meta: { id: 1, opponentTeamName: "Alpha" },
			},
		});

		const user10Notifications = await NotificationRepository.findByUserId(
			users.id(10),
		);
		const user11Notifications = await NotificationRepository.findByUserId(
			users.id(11),
		);

		expect(user10Notifications).toHaveLength(2);
		expect(user11Notifications).toHaveLength(2);

		const types = user10Notifications.map((n) => n.type).sort();
		expect(types).toEqual(["SCRIM_CANCELED", "SCRIM_SCHEDULED"]);
	});

	test("different notification meta don't deduplicate", async () => {
		await notify({
			userIds: [users.id(12), users.id(13)],
			notification: {
				type: "SCRIM_NEW_REQUEST",
				meta: { fromUserId: 2, fromUsername: "bob", scrimPostId: 1 },
			},
		});

		await notify({
			userIds: [users.id(12), users.id(13)],
			notification: {
				type: "SCRIM_NEW_REQUEST",
				meta: { fromUserId: 3, fromUsername: "charlie", scrimPostId: 1 },
			},
		});

		const user12Notifications = await NotificationRepository.findByUserId(
			users.id(12),
		);
		const user13Notifications = await NotificationRepository.findByUserId(
			users.id(13),
		);

		expect(user12Notifications).toHaveLength(2);
		expect(user13Notifications).toHaveLength(2);

		const metas = user12Notifications.map(notificationMeta);
		expect(metas).toContainEqual({
			fromUserId: 2,
			fromUsername: "bob",
			scrimPostId: 1,
		});
		expect(metas).toContainEqual({
			fromUserId: 3,
			fromUsername: "charlie",
			scrimPostId: 1,
		});
	});

	test("duplicate user IDs in input array are deduplicated", async () => {
		await notify({
			userIds: [
				users.id(14),
				users.id(14),
				users.id(15),
				users.id(15),
				users.id(15),
			],
			notification: {
				type: "PLUS_VOTING_STARTED",
				meta: { seasonNth: 2 },
			},
		});

		const user14Notifications = await NotificationRepository.findByUserId(
			users.id(14),
		);
		const user15Notifications = await NotificationRepository.findByUserId(
			users.id(15),
		);

		expect(user14Notifications).toHaveLength(1);
		expect(user15Notifications).toHaveLength(1);
	});
});

describe("notify() - web push notifications", () => {
	beforeEach(async () => {
		await users.create(20);
		clearSentNotificationsForTesting();
		mockSendNotification.mockClear();
		mockWebPushEnabled.value = false;
	});

	const subscribe = (userId: number, endpoint: string) =>
		withUserId(userId, () =>
			NotificationRepository.upsertOwnSubscription({
				endpoint,
				keys: { auth: "test-auth-key", p256dh: "test-p256dh-key" },
			}),
		);

	const pushedEndpoints = () =>
		mockSendNotification.mock.calls.map(
			([subscription]) => subscription.endpoint,
		);

	const notifyAndElapseGracePeriod = async (
		args: Parameters<typeof notify>[0],
		duringGracePeriod?: () => Promise<unknown>,
	) => {
		vi.useFakeTimers();
		try {
			await notify(args);
			await duringGracePeriod?.();
			await vi.advanceTimersByTimeAsync(PUSH_NOTIFICATION_GRACE_PERIOD_MS);
		} finally {
			vi.useRealTimers();
		}
	};

	test("sends web push notification after the grace period", async () => {
		await subscribe(users.id(1), "https://push.example.com/1");
		mockWebPushEnabled.value = true;

		vi.useFakeTimers();
		try {
			await notify({
				userIds: [users.id(1)],
				notification: {
					type: "SCRIM_NEW_REQUEST",
					meta: { fromUserId: 1, fromUsername: "alice", scrimPostId: 1 },
				},
			});

			expect(mockSendNotification).not.toHaveBeenCalled();

			await vi.advanceTimersByTimeAsync(PUSH_NOTIFICATION_GRACE_PERIOD_MS);
		} finally {
			vi.useRealTimers();
		}

		expect(mockSendNotification).toHaveBeenCalledTimes(1);
		expect(mockSendNotification).toHaveBeenCalledWith(
			{
				endpoint: "https://push.example.com/1",
				keys: { auth: "test-auth-key", p256dh: "test-p256dh-key" },
			},
			expect.any(String),
			{ urgency: "high" },
		);

		const callArgs = mockSendNotification.mock.calls[0][1];
		const payload = JSON.parse(callArgs);
		expect(payload.title).toBe("New Scrim Request");
		expect(payload.body).toBe("alice requested a scrim");
		expect(payload.data.url).toBe("/scrims");
		expect(payload.icon).toBe(APP_ICON_URL);
	});

	test("sends web push to multiple subscriptions", async () => {
		await subscribe(users.id(1), "https://push.example.com/1");
		await subscribe(users.id(2), "https://push.example.com/2");
		mockWebPushEnabled.value = true;

		await notifyAndElapseGracePeriod({
			userIds: [users.id(1), users.id(2)],
			notification: {
				type: "BADGE_ADDED",
				meta: { badgeName: "Test", badgeId: 1 },
			},
		});

		expect(mockSendNotification).toHaveBeenCalledTimes(2);
		expect(pushedEndpoints()).toEqual(
			expect.arrayContaining([
				"https://push.example.com/1",
				"https://push.example.com/2",
			]),
		);
	});

	test("does not send web push when webPushEnabled is false", async () => {
		await subscribe(users.id(1), "https://push.example.com/1");

		await notifyAndElapseGracePeriod({
			userIds: [users.id(1)],
			notification: {
				type: "SCRIM_NEW_REQUEST",
				meta: { fromUserId: 1, fromUsername: "alice", scrimPostId: 1 },
			},
		});

		expect(mockSendNotification).not.toHaveBeenCalled();
	});

	test("skips the push for a user who saw the notification during the grace period", async () => {
		await subscribe(users.id(1), "https://push.example.com/1");
		await subscribe(users.id(2), "https://push.example.com/2");
		mockWebPushEnabled.value = true;

		await notifyAndElapseGracePeriod(
			{
				userIds: [users.id(1), users.id(2)],
				notification: {
					type: "SQ_NEW_MATCH",
					meta: { matchId: 1 },
				},
			},
			() =>
				NotificationRepository.markAsSeenByType({
					userIds: [users.id(1)],
					type: "SQ_NEW_MATCH",
					meta: { matchId: 1 },
				}),
		);

		expect(pushedEndpoints()).toEqual(["https://push.example.com/2"]);
	});

	test("skips the push for users who had the notification seen by default", async () => {
		await subscribe(users.id(1), "https://push.example.com/1");
		await subscribe(users.id(2), "https://push.example.com/2");
		mockWebPushEnabled.value = true;

		await notifyAndElapseGracePeriod({
			userIds: [users.id(1), users.id(2)],
			defaultSeenUserIds: [users.id(1)],
			notification: {
				type: "SQ_NEW_MATCH",
				meta: { matchId: 1 },
			},
		});

		expect(pushedEndpoints()).toEqual(["https://push.example.com/2"]);
	});

	test("includes opponent team name for scrim notifications", async () => {
		await subscribe(users.id(1), "https://push.example.com/1");
		mockWebPushEnabled.value = true;

		await notifyAndElapseGracePeriod({
			userIds: [users.id(1)],
			notification: {
				type: "SCRIM_SCHEDULED",
				meta: { id: 1, opponentTeamName: "Sendou's pickup" },
			},
		});

		expect(mockSendNotification).toHaveBeenCalledTimes(1);

		const callArgs = mockSendNotification.mock.calls[0][1];
		const payload = JSON.parse(callArgs);

		expect(payload.title).toBe("Scrim Scheduled");
		expect(payload.body).toBe("New scrim scheduled vs. Sendou's pickup");
	});
});
