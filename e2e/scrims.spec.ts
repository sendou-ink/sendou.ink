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
		const INITIAL_AVAILABLE_TO_REQUEST_COUNT = 15;

		await seed(page);
		await impersonate(page, ADMIN_ID);
		await navigate({
			page,
			url: scrimsPage(),
		});

		const requestScrimButtonLocator = page.getByTestId("request-scrim-button");

		await page.getByTestId("available-scrims-tab").click();
		await requestScrimButtonLocator.first().click();

		await submit(page);

		await expect(requestScrimButtonLocator).toHaveCount(
			INITIAL_AVAILABLE_TO_REQUEST_COUNT - 1,
		);

		const togglePendingRequestsButton = page.getByTestId(
			"toggle-pending-requests-button",
		);

		await togglePendingRequestsButton.first().click();

		await page.getByTestId("view-request-button").first().click();

		const cancelButton = page.getByRole("button", {
			name: "Cancel",
		});
		await cancelButton.click();

		await expect(requestScrimButtonLocator).toHaveCount(
			INITIAL_AVAILABLE_TO_REQUEST_COUNT,
		);
	});

	test("accepts a request", async ({ page }) => {
		await seed(page);
		await impersonate(page, ADMIN_ID);
		await navigate({
			page,
			url: scrimsPage(),
		});

		await page.getByTestId("confirm-modal-trigger-button").first().click();
		await page.getByTestId("confirm-button").click();

		await page.getByTestId("booked-scrims-tab").click();

		const contactButtonLocator = page.getByRole("link", { name: "Contact" });

		await expect(contactButtonLocator).toHaveCount(2);

		await page.getByRole("link", { name: "Contact" }).first().click();

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
		await page.getByTestId("confirm-modal-trigger-button").first().click();
		await page.getByTestId("confirm-button").click();

		await page.getByTestId("booked-scrims-tab").click();

		await page.getByRole("link", { name: "Contact" }).first().click();

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
