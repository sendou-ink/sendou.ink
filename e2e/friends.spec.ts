import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import * as Availability from "~/features/availability/core/Availability";
import { weekDates, weekRange } from "./helpers/availability";
import type { Factories } from "./helpers/factories";
import {
	expect,
	impersonate,
	isNotVisible,
	MACHINE_TIMEZONE,
	setTimezoneCookie,
	test,
} from "./helpers/playwright";
import {
	befriend,
	createNamedUsers,
	expectTopToBottom,
} from "./helpers/sidebar";
import { FriendsPage } from "./pages/friends/friends-page";
import { NotificationPopover } from "./pages/layout/notification-popover";
import { SideNav } from "./pages/layout/side-nav";

const WEDNESDAY = 2;

test.describe("Friends", () => {
	test.describe("Requests", () => {
		test("a sent request shows as pending to both users", async ({ page }) => {
			const friends = new FriendsPage(page);
			const notifications = new NotificationPopover(page);

			await test.step("Sendou sends N-ZAP a friend request", async () => {
				await impersonate(page);
				await friends.goto();
				await friends.sendRequest("N-ZAP");

				await expect(friends.locators.cancelRequestButton).toBeVisible();
			});

			await test.step("N-ZAP is notified and can accept it", async () => {
				await impersonate(page, NZAP_TEST_ID);
				await friends.goto();

				await expect(notifications.locators.bellDot).toBeVisible();
				await expect(friends.locators.acceptButton).toBeVisible();
			});
		});

		test("accepting a request marks its notification read without opening the bell", async ({
			page,
			factories,
		}) => {
			await requestFriendship(factories, { from: ADMIN_ID, to: NZAP_TEST_ID });

			await impersonate(page, NZAP_TEST_ID);
			const friends = new FriendsPage(page);
			await friends.goto();
			const notifications = new NotificationPopover(page);
			await expect(notifications.locators.bellDot).toBeVisible();

			await friends.acceptRequest();

			await expect(notifications.locators.bellDot).toBeHidden();
			await notifications.open();
			await expect(
				notifications.notification("Sendou sent you a friend request"),
			).toBeVisible();
		});

		test("deleting a friend removes them from the list", async ({
			page,
			factories,
		}) => {
			await befriend(factories, [ADMIN_ID]);

			await impersonate(page, NZAP_TEST_ID);
			const friends = new FriendsPage(page);
			await friends.goto();
			await friends.friend("Sendou").deleteFriend();

			await expect(friends.locators.noFriendsText).toBeVisible();
		});
	});

	test.describe("Weekly schedule", () => {
		test("friends who shared a schedule sort above those who didn't", async ({
			page,
			factories,
		}) => {
			const { scheduled, unscheduled, queueing } =
				await friendsWithSchedules(factories);

			await impersonate(page, ADMIN_ID);
			const friends = new FriendsPage(page);
			await friends.goto();

			await expectTopToBottom([
				friends.row(queueing.id),
				friends.row(scheduled.id),
				friends.row(unscheduled.id),
			]);
			await isNotVisible(friends.scheduleButton(unscheduled.id));
		});

		test("a friend's week shows when they are free, not what they are doing", async ({
			page,
			factories,
		}) => {
			const { scheduled } = await friendsWithSchedules(factories);

			await impersonate(page, ADMIN_ID);
			await setTimezoneCookie(page);
			const friends = new FriendsPage(page);
			await friends.goto();
			await friends.scheduleButton(scheduled.id).click();

			await test.step("This week shows their free time but not the team event taking part of it", async () => {
				await expect(friends.locators.scheduleRanges).toHaveCount(1);
				await expect(friends.day(WEDNESDAY)).toContainText("6:00");
				await expect(friends.day(WEDNESDAY)).not.toContainText("VoD review");
			});

			await test.step("Next week is empty as they only filled in this week", async () => {
				await friends.locators.nextWeekToggle.click();

				await expect(friends.locators.noScheduleText).toBeVisible();
			});
		});
	});

	test.describe("Pinning", () => {
		/** Pins only reorder within a section: a pinned idle friend stays below everyone queueing. */
		test("pinned friends sort to the top of their section, on the page and in the sidebar", async ({
			page,
			factories,
		}) => {
			const [pinnedQueueing, queueing, pinnedIdle, idle] =
				await createNamedUsers(factories, [
					"PinQueue",
					"PlainQueue",
					"PinIdle",
					"PlainIdle",
				]);
			await befriend(
				factories,
				[idle.id, pinnedIdle.id, queueing.id, pinnedQueueing.id],
				ADMIN_ID,
			);
			await factories.SQGroupFactory.create({ memberUserIds: [queueing.id] });
			await factories.SQGroupFactory.create({
				memberUserIds: [pinnedQueueing.id],
			});

			await impersonate(page, ADMIN_ID);
			const friends = new FriendsPage(page);
			await friends.goto();

			await test.step("Sendou pins an idle and a queueing friend", async () => {
				await friends.togglePin(pinnedIdle.id);
				await friends.togglePin(pinnedQueueing.id);

				await expect(friends.pinButton(pinnedIdle.id)).toHaveAttribute(
					"aria-pressed",
					"true",
				);
				await expect(friends.pinButton(idle.id)).toHaveAttribute(
					"aria-pressed",
					"false",
				);
			});

			await test.step("The page lists pinned friends first within each section", async () => {
				await expectTopToBottom([
					friends.row(pinnedQueueing.id),
					friends.row(queueing.id),
					friends.row(pinnedIdle.id),
					friends.row(idle.id),
				]);
			});

			await test.step("The sidebar reorders too, without navigating", async () => {
				const sideNav = new SideNav(page);
				await expectTopToBottom([
					sideNav.friend("PinQueue").trigger,
					sideNav.friend("PlainQueue").trigger,
					sideNav.friend("PinIdle").trigger,
					sideNav.friend("PlainIdle").trigger,
				]);
			});

			await test.step("Unpinning a friend turns their pin off again", async () => {
				await friends.goto();
				await friends.togglePin(pinnedIdle.id);

				await expect(friends.pinButton(pinnedIdle.id)).toHaveAttribute(
					"aria-pressed",
					"false",
				);
			});
		});
	});
});

