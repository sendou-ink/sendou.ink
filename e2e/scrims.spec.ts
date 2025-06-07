import test, { expect } from "@playwright/test";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import {
	impersonate,
	navigate,
	seed,
	selectUser,
	submit,
} from "~/utils/playwright";
import { scrimsPage } from "~/utils/urls";

test.describe("Scrims", () => {
	test("creates a new scrim & deletes it", async ({ page }) => {
		await seed(page);
		await impersonate(page, ADMIN_ID);
		await navigate({
			page,
			url: "/",
		});

		await page.getByTestId("anything-adder-menu-button").click();
		await page.getByTestId("menu-item-scrimPost").click();

		await page.getByLabel("With").selectOption("PICKUP");
		await selectUser({
			labelName: "User 2",
			page,
			userName: "N-ZAP",
		});
		await selectUser({
			labelName: "User 3",
			page,
			userName: "ab",
		});
		await selectUser({
			labelName: "User 4",
			page,
			userName: "de",
		});

		await page.getByLabel("Visibility").selectOption("2");
		await page.getByLabel("Text").fill("Test scrim");

		await submit(page);

		await expect(page.getByTestId("limited-visibility-popover")).toBeVisible();

		await page.getByRole("button", { name: "Delete" }).first().click();
		await page.getByTestId("confirm-button").click();

		await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(1);
	});

	test("requests an existing scrim post & cancels the request", async ({
		page,
	}) => {
		await seed(page);
		await impersonate(page, ADMIN_ID);
		await navigate({
			page,
			url: scrimsPage(),
		});

		await page.getByTestId("tab-Available").click();
		await page.getByRole("button", { name: "Request" }).first().click();

		await submit(page);

		await page.getByTestId("tab-Requests").click();

		const cancelRequestButton = page.getByRole("button", {
			name: "Cancel",
		});
		expect(cancelRequestButton).toHaveCount(5);
		await cancelRequestButton.first().click();
		await page.getByTestId("confirm-button").click();
		await expect(cancelRequestButton).toHaveCount(4);
	});

	test("accepts a request", async ({ page }) => {
		await seed(page);
		await impersonate(page, ADMIN_ID);
		await navigate({
			page,
			url: scrimsPage(),
		});

		await page.getByRole("button", { name: "Accept" }).first().click();
		await page.getByTestId("confirm-button").click();

		await page.getByRole("link", { name: "Contact" }).click();

		await expect(page.getByText("Scheduled scrim")).toBeVisible();
	});

	test("cancels a scrim and shows canceled status", async ({ page }) => {
		await seed(page);
		await impersonate(page, ADMIN_ID);
		await navigate({
			page,
			url: scrimsPage(),
		});

		// Accept the first available scrim request to make it possible to access the scrim details page
		await page.getByRole("button", { name: "Accept" }).first().click();
		await page.getByTestId("confirm-button").click();

		await page.getByRole("link", { name: "Contact" }).click();

		// Cancel the scrim
		await page.getByRole("button", { name: "Cancel" }).click();
		await page.getByLabel("Reason").fill("Oops something came up");
		await page.getByTestId("cancel-scrim-submit").click();

		// Go back to the scrims page and check if the scrim is marked as canceled
		await navigate({
			page,
			url: scrimsPage(),
		});
		await expect(page.getByText("Canceled")).toBeVisible();
	});
});
