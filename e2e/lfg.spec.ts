import {
	expect,
	impersonate,
	navigate,
	seed,
	submit,
	test,
} from "~/utils/playwright";
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

	test("creates post with custom languages", async ({ page }) => {
		await seed(page);
		await impersonate(page);
		await navigate({
			page,
			url: LFG_PAGE,
		});

		// create post with Japanese and Korean
		await page.getByTestId("anything-adder-menu-button").click();
		await page.getByTestId("menu-item-lfgPost").click();

		await page.getByLabel("Text").fill("looking for Japanese/Korean team");

		const languageSelect = page.getByLabel("Languages");
		await languageSelect.selectOption("ja");
		await languageSelect.selectOption("ko");

		await submit(page);

		// verify languages are displayed
		await expect(page.getByText("JA / KO")).toBeVisible();
	});

	test("edits post languages", async ({ page }) => {
		await seed(page);
		await impersonate(page);
		await navigate({
			page,
			url: LFG_PAGE,
		});

		// create post with Dansk
		await page.getByTestId("anything-adder-menu-button").click();
		await page.getByTestId("menu-item-lfgPost").click();

		await page.getByLabel("Text").fill("test post for language editing");

		const languageSelect = page.getByLabel("Languages");
		await languageSelect.selectOption("da");

		await submit(page);

		// wait for redirect to LFG page & verify the language is displayed
		await expect(page.getByText("DA / EN", { exact: true })).toBeVisible();
		await expect(page.getByTestId("add-filter-button")).toBeVisible();
		await expect(
			page.getByText("test post for language editing"),
		).toBeVisible();

		// remove Dansk and add Spanish
		await page.getByRole("link", { name: "Edit" }).first().click();
		await page.getByText("Dansk").locator("..").getByRole("button").click();
		await languageSelect.selectOption("es");

		await submit(page);

		// wait for redirect to LFG page
		await expect(page.getByTestId("add-filter-button")).toBeVisible();
		await expect(
			page.getByText("test post for language editing"),
		).toBeVisible();

		// verify updated language is displayed
		await expect(page.getByText("EN / ES", { exact: true })).toBeVisible();
	});

	test("filters posts by language", async ({ page }) => {
		await seed(page);
		await impersonate(page);
		await navigate({
			page,
			url: LFG_PAGE,
		});

		// create post with Japanese
		await page.getByTestId("anything-adder-menu-button").click();
		await page.getByTestId("menu-item-lfgPost").click();

		await page.getByLabel("Text").fill("Japanese speaking team");

		const languageSelect = page.getByLabel("Languages");
		await languageSelect.selectOption("ja");

		await submit(page);

		// wait for redirect to LFG page
		await expect(page.getByTestId("add-filter-button")).toBeVisible();
		await expect(page.getByText("Japanese speaking team")).toBeVisible();

		// filter by Japanese
		await page.getByTestId("add-filter-button").click();
		await page.getByText("Spoken language").click();
		await page.getByLabel("Spoken language").selectOption("ja");

		// verify Japanese post is visible
		await expect(page.getByText("Japanese speaking team")).toBeVisible();

		// change filter to Spanish
		await page.getByLabel("Spoken language").selectOption("es");

		// verify Japanese post is not visible
		await expect(page.getByText("Japanese speaking team")).not.toBeVisible();
	});
});
