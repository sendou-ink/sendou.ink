import { ADMIN_ID } from "~/features/admin/admin-constants";
import { expect, impersonate, navigate, test } from "./helpers/playwright";
import { NotificationPopover } from "./pages/layout/notification-popover";

const UNSEEN_COUNT = 2;

test.describe("Notifications", () => {
	test("opening the popover clears the bell dot but keeps the unseen dots listed", async ({
		page,
		factories,
	}) => {
		for (let seasonNth = 1; seasonNth <= UNSEEN_COUNT; seasonNth++) {
			await factories.NotificationFactory.create({
				notification: { type: "SEASON_STARTED", meta: { seasonNth } },
				users: [{ userId: ADMIN_ID, seen: 0 }],
			});
		}

		await impersonate(page);
		await navigate({ page, url: "/" });

		const notifications = new NotificationPopover(page);
		await expect(notifications.locators.bellDot).toBeVisible();

		await notifications.open();

		await expect(notifications.locators.bellDot).toBeHidden();
		await expect(notifications.locators.unseenDots).toHaveCount(UNSEEN_COUNT);

		await notifications.close();
		await expect(notifications.locators.items).toHaveCount(0);

		await notifications.open();

		await expect(notifications.locators.items).toHaveCount(UNSEEN_COUNT);
		await expect(notifications.locators.unseenDots).toHaveCount(0);
	});
});
