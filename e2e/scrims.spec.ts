import test, { expect } from "@playwright/test";
import { ADMIN_ID } from "~/constants";
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
});
