import { NZAP_TEST_ID } from "~/db/seed/constants";
import { expect, impersonate, test } from "./helpers/playwright";
import { FriendsPage } from "./pages/friends/friends-page";

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

		await expect(friends.locators.acceptButton).toBeVisible();
		await friends.acceptRequest();

		await friends.friend("Sendou").deleteFriend();

		await expect(friends.locators.noFriendsText).toBeVisible();
	});
});
