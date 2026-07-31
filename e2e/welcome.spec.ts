import { expect, test } from "./helpers/playwright";
import { FrontPage } from "./pages/front-page/front-page";

test.describe("Welcome", () => {
	test("navigates to the welcome page via the front page banner when not logged in", async ({
		page,
	}) => {
		const front = new FrontPage(page);
		await front.goto();

		const welcome = await front.openWelcomeBanner();

		await expect(welcome.locators.heading).toBeVisible();
	});
});