/** A pending friend request and the notification its receiver gets, as sending one from the friends page creates them. */
async function requestFriendship(
	factories: Factories,
	{ from, to }: { from: number; to: number },
) {
	await factories.FriendRequestFactory.create({
		senderId: from,
		receiverId: to,
	});
	await factories.NotificationFactory.create({
		notification: {
			type: "FRIEND_REQUEST_RECEIVED",
			meta: { senderId: from, senderUsername: "Sendou" },
		},
		users: [{ userId: to, seen: 0 }],
	});
}

/** Sendou's friends: one queueing, one who shared this week's schedule (with a team event on Wednesday evening) and one who didn't. */
async function friendsWithSchedules(factories: Factories) {
	const [scheduled, unscheduled, queueing] = await createNamedUsers(factories, [
		"ScheduleFriend",
		"NoScheduleFriend",
		"QueueFriend",
	]);
	await befriend(
		factories,
		[unscheduled.id, scheduled.id, queueing.id],
		ADMIN_ID,
	);
	await factories.SQGroupFactory.create({ memberUserIds: [queueing.id] });

	await factories.AvailabilityWeekFactory.create({
		userId: scheduled.id,
		weekStartsAt: weekRange().startsAt,
		timezone: MACHINE_TIMEZONE,
		slots: [daySlot(WEDNESDAY, "18:00", "22:00")],
	});
	const { id: teamId } = await factories.TeamFactory.create({
		name: "Schedule Team",
		memberUserIds: [scheduled.id],
	});
	await factories.TeamEventFactory.create({
		teamId,
		authorId: scheduled.id,
		name: "VoD review",
		...daySlot(WEDNESDAY, "20:00", "22:00"),
	});

	return { scheduled, unscheduled, queueing };
}

function daySlot(dayIndex: number, start: string, end: string) {
	const date = weekDates()[dayIndex];

	return {
		startsAt: Availability.localToTimestamp({
			date,
			time: start,
			timezone: MACHINE_TIMEZONE,
		}),
		endsAt: Availability.localToTimestamp({
			date,
			time: end,
			timezone: MACHINE_TIMEZONE,
		}),
	};
}
