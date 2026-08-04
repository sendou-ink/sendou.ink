import { addDays, setHours, startOfHour } from "date-fns";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { SUSPENDED_PAGE } from "~/utils/urls";
import { expect, impersonate, navigate, test } from "./helpers/playwright";
import { AdminBanPage } from "./pages/ban/admin-ban-page";
import { SuspendedPage } from "./pages/ban/suspended-page";

test.describe("User banning", () => {
	test("banned user is redirected to suspended page and cannot access site", async ({
		page,
	}) => {
		await impersonate(page, ADMIN_ID);

		const adminBan = new AdminBanPage(page);
		await adminBan.goto();
		await adminBan.banUser("N-ZAP", { reason: "Test ban reason" });

		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: "/" });

		const suspended = new SuspendedPage(page);
		await expect(page).toHaveURL(SUSPENDED_PAGE);
		await expect(suspended.locators.heading).toBeVisible();
		await expect(suspended.reason("Test ban reason")).toBeVisible();
		await expect(suspended.locators.noEndTime).toBeVisible();

		await navigate({ page, url: "/builds" });
		await expect(page).toHaveURL(SUSPENDED_PAGE);

		await navigate({ page, url: "/calendar" });
		await expect(page).toHaveURL(SUSPENDED_PAGE);

		await impersonate(page, ADMIN_ID);
		await adminBan.goto();
		await adminBan.unbanUser("N-ZAP");

		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: "/" });

		await expect(page).not.toHaveURL(SUSPENDED_PAGE);
	});

	test("timed ban shows expiration date on suspended page", async ({
		page,
	}) => {
		await impersonate(page, ADMIN_ID);

		const adminBan = new AdminBanPage(page);
		await adminBan.goto();
		await adminBan.banUser("N-ZAP", {
			expiresAt: startOfHour(setHours(addDays(new Date(), 1), 12)),
			reason: "Temporary ban",
		});

		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: "/" });

		const suspended = new SuspendedPage(page);
		await expect(page).toHaveURL(SUSPENDED_PAGE);
		await expect(suspended.locators.heading).toBeVisible();
		await expect(suspended.reason("Temporary ban")).toBeVisible();
		await expect(suspended.locators.noEndTime).not.toBeVisible();
		await expect(suspended.locators.endsAt).toBeVisible();

		// the time based expiration logic itself is covered by app/features/ban/core/banned.test.ts
	});
});
