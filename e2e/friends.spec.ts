import { NZAP_TEST_ID } from "~/db/seed/constants";
import { expect, impersonate, test } from "./helpers/playwright";
import { FriendsPage } from "./pages/friends/friends-page";
import { NotificationPopover } from "./pages/layout/notification-popover";

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
});
