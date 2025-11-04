import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { dbInsertUsers, dbReset } from "~/utils/Test";
import * as NotificationRepository from "../NotificationRepository.server";
import { clearSentNotificationsForTesting, notify } from "./notify.server";

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

describe("notify()", () => {
	beforeEach(async () => {
		await dbInsertUsers(20);
		clearSentNotificationsForTesting();
	});

	afterEach(() => {
		dbReset();
	});

	test("different recipients receive same notification", async () => {
		await notify({
			userIds: [1, 2],
			notification: {
				type: "SCRIM_NEW_REQUEST",
				meta: { fromUsername: "alice" },
			},
		});

		await notify({
			userIds: [3, 4],
			notification: {
				type: "SCRIM_NEW_REQUEST",
				meta: { fromUsername: "alice" },
			},
		});

		const user1Notifications = await NotificationRepository.findByUserId(1);
		const user2Notifications = await NotificationRepository.findByUserId(2);
		const user3Notifications = await NotificationRepository.findByUserId(3);
		const user4Notifications = await NotificationRepository.findByUserId(4);

		expect(user1Notifications).toHaveLength(1);
		expect(user2Notifications).toHaveLength(1);
		expect(user3Notifications).toHaveLength(1);
		expect(user4Notifications).toHaveLength(1);

		expect(user1Notifications[0].type).toBe("SCRIM_NEW_REQUEST");
		expect(user1Notifications[0].meta).toEqual({ fromUsername: "alice" });
	});

	test("same recipients and notification deduplicates", async () => {
		await notify({
			userIds: [5, 6],
			notification: {
				type: "BADGE_ADDED",
				meta: { badgeName: "Test", badgeId: 1 },
			},
		});

		await notify({
			userIds: [5, 6],
			notification: {
				type: "BADGE_ADDED",
				meta: { badgeName: "Test", badgeId: 1 },
			},
		});

		const user5Notifications = await NotificationRepository.findByUserId(5);
		const user6Notifications = await NotificationRepository.findByUserId(6);

		expect(user5Notifications).toHaveLength(1);
		expect(user6Notifications).toHaveLength(1);
	});

	test("user ID order doesn't affect deduplication", async () => {
		await notify({
			userIds: [7, 8, 9],
			notification: {
				type: "SEASON_STARTED",
				meta: { seasonNth: 1 },
			},
		});

		await notify({
			userIds: [9, 7, 8],
			notification: {
				type: "SEASON_STARTED",
				meta: { seasonNth: 1 },
			},
		});

		const user7Notifications = await NotificationRepository.findByUserId(7);
		const user8Notifications = await NotificationRepository.findByUserId(8);
		const user9Notifications = await NotificationRepository.findByUserId(9);

		expect(user7Notifications).toHaveLength(1);
		expect(user8Notifications).toHaveLength(1);
		expect(user9Notifications).toHaveLength(1);
	});

	test("bulk notifications (>10 users) bypass deduplication", async () => {
		const userIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

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

		const user1Notifications = await NotificationRepository.findByUserId(1);
		const user11Notifications = await NotificationRepository.findByUserId(11);

		expect(user1Notifications).toHaveLength(2);
		expect(user11Notifications).toHaveLength(2);
	});

	test("different notification types don't deduplicate", async () => {
		await notify({
			userIds: [10, 11],
			notification: {
				type: "SCRIM_SCHEDULED",
				meta: { id: 1, at: 123 },
			},
		});

		await notify({
			userIds: [10, 11],
			notification: {
				type: "SCRIM_CANCELED",
				meta: { id: 1, at: 123 },
			},
		});

		const user10Notifications = await NotificationRepository.findByUserId(10);
		const user11Notifications = await NotificationRepository.findByUserId(11);

		expect(user10Notifications).toHaveLength(2);
		expect(user11Notifications).toHaveLength(2);

		const types = user10Notifications.map((n) => n.type).sort();
		expect(types).toEqual(["SCRIM_CANCELED", "SCRIM_SCHEDULED"]);
	});

	test("different notification meta don't deduplicate", async () => {
		await notify({
			userIds: [12, 13],
			notification: {
				type: "SCRIM_NEW_REQUEST",
				meta: { fromUsername: "bob" },
			},
		});

		await notify({
			userIds: [12, 13],
			notification: {
				type: "SCRIM_NEW_REQUEST",
				meta: { fromUsername: "charlie" },
			},
		});

		const user12Notifications = await NotificationRepository.findByUserId(12);
		const user13Notifications = await NotificationRepository.findByUserId(13);

		expect(user12Notifications).toHaveLength(2);
		expect(user13Notifications).toHaveLength(2);

		const metas = user12Notifications.map((n) => n.meta);
		expect(metas).toContainEqual({ fromUsername: "bob" });
		expect(metas).toContainEqual({ fromUsername: "charlie" });
	});

	test("duplicate user IDs in input array are deduplicated", async () => {
		await notify({
			userIds: [14, 14, 15, 15, 15],
			notification: {
				type: "PLUS_VOTING_STARTED",
				meta: { seasonNth: 2 },
			},
		});

		const user14Notifications = await NotificationRepository.findByUserId(14);
		const user15Notifications = await NotificationRepository.findByUserId(15);

		expect(user14Notifications).toHaveLength(1);
		expect(user15Notifications).toHaveLength(1);
	});
});

