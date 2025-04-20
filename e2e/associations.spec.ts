import test, { expect } from "@playwright/test";
import { ADMIN_ID } from "~/constants";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import {
	impersonate,
	isNotVisible,
	navigate,
	seed,
	submit,
} from "~/utils/playwright";
import { associationsPage, scrimsPage } from "~/utils/urls";

test.describe("Associations", () => {
	test("creates a new association", async ({ page }) => {
		await seed(page);
		await impersonate(page, NZAP_TEST_ID);
		await navigate({
			page,
			url: "/",
		});

		await page.getByTestId("anything-adder-menu-button").click();
		await page.getByTestId("menu-item-association").click();

		await page.getByLabel("Name").fill("My Association");
		await submit(page);

		await expect(
			page.getByRole("heading").filter({ hasText: "My Association" }),
		).toBeVisible();
	});

	test("deletes an association", async ({ page }) => {
		await seed(page);
		await impersonate(page, ADMIN_ID);
		await navigate({
			page,
			url: scrimsPage(),
		});
		await page.getByRole("link", { name: "Associations" }).click();

		await expect(page.getByTestId("delete-association")).toHaveCount(2);

		await page.getByTestId("delete-association").first().click();
		await page.getByTestId("confirm-button").click();

		await expect(page.getByTestId("delete-association")).toHaveCount(1);
	});

	test("joins and leaves an association", async ({ page }) => {
		await seed(page);
		await impersonate(page, ADMIN_ID);
		await navigate({
			page,
			url: associationsPage(),
		});

		const inviteLink = await page
			.getByLabel("Share link to add members")
			.first()
			.inputValue();

		await impersonate(page, NZAP_TEST_ID);
		await navigate({
			page,
			url: inviteLink.replace("https://sendou.ink", "http://localhost:5173"),
		});

		await submit(page);

		await page.getByTestId("leave-team-button").click();
		await page.getByTestId("confirm-button").click();

		await isNotVisible(page.getByTestId("leave-team-button"));
	});
});
