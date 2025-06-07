import { expect, test } from "@playwright/test";
import { impersonate, navigate, seed, selectUser } from "~/utils/playwright";
import { badgePage } from "~/utils/urls";
import { NZAP_TEST_ID } from "../app/db/seed/constants";

test.describe("Badges", () => {
	test("adds a badge owner sending a notification", async ({ page }) => {
		await seed(page);
		await impersonate(page, NZAP_TEST_ID);
		await navigate({
			page,
			url: badgePage(1),
		});

		await page.getByRole("link", { name: "Edit", exact: true }).click();

		await selectUser({
			page,
			userName: "Sendou",
			labelName: "Add new owner",
		});

		await page.getByRole("button", { name: "Submit", exact: true }).click();

		await impersonate(page);
		await navigate({
			page,
			url: "/",
		});

		await page.getByTestId("notifications-button").click();
		await page.getByText("New badge (4v4 Sundaes)").click();

		await expect(page).toHaveURL(badgePage(1));

		await page.getByTestId("notifications-button").click();
		await page.getByTestId("notifications-see-all-button").click();

		await expect(
			page.getByRole("heading", { name: "Notifications" }),
		).toBeVisible();
	});
});
