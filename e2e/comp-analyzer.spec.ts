import { expect, test } from "./helpers/playwright";
import { CompAnalyzerPage } from "./pages/comp-analyzer/comp-analyzer-page";

test.describe("Composition Analyzer", () => {
	test("weapon selection, removal, and URL persistence", async ({ page }) => {
		const compAnalyzer = new CompAnalyzerPage(page);
		await compAnalyzer.goto();

		await expect(compAnalyzer.locators.selectedWeapons).toBeVisible();

		await expect(compAnalyzer.locators.emptyWeaponSlots).toHaveCount(4);

		await compAnalyzer.selectWeapon(40);

		// First slot should now have the weapon
		await expect(compAnalyzer.selectedWeapon(0)).toBeVisible();
		await expect(compAnalyzer.locators.emptyWeaponSlots).toHaveCount(3);

		await compAnalyzer.removeWeapon(0);
		await expect(compAnalyzer.locators.emptyWeaponSlots).toHaveCount(4);

		// Select 4 weapons to test auto-collapse
		await expect(compAnalyzer.locators.categorizationToggle).toBeVisible();

		await compAnalyzer.selectWeapon(40);
		await compAnalyzer.selectWeapon(50);
		await compAnalyzer.selectWeapon(60);
		await compAnalyzer.selectWeapon(70);

		await expect(compAnalyzer.locators.categorizationToggle).not.toBeVisible();

		await expect(page).toHaveURL(/weapons=/);

		// Weapons should still be selected after reload
		await page.reload();

		await expect(compAnalyzer.selectedWeapon(0)).toBeVisible();
		await expect(compAnalyzer.selectedWeapon(1)).toBeVisible();
		await expect(compAnalyzer.selectedWeapon(2)).toBeVisible();
		await expect(compAnalyzer.selectedWeapon(3)).toBeVisible();
	});

	test("weapon grid controls and categorization", async ({ page }) => {
		const compAnalyzer = new CompAnalyzerPage(page);
		await compAnalyzer.goto();

		await expect(compAnalyzer.categorizationRadio("category")).toBeChecked();

		await compAnalyzer.selectCategorization("sub");
		await expect(compAnalyzer.categorizationRadio("sub")).toBeChecked();

		await compAnalyzer.selectCategorization("special");
		await expect(compAnalyzer.categorizationRadio("special")).toBeChecked();

		// Grid should be expanded
		await expect(compAnalyzer.locators.categorizationToggle).toBeVisible();

		await compAnalyzer.toggleWeaponGrid();
		await expect(compAnalyzer.locators.categorizationToggle).not.toBeVisible();

		await compAnalyzer.toggleWeaponGrid();
		await expect(compAnalyzer.locators.categorizationToggle).toBeVisible();

		// Switch categorization and test URL persistence
		await compAnalyzer.selectCategorization("sub");
		await expect(page).toHaveURL(/categorization=sub/);

		await page.reload();

		await expect(compAnalyzer.categorizationRadio("sub")).toBeChecked();
	});

	test("analysis sections appear and can be collapsed", async ({ page }) => {
		const compAnalyzer = new CompAnalyzerPage(page);
		await compAnalyzer.goto();

		const damageCombos = compAnalyzer.damageCombos;

		// Both should not be visible initially
		await expect(damageCombos.root).not.toBeVisible();
		await expect(compAnalyzer.locators.rangeVisualization).not.toBeVisible();

		// Select two weapons with range data (blaster - ID 210)
		await compAnalyzer.selectWeapon(40);
		await compAnalyzer.selectWeapon(210);

		await expect(damageCombos.root).toBeVisible();
		await expect(compAnalyzer.locators.rangeVisualization).toBeVisible();

		// Should be expanded by default
		await expect(damageCombos.content).toBeVisible();

		await damageCombos.toggleCollapsed();
		await expect(damageCombos.content).not.toBeVisible();

		await damageCombos.toggleCollapsed();
		await expect(damageCombos.content).toBeVisible();
	});

	test("damage combo sliders and filtering work correctly", async ({
		page,
	}) => {
		const compAnalyzer = new CompAnalyzerPage(page);
		await compAnalyzer.goto();

		// Splattershot Jr. has Splat Bomb sub
		await compAnalyzer.selectWeapon(10);
		await compAnalyzer.selectWeapon(40);

		const damageCombos = compAnalyzer.damageCombos;
		await expect(damageCombos.root).toBeVisible();

		// Part 1: Test Sub Defense slider
		const initialDamageValues =
			await damageCombos.damageValues.allTextContents();

		await damageCombos.subDefenseSlider.fill("57");

		// Damage of sub weapons should be reduced
		const newDamageValues = await damageCombos.damageValues.allTextContents();
		expect(initialDamageValues.join(",")).not.toEqual(
			newDamageValues.join(","),
		);

		await damageCombos.subDefenseSlider.fill("0");

		// Part 2: Test Ink Resistance slider
		const initialInkTimes = await damageCombos.inkTimes.allTextContents();

		await damageCombos.inkResistanceSlider.fill("57");

		const newInkTimes = await damageCombos.inkTimes.allTextContents();

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
		const firstDamageTypeLabel = damageCombos.damageTypeLabels.first();
		const damageTypeText = await firstDamageTypeLabel.textContent();

		await expect(damageCombos.filteredItems).toHaveCount(0);

		await firstDamageTypeLabel.click();

		const filteredCount = await damageCombos.filteredItems.count();
		expect(filteredCount).toBeGreaterThan(0);

		await expect(damageCombos.filteredItems.first()).toContainText(
			damageTypeText ?? "",
		);

		// Clicking a filtered item restores it
		await damageCombos.filteredItems.first().click();
		await expect(damageCombos.filteredItems).toHaveCount(filteredCount - 1);
	});
});
