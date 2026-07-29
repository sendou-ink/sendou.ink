import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { NOTIFICATIONS } from "~/features/notifications/notifications-contants";
import { badgePage } from "~/utils/urls";
import { expect, impersonate, navigate, test } from "./helpers/playwright";
import { BadgePage } from "./pages/badges/badge-page";
import { NotificationPopover } from "./pages/layout/notification-popover";

const BADGE_NAME = "4v4 Sundaes";

test.describe("Badges", () => {
	test("adds a badge owner sending a notification", async ({
		page,
		factories,
	}) => {
		const badge = await factories.BadgeFactory.create(
			{ displayName: BADGE_NAME },
			{ managerIds: [NZAP_TEST_ID] },
		);
		// the popover links onwards only once its peek list is full
		for (let seasonNth = 1; seasonNth < NOTIFICATIONS.PEEK_COUNT; seasonNth++) {
			await factories.NotificationFactory.create({
				notification: { type: "SEASON_STARTED", meta: { seasonNth } },
				users: [{ userId: ADMIN_ID, seen: 1 }],
			});
		}

		await impersonate(page, NZAP_TEST_ID);

		const badgeDetails = new BadgePage(page);
		await badgeDetails.goto(badge.id);

		const badgeEdit = await badgeDetails.openEdit();
		await badgeEdit.addOwner("Sendou");
		await badgeEdit.save();

		await expect(badgeDetails.owner("Sendou")).toBeVisible();

		await impersonate(page);
		await navigate({ page, url: "/" });

		const notifications = new NotificationPopover(page);
		await notifications.open();
		await notifications.openNotification(`New badge (${BADGE_NAME})`);

		await expect(page).toHaveURL(badgePage(badge.id));

		await notifications.open();
		const allNotifications = await notifications.openAll();

		await expect(allNotifications.locators.heading).toBeVisible();
	});
});
