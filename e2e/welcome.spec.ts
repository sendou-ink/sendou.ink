import { expect, navigate, test } from "./helpers/playwright";

test.describe("Welcome", () => {
	test("navigates to the welcome page via the front page banner when not logged in", async ({
		page,
	}) => {
		// await seed(page);
		await navigate({ page, url: "/" });

		await page
			.getByRole("link", { name: "New to competitive Splatoon? Start here!" })
			.click();

		await expect(
			page.getByRole("heading", {
				name: "Introduction to competitive Splatoon and sendou.ink",
			}),
		).toBeVisible();
	});
});
