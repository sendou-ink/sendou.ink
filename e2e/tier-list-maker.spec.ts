import type { Locator, Page } from "@playwright/test";
import { TIER_LIST_MAKER_URL } from "~/utils/urls";
import { expect, navigate, test } from "./helpers/playwright";

test.describe("Tier List Maker", () => {
	test("toggles work, items can be dragged, and state persists after reload", async ({
		page,
	}) => {
		await navigate({ page, url: TIER_LIST_MAKER_URL });

		await page.getByText("Drag & drop").click();

		const emptyTiers = page.getByText("Drop items here");

		await expect(emptyTiers).toHaveCount(5);

		// Test that toggles are clickable (just verify they work)
		await page.getByText("No duplicates").click();
		await page.getByText("Show tier headers").click();
		await page.getByText("Hide alt kits").click();
		await page.getByText("Hide alt skins").click();

		// Drag first weapon to first tier
		const firstWeapon = page.locator('[data-item-id^="main-weapon:"]').first();
		await dragItemToTier(page, firstWeapon);

		// Drag second weapon to second tier
		const secondWeapon = page.locator('[data-item-id^="main-weapon:"]').first();
		await dragItemToTier(page, secondWeapon);

		// Switch to Stages tab and drag a stage
		await page.getByText("Stages").click();

		const firstStage = page.locator('[data-item-id^="stage:"]').first();
		await expect(firstStage).toBeVisible();
		await dragItemToTier(page, firstStage);

		// Wait for state to settle
		await page.waitForTimeout(1000);

		// Reload the page
		await page.reload();

		// Placement mode is not persisted, so re-enter drag & drop mode
		await page.getByText("Drag & drop").click();

		// Verify items persisted in the tier list (not in the pool)
		// Should have fewer than 5 "Drop items here" (meaning at least 1 tier is filled)
		await expect(emptyTiers).toHaveCount(3);
	});

	test("click to place mode adds items to the selected tier", async ({
		page,
	}) => {
		await navigate({ page, url: TIER_LIST_MAKER_URL });

		// Click to place is the default mode
		const emptyTiers = page.getByText("Click items to add here");
		await expect(emptyTiers).toHaveCount(5);

		// The first tier is selected by default, clicking a weapon places it there
		await page.locator('button[data-item-id^="main-weapon:"]').first().click();
		await expect(emptyTiers).toHaveCount(4);

		// Selecting another tier and clicking a weapon places it there
		await emptyTiers.first().click();
		await page.locator('button[data-item-id^="main-weapon:"]').first().click();
		await expect(emptyTiers).toHaveCount(3);
	});
});

async function dragItemToTier(page: Page, item: Locator) {
	await item.hover();
	await page.mouse.down();
	const tier = page.getByText("Drop items here").last();
	const tierBox = await tier.boundingBox();
	if (tierBox) {
		await page.mouse.move(
			tierBox.x + tierBox.width / 2,
			tierBox.y + tierBox.height / 2,
			{ steps: 10 },
		);
	}
	await page.mouse.up();
	await page.waitForTimeout(200);
}
