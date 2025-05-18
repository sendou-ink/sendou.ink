import test, { expect } from "@playwright/test";
import { impersonate, navigate, seed, submit } from "~/utils/playwright";
import { LFG_PAGE } from "~/utils/urls";

test.describe("LFG", () => {
	test("adds a new lfg post", async ({ page }) => {
		await seed(page);
		await impersonate(page);
		await navigate({
			page,
			url: LFG_PAGE,
		});

		await page.getByTestId("anything-adder-menu-button").click();
		await page.getByTestId("menu-item-lfgPost").click();

		await page.getByLabel("Text").fill("looking for a cool team");

		await submit(page);

		// got redirected
		await expect(page.getByTestId("add-filter-button")).toBeVisible();
		await expect(page.getByText("looking for a cool team")).toBeVisible();
	});
});