describe("notify() - web push notifications", () => {
	beforeEach(async () => {
		await dbInsertUsers(20);
		clearSentNotificationsForTesting();
		mockSendNotification.mockClear();
		mockWebPushEnabled.value = false;
	});

	afterEach(() => {
		dbReset();
	});

	test("sends web push notification when user has subscription", async () => {
		const mockSubscription = {
			endpoint: "https://fcm.googleapis.com/fcm/send/test",
			keys: {
				auth: "test-auth-key",
				p256dh: "test-p256dh-key",
			},
		};

		vi.spyOn(
			NotificationRepository,
			"subscriptionsByUserIds",
		).mockResolvedValue([
			{
				id: 1,
				subscription: mockSubscription,
			},
		]);

		mockWebPushEnabled.value = true;

		await notify({
			userIds: [1],
			notification: {
				type: "SCRIM_NEW_REQUEST",
				meta: { fromUsername: "alice" },
			},
		});

		expect(mockSendNotification).toHaveBeenCalledTimes(1);
		expect(mockSendNotification).toHaveBeenCalledWith(
			mockSubscription,
			expect.any(String),
		);

		const callArgs = mockSendNotification.mock.calls[0][1];
		const payload = JSON.parse(callArgs);
		expect(payload.title).toBe("New Scrim Request");
		expect(payload.body).toBe("alice requested a scrim");
		expect(payload.data.url).toBe("/scrims");
		expect(payload.icon).toBe("/static-assets/img/app-icon.png");
	});

	test("sends web push to multiple subscriptions", async () => {
		const mockSubscription1 = {
			endpoint: "https://fcm.googleapis.com/fcm/send/test1",
			keys: {
				auth: "test-auth-key-1",
				p256dh: "test-p256dh-key-1",
			},
		};

		const mockSubscription2 = {
			endpoint: "https://fcm.googleapis.com/fcm/send/test2",
			keys: {
				auth: "test-auth-key-2",
				p256dh: "test-p256dh-key-2",
			},
		};

		vi.spyOn(
			NotificationRepository,
			"subscriptionsByUserIds",
		).mockResolvedValue([
			{
				id: 1,
				subscription: mockSubscription1,
			},
			{
				id: 2,
				subscription: mockSubscription2,
			},
		]);

		mockWebPushEnabled.value = true;

		await notify({
			userIds: [1, 2],
			notification: {
				type: "BADGE_ADDED",
				meta: { badgeName: "Test", badgeId: 1 },
			},
		});

		expect(mockSendNotification).toHaveBeenCalledTimes(2);
		expect(mockSendNotification).toHaveBeenCalledWith(
			mockSubscription1,
			expect.any(String),
		);
		expect(mockSendNotification).toHaveBeenCalledWith(
			mockSubscription2,
			expect.any(String),
		);
	});

	test("does not send web push when webPushEnabled is false", async () => {
		const mockSubscription = {
			endpoint: "https://fcm.googleapis.com/fcm/send/test",
			keys: {
				auth: "test-auth-key",
				p256dh: "test-p256dh-key",
			},
		};

		vi.spyOn(
			NotificationRepository,
			"subscriptionsByUserIds",
		).mockResolvedValue([
			{
				id: 1,
				subscription: mockSubscription,
			},
		]);

		await notify({
			userIds: [1],
			notification: {
				type: "SCRIM_NEW_REQUEST",
				meta: { fromUsername: "alice" },
			},
		});

		expect(mockSendNotification).not.toHaveBeenCalled();
	});

	test("formats timestamp for scrim notifications", async () => {
		const mockSubscription = {
			endpoint: "https://fcm.googleapis.com/fcm/send/test",
			keys: {
				auth: "test-auth-key",
				p256dh: "test-p256dh-key",
			},
		};

		vi.spyOn(
			NotificationRepository,
			"subscriptionsByUserIds",
		).mockResolvedValue([
			{
				id: 1,
				subscription: mockSubscription,
			},
		]);

		mockWebPushEnabled.value = true;

		const testTimestamp = new Date("2024-01-15T15:30:00Z").getTime();

		await notify({
			userIds: [1],
			notification: {
				type: "SCRIM_SCHEDULED",
				meta: { id: 1, at: testTimestamp },
			},
		});

		expect(mockSendNotification).toHaveBeenCalledTimes(1);

		const callArgs = mockSendNotification.mock.calls[0][1];
		const payload = JSON.parse(callArgs);

		expect(payload.title).toBe("Scrim Scheduled");
		expect(payload.body).toMatch(
			/New scrim scheduled at \d+\/\d+, \d+:\d+ (AM|PM)/,
		);
	});
});
