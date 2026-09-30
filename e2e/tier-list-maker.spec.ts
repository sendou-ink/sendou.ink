import { expect, test } from "./helpers/playwright";
import { TierListMakerPage } from "./pages/tier-list-maker/tier-list-maker-page";

test.describe("Tier List Maker", () => {
	test("toggles work, items can be dragged, and state persists after reload", async ({
		page,
	}) => {
		const tierList = new TierListMakerPage(page);
		await tierList.goto();

		await tierList.setPlacementMode("drag");

		await expect(tierList.locators.emptyTiersDragMode).toHaveCount(5);

		await tierList.toggle("noDuplicates");
		await tierList.toggle("showTierHeaders");
		await tierList.toggle("hideAltKits");
		await tierList.toggle("hideAltSkins");

		await tierList.dragFirstItemToLastEmptyTier("main-weapon");
		await tierList.dragFirstItemToLastEmptyTier("main-weapon");

		await tierList.openTab("stage");
		await expect(tierList.poolItems("stage").first()).toBeVisible();
		await tierList.dragFirstItemToLastEmptyTier("stage");

		await tierList.reload();

		// placement mode is not persisted, unlike the tiers themselves
		await tierList.setPlacementMode("drag");

		// each of the three dragged items landed in a tier of its own
		await expect(tierList.locators.emptyTiersDragMode).toHaveCount(2);
	});

	test("click to place mode adds items to the selected tier", async ({
		page,
	}) => {
		const tierList = new TierListMakerPage(page);
		await tierList.goto();

		await tierList.setPlacementMode("click");
		await expect(tierList.locators.emptyTiersClickMode).toHaveCount(5);

		// the first tier is selected by default
		await tierList.clickFirstItem("main-weapon");
		await expect(tierList.locators.emptyTiersClickMode).toHaveCount(4);

		await tierList.selectFirstEmptyTier();
		await tierList.clickFirstItem("main-weapon");
		await expect(tierList.locators.emptyTiersClickMode).toHaveCount(3);
	});

	test("tiers are reordered by dragging their handle", async ({ page }) => {
		const tierList = new TierListMakerPage(page);
		await tierList.goto();

		expect(await tierList.tierIds()).toEqual([
			"tier-x",
			"tier-s",
			"tier-a",
			"tier-b",
			"tier-c",
		]);

		await tierList.dragTier({ from: 0, to: 2 });

		expect(await tierList.tierIds()).toEqual([
			"tier-s",
			"tier-a",
			"tier-x",
			"tier-b",
			"tier-c",
		]);

		await tierList.reload();

		expect(await tierList.tierIds()).toEqual([
			"tier-s",
			"tier-a",
			"tier-x",
			"tier-b",
			"tier-c",
		]);
	});
});
