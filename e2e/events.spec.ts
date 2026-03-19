import { expect, impersonate, navigate, seed, test } from "~/utils/playwright";
import { EVENTS_PAGE } from "~/utils/urls";

test.describe("Events", () => {
	test("filters between tabs and navigates to an event", async ({ page }) => {
		await seed(page);
		await impersonate(page);
		await navigate({ page, url: EVENTS_PAGE });

		await expect(page.getByText("My Events")).toBeVisible();

		const eventLinks = page.getByRole("link").filter({ hasText: /.+/ });
		await expect(eventLinks.first()).toBeVisible();

		await page.getByRole("link", { name: /Scrims/ }).click();
		await expect(
			page.getByRole("link").filter({ hasText: /.+/ }).first(),
		).toBeVisible();

		await page.getByRole("link", { name: /Saved/ }).click();
		await expect(page.getByText("No events in this category")).toBeVisible();

		await page.getByRole("link", { name: /Hosting/ }).click();
		const firstEventLink = page
			.getByRole("link")
			.filter({ hasText: /.+/ })
			.first();
		await expect(firstEventLink).toBeVisible();

		await firstEventLink.click();
		await expect(page).not.toHaveURL(/\/events/);
	});
});
