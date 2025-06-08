import test, { expect } from "@playwright/test";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import {
	impersonate,
	isNotVisible,
	navigate,
	seed,
	submit,
} from "~/utils/playwright";
import { tournamentOrganizationPage } from "~/utils/urls";

const url = tournamentOrganizationPage({
	organizationSlug: "sendouink",
});

test.describe("Tournament Organization", () => {
	test("user can be promoted to admin gaining org controls", async ({
		page,
	}) => {
		await seed(page);

		const editButtonLocator = page.getByTestId("edit-org-button");

		// 1. As a regular user, verify edit controls are not visible
		await impersonate(page, NZAP_TEST_ID);
		await navigate({
			page,
			url,
		});
		await isNotVisible(editButtonLocator);

		// 2. As admin, promote user to admin
		await impersonate(page, ADMIN_ID);
		await navigate({ page, url });
		await editButtonLocator.click();
		// Add member as admin
		await page.getByLabel("Role").first().selectOption("ADMIN");
		await submit(page);

		// 3. As the promoted user, verify edit controls are visible and page can be accessed
		await impersonate(page, NZAP_TEST_ID);
		await navigate({
			page,
			url,
		});
		await editButtonLocator.click();
		await expect(
			page.getByText("Editing tournament organization"),
		).toBeVisible();
	});
});
