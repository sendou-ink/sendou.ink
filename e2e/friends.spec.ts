import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import * as Availability from "~/features/availability/core/Availability";
import { weekDates, weekRange } from "./helpers/availability";
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

const WEDNESDAY = 2;

test.describe("Friends", () => {
	test("send friend request, accept it, then delete friend", async ({
		page,
	}) => {
		const friends = new FriendsPage(page);

		await impersonate(page);
		await friends.goto();
		await friends.sendRequest("N-ZAP");

		await expect(friends.locators.cancelRequestButton).toBeVisible();

		await impersonate(page, NZAP_TEST_ID);
		await friends.goto();

		const notifications = new NotificationPopover(page);
		await expect(notifications.locators.bellDot).toBeVisible();

		await expect(friends.locators.acceptButton).toBeVisible();
		await friends.acceptRequest();

		// accepting resolved the friend request notification without the bell
		// having been opened
		await expect(notifications.locators.bellDot).toBeHidden();

		await notifications.open();

		await expect(
			notifications.notification("Sendou sent you a friend request"),
		).toBeVisible();

		await notifications.close();

		await friends.friend("Sendou").deleteFriend();

		await expect(friends.locators.noFriendsText).toBeVisible();
	});

	test("sorts friends who shared a schedule up and shows their week", async ({
		page,
		factories,
	}) => {
		const [scheduled, unscheduled, queueing] = await createNamedUsers(
			factories,
			["ScheduleFriend", "NoScheduleFriend", "QueueFriend"],
		);
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
		// a commitment of their own team, which the modal shows only as the free
		// time it takes away
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

		await impersonate(page, ADMIN_ID);
		await setTimezoneCookie(page);

		const friends = new FriendsPage(page);
		await friends.goto();

		await expectTopToBottom([
			friends.row(queueing.id),
			friends.row(scheduled.id),
			friends.row(unscheduled.id),
		]);
		await isNotVisible(friends.scheduleButton(unscheduled.id));

		await friends.scheduleButton(scheduled.id).click();
		await expect(friends.locators.scheduleRanges).toHaveCount(1);
		await expect(friends.day(WEDNESDAY)).toContainText("6:00");
		await expect(friends.day(WEDNESDAY)).not.toContainText("VoD review");

		// they only filled in the current week
		await friends.locators.nextWeekToggle.click();
		await expect(friends.locators.noScheduleText).toBeVisible();
	});
});

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
