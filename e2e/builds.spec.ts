import type { Locator, Page } from "@playwright/test";
import { subDays } from "date-fns";
import { NZAP_TEST_DISCORD_ID, NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_DISCORD_ID, ADMIN_ID } from "~/features/admin/admin-constants";
import { newBuildBaseSchema } from "~/features/user-page/user-page-schemas";
import type {
	BuildAbilitiesTuple,
	GearType,
} from "~/modules/in-game-lists/types";
import invariant from "~/utils/invariant";
import { BUILDS_PAGE, userBuildsPage, userNewBuildPage } from "~/utils/urls";
import { expect, impersonate, navigate, test } from "./helpers/playwright";
import { createFormHelpers } from "./helpers/playwright-form";

const ABILITIES_WITH_ISM: BuildAbilitiesTuple = [
	["ISM", "ISM", "ISM", "ISM"],
	["SSU", "SSU", "SSU", "SSU"],
	["RSU", "RSU", "RSU", "RSU"],
];

const ABILITIES_WITHOUT_ISM: BuildAbilitiesTuple = [
	["SSU", "SSU", "SSU", "SSU"],
	["RSU", "RSU", "RSU", "RSU"],
	["QR", "QR", "QR", "QR"],
];

test.describe("Builds", () => {
	test("adds a build", async ({ page }) => {
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

	test("makes build private", async ({ page, factories }) => {
		// backdating one build makes the updatedAt sort deterministic
		const [olderBuild] = await factories.BuildFactory.createMany(2, {
			ownerId: ADMIN_ID,
		});
		await factories.backdate("Build", olderBuild.id, {
			updatedAt: subDays(new Date(), 1),
		});

		await impersonate(page);
		await navigate({
			page,
			url: userBuildsPage({ discordId: ADMIN_DISCORD_ID }),
		});

		const buildIdBefore = await buildIdFromEditLink(
			page.getByTestId("edit-build").first(),
		);

		await page.getByTestId("edit-build").first().click();

		const form = createFormHelpers(page, newBuildBaseSchema);
		await form.check("isPrivate");

		await form.submit();

		await expect(page.getByTestId("user-builds-tab")).toContainText(
			"Builds (2)",
		);
		await expect(page.getByTestId("build-card").first()).toContainText(
			"Private",
		);

		const buildIdAfter = await buildIdFromEditLink(
			page.getByTestId("edit-build").first(),
		);
		expect(buildIdAfter).toBe(buildIdBefore);

		await impersonate(page, NZAP_TEST_ID);
		await navigate({
			page,
			url: userBuildsPage({ discordId: ADMIN_DISCORD_ID }),
		});
		await expect(page.getByTestId("user-builds-tab")).toContainText(
			"Builds (1)",
		);
		await expect(page.getByTestId("build-card").first()).not.toContainText(
			"Private",
		);
	});

	test("filters builds", async ({ page, factories }) => {
		await factories.BuildFactory.createMany(3, {
			ownerId: ADMIN_ID,
			weaponSplIds: [40],
			modes: ["TC"],
			abilities: ABILITIES_WITH_ISM,
		});
		await factories.BuildFactory.createMany(2, {
			ownerId: ADMIN_ID,
			weaponSplIds: [40],
			modes: ["SZ"],
			abilities: ABILITIES_WITHOUT_ISM,
		});

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
		await expect(page.getByTestId("build-mode-TC")).toHaveCount(3);
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
		await expect(page.getByTestId("build-card")).toHaveCount(5);
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

async function buildIdFromEditLink(locator: Locator) {
	const href = await locator.getAttribute("href");
	invariant(href, "edit-build link missing href");
	const match = href.match(/buildId=(\d+)/);
	invariant(match, `buildId not found in href: ${href}`);
	return Number(match[1]);
}
