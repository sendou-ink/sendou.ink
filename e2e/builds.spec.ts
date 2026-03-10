import type { Page } from "@playwright/test";
import { NZAP_TEST_DISCORD_ID, NZAP_TEST_ID } from "~/db/seed/constants";
import type { GearType } from "~/db/tables";
import { ADMIN_DISCORD_ID } from "~/features/admin/admin-constants";
import { newBuildBaseSchema } from "~/features/user-page/user-page-schemas";
import { expect, impersonate, navigate, seed, test } from "~/utils/playwright";
import { createFormHelpers } from "~/utils/playwright-form";
import { BUILDS_PAGE, userBuildsPage, userNewBuildPage } from "~/utils/urls";

test.describe("Builds", () => {
	test("adds a build", async ({ page }) => {
		await seed(page);
		await impersonate(page, NZAP_TEST_ID);
		await navigate({
			page,
			url: userNewBuildPage({ discordId: NZAP_TEST_DISCORD_ID }),
		});

		const form = createFormHelpers(page, newBuildBaseSchema);

		await form.selectWeapons("weapons", ["Tenta Brella", "Splat Brella"]);

		await selectGear({
			type: "HEAD",
			name: "White Headband",
			page,
		});
		await selectGear({
			type: "CLOTHES",
			name: "Basic Tee",
			page,
		});
		await selectGear({
			type: "SHOES",
			name: "Blue Lo-Tops",
			page,
		});

		for (let i = 0; i < 12; i++) {
			await page.getByTestId("ISM-ability-button").click();
		}

		await form.fill("title", "Test Build");
		await form.fill("description", "Test Description");
		await form.checkItems("modes", ["TC"]);

		await form.submit();

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

		const form = createFormHelpers(page, newBuildBaseSchema);
		await form.check("private");

		await form.submit();

		await expect(page.getByTestId("user-builds-tab")).toContainText(
			"Builds (50)",
		);
		await expect(page.getByTestId("build-card").first()).toContainText(
			"Private",
		);

		await impersonate(page, NZAP_TEST_ID);
		await navigate({
			page,
			url: userBuildsPage({ discordId: ADMIN_DISCORD_ID }),
		});
		await expect(page.getByTestId("user-builds-tab")).toContainText(
			"Builds (49)",
		);
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
		await expect(page.getByTestId("build-card").first()).toBeVisible();

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

async function selectGear({
	page,
	name,
	type,
}: {
	page: Page;
	name: string;
	type: GearType;
}) {
	await page.getByTestId(`${type}-gear-select`).click();
	await page.getByPlaceholder("Search gear...").fill(name);
	await page
		.getByRole("listbox", { name: "Suggestions" })
		.getByTestId(`gear-select-option-${name}`)
		.click();
}
