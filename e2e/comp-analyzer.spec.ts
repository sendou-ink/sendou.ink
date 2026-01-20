import { expect, navigate, test } from "~/utils/playwright";
import { COMP_ANALYZER_URL } from "~/utils/urls";

test.describe("Composition Analyzer", () => {
	test("weapon selection, removal, and URL persistence", async ({ page }) => {
		await navigate({ page, url: COMP_ANALYZER_URL });

		const selectedWeapons = page.getByTestId("selected-weapons");
		await expect(selectedWeapons).toBeVisible();

		// Initially no weapons selected - check for "Pick a weapon" text
		await expect(page.getByText("Pick a weapon")).toHaveCount(4);

		// Click on Splattershot (weapon ID 40)
		await page.getByTestId("weapon-button-40").click();

		// First slot should now have the weapon
		await expect(page.getByTestId("selected-weapon-0")).toBeVisible();
		await expect(page.getByText("Pick a weapon")).toHaveCount(3);

		// Remove the weapon
		await page.getByTestId("remove-weapon-0").click();
		await expect(page.getByText("Pick a weapon")).toHaveCount(4);

		// Select 4 weapons to test auto-collapse
		const categorizationToggle = page.getByTestId("categorization-toggle");
		await expect(categorizationToggle).toBeVisible();

		await page.getByTestId("weapon-button-40").click();
		await page.getByTestId("weapon-button-50").click();
		await page.getByTestId("weapon-button-60").click();
		await page.getByTestId("weapon-button-70").click();

		// Grid should auto-collapse
		await expect(categorizationToggle).not.toBeVisible();

		// URL should contain weapons parameter
		const url = page.url();
		expect(url).toContain("weapons=");

		// Reload the page to test URL persistence
		await page.reload();

		// Weapons should still be selected after reload
		await expect(page.getByTestId("selected-weapon-0")).toBeVisible();
		await expect(page.getByTestId("selected-weapon-1")).toBeVisible();
		await expect(page.getByTestId("selected-weapon-2")).toBeVisible();
		await expect(page.getByTestId("selected-weapon-3")).toBeVisible();
	});

	test("weapon grid controls and categorization", async ({ page }) => {
		await navigate({ page, url: COMP_ANALYZER_URL });

		// Default is "category" - verify the radio is checked
		const categoryRadio = page.getByTestId("categorization-category");
		await expect(categoryRadio).toBeChecked();

		// Switch to sub categorization
		await page.getByTestId("categorization-sub").click();
		await expect(page.getByTestId("categorization-sub")).toBeChecked();

		// Switch to special categorization
		await page.getByTestId("categorization-special").click();
		await expect(page.getByTestId("categorization-special")).toBeChecked();

		// Test grid collapse/expand
		const toggleButton = page.getByTestId("weapon-grid-toggle");
		const categorizationToggle = page.getByTestId("categorization-toggle");

		// Grid should be expanded
		await expect(categorizationToggle).toBeVisible();

		// Collapse the grid
		await toggleButton.click();
		await expect(categorizationToggle).not.toBeVisible();

		// Expand the grid
		await toggleButton.click();
		await expect(categorizationToggle).toBeVisible();

		// Switch categorization and test URL persistence
		await page.getByTestId("categorization-sub").click();
		const url = page.url();
		expect(url).toContain("categorization=sub");

		// Reload the page
		await page.reload();

		// Categorization should still be sub after reload
		await expect(page.getByTestId("categorization-sub")).toBeChecked();
	});

	test("analysis sections appear and can be collapsed", async ({ page }) => {
		await navigate({ page, url: COMP_ANALYZER_URL });

		const damageComboList = page.getByTestId("damage-combo-list");
		const rangeVisualization = page.getByTestId("range-visualization");

		// Both should not be visible initially
		await expect(damageComboList).not.toBeVisible();
		await expect(rangeVisualization).not.toBeVisible();

		// Select one weapon - damage combo still not visible
		await page.getByTestId("weapon-button-40").click();
		await expect(damageComboList).not.toBeVisible();

		// Select a second weapon with range data (blaster - ID 210)
		await page.getByTestId("weapon-button-210").click();

		// Both damage combo list and range visualization should now be visible
		await expect(damageComboList).toBeVisible();
		await expect(rangeVisualization).toBeVisible();

		// Test damage combo list collapse/expand
		const damageComboToggle = page.getByTestId("damage-combo-toggle");

		// Should be expanded by default - look for content inside
		await expect(
			damageComboList.locator(".content, [class*='content']"),
		).toBeVisible();

		// Collapse
		await damageComboToggle.click();
		await expect(
			damageComboList.locator(".content, [class*='content']"),
		).not.toBeVisible();

		// Expand again
		await damageComboToggle.click();
		await expect(
			damageComboList.locator(".content, [class*='content']"),
		).toBeVisible();
	});

	test("damage combo sliders and filtering work correctly", async ({
		page,
	}) => {
		await navigate({ page, url: COMP_ANALYZER_URL });

		// Select Splattershot Jr. (ID 10) which has Splat Bomb sub
		await page.getByTestId("weapon-button-10").click();
		// Select Splattershot (ID 40) as second weapon
		await page.getByTestId("weapon-button-40").click();

		const damageComboList = page.getByTestId("damage-combo-list");
		await expect(damageComboList).toBeVisible();

		// Part 1: Test Sub Defense slider
		const sliders = damageComboList.locator("input[type='range']");
		const subDefenseSlider = sliders.first();

		// Get initial damage values - find a combo row with sub weapon damage
		const initialDamageValues = await damageComboList
			.locator("[class*='damageValue']")
			.allTextContents();

		// Increase Sub Defense slider to max
		await subDefenseSlider.fill("57");

		// Get new damage values - they should be different (reduced for sub weapons)
		const newDamageValues = await damageComboList
			.locator("[class*='damageValue']")
			.allTextContents();

		// Verify damage values changed
		expect(initialDamageValues.join(",")).not.toEqual(
			newDamageValues.join(","),
		);

		// Reset slider
		await subDefenseSlider.fill("0");

		// Part 2: Test Ink Resistance slider
		const inkResSlider = sliders.nth(1);

		// Get initial ink time frames if any exist
		const initialInkTimes = await damageComboList
			.locator("[class*='inkTime']")
			.allTextContents();

		// Increase Ink Resistance slider
		await inkResSlider.fill("57");

		// Get new ink time frames
		const newInkTimes = await damageComboList
			.locator("[class*='inkTime']")
			.allTextContents();

		// If there were ink times, they should have increased or more ink combos should appear
		if (initialInkTimes.length > 0 || newInkTimes.length > 0) {
			const initialTotalFrames = initialInkTimes.reduce(
				(sum, t) => sum + (Number.parseInt(t, 10) || 0),
				0,
			);
			const newTotalFrames = newInkTimes.reduce(
				(sum, t) => sum + (Number.parseInt(t, 10) || 0),
				0,
			);
			expect(newTotalFrames).toBeGreaterThanOrEqual(initialTotalFrames);
		}

		// Part 3: Test damage type filtering
		const damageTypeLabels = damageComboList.locator(
			"[class*='damageTypeLabel']",
		);
		const firstDamageTypeLabel = damageTypeLabels.first();

		// Store the damage type text before clicking
		const damageTypeText = await firstDamageTypeLabel.textContent();

		// Verify no filtered items exist initially (use button selector to avoid matching filteredItemsRow)
		const filteredItemsSelector = "button[class*='filteredItem']";
		await expect(damageComboList.locator(filteredItemsSelector)).toHaveCount(0);

		// Click to filter out this damage type
		await firstDamageTypeLabel.click();

		// Verify at least one filtered item appears
		const filteredItems = damageComboList.locator(filteredItemsSelector);
		const filteredCount = await filteredItems.count();
		expect(filteredCount).toBeGreaterThan(0);

		// Verify the first filtered item contains the expected damage type
		await expect(filteredItems.first()).toContainText(damageTypeText ?? "");

		// Click the first filtered item to restore it
		await filteredItems.first().click();

		// Verify the count decreased by one
		await expect(filteredItems).toHaveCount(filteredCount - 1);
	});
});
