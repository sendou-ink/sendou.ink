import { expect, test } from "@playwright/test";
import { ADMIN_DISCORD_ID } from "~/constants";
import { NZAP_TEST_DISCORD_ID, NZAP_TEST_ID } from "~/db/seed/constants";
import {
	impersonate,
	navigate,
	seed,
	selectComboboxValue,
} from "~/utils/playwright";
import { BUILDS_PAGE, userBuildsPage, userNewBuildPage } from "~/utils/urls";

test.describe("Builds", () => {
	test("adds a build", async ({ page }) => {
		await seed(page);
		await impersonate(page, NZAP_TEST_ID);
		await navigate({
			page,
			url: userNewBuildPage({ discordId: NZAP_TEST_DISCORD_ID }),
		});

		await selectComboboxValue({
			locator: page.getByTestId("weapon-combobox-input").first(),
			value: "Tenta Brella",
			page,
		});
		await page.getByTestId("add-weapon-button").click();
		await selectComboboxValue({
			locator: page.getByTestId("weapon-combobox-input").nth(1),
			value: "Splat Brella",
			page,
		});

		await selectComboboxValue({
			inputName: "HEAD",
			value: "White Headband",
			page,
		});
		await selectComboboxValue({
			inputName: "CLOTHES",
			value: "Basic Tee",
			page,
		});
		await selectComboboxValue({
			inputName: "SHOES",
			value: "Blue Lo-Tops",
			page,
		});

		for (let i = 0; i < 12; i++) {
			await page.getByTestId("ISM-ability-button").click();
		}

		await page.getByLabel("Title").fill("Test Build");
		await page.getByLabel("Description").fill("Test Description");
		await page.getByTestId("SZ-checkbox").click();

		await page.getByTestId("submit-button").click();

		await expect(page.getByTestId("change-sorting-button")).toBeVisible();

		const firstBuildCard = page.getByTestId("build-card").first();

		await expect(firstBuildCard.getByAltText("Tenta Brella")).toBeVisible();
		await expect(firstBuildCard.getByAltText("Splat Brella")).toBeVisible();

		await expect(firstBuildCard.getByAltText("Tower Control")).toBeVisible();
		await expect(firstBuildCard.getByAltText("Splat Zones")).not.toBeVisible();

		await expect(firstBuildCard.getByTestId("build-title")).toContainText(
			"Test Build",
		);
	});

	test("makes build private", async ({ page }) => {
		await seed(page);
		await impersonate(page);
		await navigate({
			page,
			url: userBuildsPage({ discordId: ADMIN_DISCORD_ID }),
		});

		await page.getByTestId("edit-build").first().click();

		await page.getByLabel("Private").click();

		await page.getByTestId("submit-button").click();

		await expect(page.getByTestId("builds-tab")).toContainText("Builds (50)");
		await expect(page.getByTestId("build-card").first()).toContainText(
			"Private",
		);

		await impersonate(page, NZAP_TEST_ID);
		await navigate({
			page,
			url: userBuildsPage({ discordId: ADMIN_DISCORD_ID }),
		});
		await expect(page.getByTestId("builds-tab")).toContainText("Builds (49)");
		await expect(page.getByTestId("build-card").first()).not.toContainText(
			"Private",
		);
	});

	test("filters builds", async ({ page }) => {
		await seed(page);
		await navigate({
			page,
			url: BUILDS_PAGE,
		});

		await page.getByTestId("weapon-40-link").click();

		//
		// ability filter
		//
		await page.getByTestId("add-filter-button").click();
		await page.getByTestId("menu-item-ability").click();
		await page.getByTestId("comparison-select").selectOption("AT_MOST");

		await expect(page.getByTestId("ISM-ability")).toHaveCount(1);

		await page.getByTestId("delete-filter-button").click();

		// are we seeing builds with ISM again?
		await expect(page.getByTestId("ISM-ability").nth(1)).toBeVisible();

		//
		// mode filter
		//
		await page.getByTestId("add-filter-button").click();
		await page.getByTestId("menu-item-mode").click();
		await page.getByLabel("Tower Control").click();
		await expect(page.getByTestId("build-mode-TC")).toHaveCount(24);
		await page.getByTestId("delete-filter-button").click();

		//
		// date filter
		//
		await page.getByTestId("add-filter-button").click();
		await page.getByTestId("menu-item-date").click();
		await page.getByTestId("date-select").selectOption("CUSTOM");
		await expect(page.getByTestId("date-input")).toBeVisible();
		// no change in count since all builds in test data are new
		await expect(page.getByTestId("build-card")).toHaveCount(24);
	});
});
