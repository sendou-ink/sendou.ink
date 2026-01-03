import test, { expect, type Page } from "@playwright/test";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import {
	impersonate,
	navigate,
	seed,
	waitForPOSTResponse,
} from "~/utils/playwright";
import { ADMIN_PAGE, SUSPENDED_PAGE } from "~/utils/urls";

async function banUser(
	page: Page,
	options: { duration?: string; reason?: string },
) {
	const banForm = page
		.locator("form")
		.filter({ has: page.locator("h2", { hasText: /^Ban user$/ }) });

	const comboboxButton = banForm.getByRole("button", {
		name: "User search User",
	});
	await expect(comboboxButton).not.toBeDisabled();
	await comboboxButton.click();

	const searchInput = page.getByTestId("user-search-input");
	await searchInput.fill("N-ZAP");

	const option = page.getByTestId("user-search-item").first();
	await option.click();

	if (options.duration) {
		await banForm.locator('input[name="duration"]').fill(options.duration);
	}
	if (options.reason) {
		await banForm.locator('input[name="reason"]').fill(options.reason);
	}

	await waitForPOSTResponse(page, () =>
		banForm.getByRole("button", { name: "Save" }).click(),
	);

	// Verify ban was successful
	await expect(page.getByText("User banned")).toBeVisible();
}

async function unbanUser(page: Page) {
	const unbanForm = page
		.locator("form")
		.filter({ has: page.locator("h2", { hasText: /^Unban user$/ }) });

	const comboboxButton = unbanForm.getByRole("button", {
		name: "User search User",
	});
	await expect(comboboxButton).not.toBeDisabled();
	await comboboxButton.click();

	const searchInput = page.getByTestId("user-search-input");
	await searchInput.fill("N-ZAP");

	const option = page.getByTestId("user-search-item").first();
	await option.click();

	await waitForPOSTResponse(page, () =>
		unbanForm.getByRole("button", { name: "Save" }).click(),
	);
}

test.describe("User banning", () => {
	test("banned user is redirected to suspended page and cannot access site", async ({
		page,
	}) => {
		await seed(page);

		// 1. As admin, ban NZAP user
		await impersonate(page, ADMIN_ID);
		await navigate({ page, url: ADMIN_PAGE });
		await banUser(page, { reason: "Test ban reason" });

		// 2. As the banned user, try to access the site
		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: "/" });

		// Should be redirected to suspended page
		await expect(page).toHaveURL(SUSPENDED_PAGE);
		await expect(page.getByText("Account suspended")).toBeVisible();
		await expect(page.getByText("Reason: Test ban reason")).toBeVisible();
		await expect(page.getByText("no end time set")).toBeVisible();

		// 3. Verify user cannot navigate to other pages
		await navigate({ page, url: "/builds" });
		await expect(page).toHaveURL(SUSPENDED_PAGE);

		await navigate({ page, url: "/calendar" });
		await expect(page).toHaveURL(SUSPENDED_PAGE);

		// 4. As admin, unban the user
		await impersonate(page, ADMIN_ID);
		await navigate({ page, url: ADMIN_PAGE });
		await unbanUser(page);

		// 5. As the unbanned user, verify they can access the site
		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: "/" });

		// Should not be redirected to suspended page
		await expect(page).not.toHaveURL(SUSPENDED_PAGE);
	});

	test("timed ban shows expiration date on suspended page", async ({
		page,
	}) => {
		await seed(page);

		// 1. As admin, ban NZAP user with a future duration
		await impersonate(page, ADMIN_ID);
		await navigate({ page, url: ADMIN_PAGE });

		// Set ban to expire tomorrow (well in the future)
		const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
		const year = tomorrow.getFullYear();
		const month = String(tomorrow.getMonth() + 1).padStart(2, "0");
		const day = String(tomorrow.getDate()).padStart(2, "0");
		const formattedDate = `${year}-${month}-${day}T12:00`;
		await banUser(page, { duration: formattedDate, reason: "Temporary ban" });

		// 2. As the banned user, verify redirected to suspended page
		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: "/" });

		await expect(page).toHaveURL(SUSPENDED_PAGE);
		await expect(page.getByText("Account suspended")).toBeVisible();
		await expect(page.getByText("Reason: Temporary ban")).toBeVisible();
		// Should show expiration time, not "no end time set"
		await expect(page.getByText("no end time set")).not.toBeVisible();
		await expect(page.getByText("Ends:")).toBeVisible();

		// Note: The actual time-based expiration logic is tested in unit tests
		// (see app/features/ban/core/banned.test.ts)
	});
});
