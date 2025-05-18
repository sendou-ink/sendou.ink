import { expect, test } from "@playwright/test";
import { navigate, seed } from "~/utils/playwright";
import { topSearchPage, userPage } from "~/utils/urls";

test.describe("Top search", () => {
	test("views different x rank placements", async ({ page }) => {
		await seed(page);

		await navigate({
			page,
			url: topSearchPage(),
		});

		await page.getByTestId("xsearch-select").selectOption("3-2023-TC-WEST");
		await expect(page.getByText("Brasario")).toBeVisible();
	});

	test("navigates from user page to x search player page to x search", async ({
		page,
	}) => {
		await seed(page);

		await navigate({
			page,
			url: userPage({ customUrl: "sendou", discordId: "" }),
		});

		await page.getByTestId("placements-box").click();
		await page.getByTestId("placement-row-0").click();

		await expect(page.getByText("Twig?")).toBeVisible();
	});
});
