import test, { expect } from "@playwright/test";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import {
	impersonate,
	isNotVisible,
	navigate,
	seed,
	selectUser,
	submit,
} from "~/utils/playwright";
import { tournamentOrganizationPage, tournamentPage } from "~/utils/urls";

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

	test("banned player cannot join a tournament of that organization", async ({
		page,
	}) => {
		await seed(page, "REG_OPEN");

		// 1. As admin, ban NZAP user from the organization
		await impersonate(page, ADMIN_ID);
		await navigate({ page, url });

		const bannedUsersTab = page.getByTestId("banned-users-tab");

		// Go to banned users section and add NZAP to ban list
		await bannedUsersTab.click();
		await page.getByText("New ban", { exact: true }).click();
		await selectUser({
			page,
			userName: "N-ZAP",
			labelName: "Player",
			exact: true,
		});
		await page.getByLabel("Private note").fill("Test reason");
		await submit(page);
		// The added ban should be visible in the table
		await expect(page.getByRole("table")).toContainText("Test reason");

		// 2. As the banned user, try to join a tournament
		await impersonate(page, NZAP_TEST_ID);
		await navigate({
			page,
			url: tournamentPage(1),
		});

		// Try to create a team
		await page.getByRole("tab", { name: "Register" }).click();

		// Fill in team details
		await page.getByLabel("Team name").fill("Banned Team");
		await page.getByRole("button", { name: "Save" }).click();

		// Verify error toast appears indicating user is banned
		await expect(page.getByText(/you are banned/i)).toBeVisible();

		// 3. As admin, remove the ban
		await impersonate(page, ADMIN_ID);
		await navigate({ page, url });
		await bannedUsersTab.click();
		await page.getByRole("button", { name: "Unban" }).click();
		await page.getByTestId("confirm-button").click();

		// 4. As the unbanned user, verify they can now join a tournament
		await impersonate(page, NZAP_TEST_ID);
		await navigate({
			page,
			url: tournamentPage(1),
		});
		await page.getByRole("tab", { name: "Register" }).click();

		// Try to create a team again
		await expect(page.getByText("Teams (0)")).toBeVisible();

		await page.getByLabel("Team name").fill("Unbanned Team");
		await page.getByRole("button", { name: "Save" }).click();

		await expect(page.getByText("Teams (1)")).toBeVisible();
	});
});
