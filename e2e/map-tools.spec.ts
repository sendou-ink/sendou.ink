import { stageIds, stagesObj } from "~/modules/in-game-lists/stage-ids";
import { expect, expectNoErrorPage, test } from "./helpers/playwright";
import { MapListGeneratorPage } from "./pages/maps/map-list-generator-page";
import { MapPlannerPage } from "./pages/plans/map-planner-page";

const GENERATED_MAP_LIST_LENGTH = stageIds.length * 2;

test.describe("Map List Generator", () => {
	test("generates a map list from a custom map pool", async ({ page }) => {
		const mapListPage = new MapListGeneratorPage(page);
		await mapListPage.goto();

		await mapListPage.clearMapPool();
		await expect(mapListPage.locators.createMapListButton).toBeDisabled();

		await mapListPage.toggleMode("Museum d'Alfonsino", "Splat Zones");
		await mapListPage.toggleMode("Hagglefish Market", "Splat Zones");
		await mapListPage.toggleMode("Manta Maria", "Tower Control");
		await expect(
			mapListPage.modeButton("Manta Maria", "Tower Control"),
		).toHaveAttribute("aria-pressed", "true");

		await mapListPage.reloadWithPersistedPool();
		await expect(
			mapListPage.modeButton("Museum d'Alfonsino", "Splat Zones"),
		).toHaveAttribute("aria-pressed", "true");

		await mapListPage.createMapList();

		const items = mapListPage.locators.generatedMapListItems;
		await expect(items).toHaveCount(GENERATED_MAP_LIST_LENGTH);
		await expect(items).toHaveText(
			Array.from(
				{ length: GENERATED_MAP_LIST_LENGTH },
				() => /^(SZ (Museum d'Alfonsino|Hagglefish Market)|TC Manta Maria)$/,
			),
		);
		await expect(
			items.filter({ hasText: "Manta Maria" }).first(),
		).toBeVisible();
	});
});

test.describe("Map Planner", () => {
	test("sets a stage background and adds a weapon to the canvas", async ({
		page,
	}) => {
		const planner = new MapPlannerPage(page);
		await planner.goto();
		await expectNoErrorPage(page);

		await expect(planner.locators.imageShapes).toHaveCount(0);

		await planner.setBackground("Museum d'Alfonsino");
		await expect(planner.locators.imageShapes).toHaveCount(1);

		await planner.openWeaponCategory("Shooters");
		await planner.dragWeaponToCanvas("Splattershot");
		await expect(planner.locators.imageShapes).toHaveCount(2);
	});

	test("restores the plan and the selected stage after a reload", async ({
		page,
	}) => {
		const planner = new MapPlannerPage(page);
		await planner.goto();

		await planner.setBackground("Museum d'Alfonsino");
		await expect(page).toHaveURL(/stage=/);

		await planner.openWeaponCategory("Shooters");
		await planner.dragWeaponToCanvas("Splattershot");
		await expect(planner.locators.imageShapes).toHaveCount(2);

		await planner.reloadWithPersistedPlan(2);

		await expect(planner.locators.imageShapes).toHaveCount(2);
		await expect(planner.locators.stageSelect).toHaveValue(
			String(stagesObj.MUSEUM_D_ALFONSINO),
		);
	});
});
