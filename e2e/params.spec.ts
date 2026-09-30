import { NZAP_TEST_ID } from "~/db/seed/constants";
import { expect, impersonate, navigate, test } from "./helpers/playwright";
import { AnalyzerPage } from "./pages/analyzer/analyzer-page";
import { WeaponParamsPage } from "./pages/analyzer/weapon-params-page";
import { GlobalSearchDialog } from "./pages/search/global-search-dialog";

test.describe("Weapon parameters", () => {
	test("table filtering, comparison bar graph and history rows (via Analyzer)", async ({
		page,
	}) => {
		const analyzer = new AnalyzerPage(page);
		await analyzer.goto();

		await analyzer.selectWeapon("Splattershot");

		const weaponParams = await analyzer.openRawParameters("splattershot");
		await expect(page).toHaveURL(/\/params\/splattershot/);

		// a sibling column has to render after the client-side navigation first, or the count is taken mid-hydration
		const { weaponHeaders, showAllWeaponsButton } = weaponParams.locators;
		await expect(weaponHeaders.nth(1)).toBeVisible();
		const initialColumnCount = await weaponHeaders.count();
		expect(initialColumnCount).toBeGreaterThan(1);

		await weaponParams.hideWeapon();

		await expect(showAllWeaponsButton).toBeVisible();
		await expect(weaponHeaders).toHaveCount(initialColumnCount - 1);
		await expect(page).toHaveURL(/hidden=\d/);

		await weaponParams.reload();
		await expect(page).toHaveURL(/hidden=\d/);
		await expect(showAllWeaponsButton).toBeVisible();
		await expect(weaponHeaders).toHaveCount(initialColumnCount - 1);

		await weaponParams.showAllWeapons();
		await expect(showAllWeaponsButton).not.toBeVisible();
		await expect(weaponHeaders).toHaveCount(initialColumnCount);
		await expect(page).not.toHaveURL(/hidden=\d/);

		await weaponParams.openParamComparison();
		await expect(weaponParams.locators.comparisonDialog).toBeVisible();
		expect(
			await weaponParams.locators.comparisonBars.count(),
		).toBeGreaterThanOrEqual(2);
		await weaponParams.closeParamComparison();
		await expect(weaponParams.locators.comparisonDialog).not.toBeVisible();

		// the patch-count badge shows only while the row is collapsed, signalling the toggle state
		const historyRow = weaponParams.historyRow(0);
		await expect(historyRow.root).toBeVisible();
		await expect(historyRow.historyBadge).toBeVisible();

		await historyRow.toggle();
		await expect(historyRow.historyBadge).not.toBeVisible();

		await historyRow.toggle();
		await expect(historyRow.historyBadge).toBeVisible();
	});

	test("patch history tab persists across refresh (via weapon search)", async ({
		page,
	}) => {
		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: "/" });

		const search = new GlobalSearchDialog(page);
		await search.open();
		await search.search("splattershot");
		await search.selectOption("Splattershot");
		await search.selectOption("Parameters");
		await expect(page).toHaveURL(/\/params\/splattershot/);

		const weaponParams = new WeaponParamsPage(page);
		const { patchHistoryTab, subAndSpecialChangesSwitch } =
			weaponParams.locators;

		await weaponParams.openPatchHistoryTab();
		await expect(page).toHaveURL(/tab=patches/);

		await weaponParams.reload();
		await expect(page).toHaveURL(/tab=patches/);
		await expect(patchHistoryTab).toHaveAttribute("aria-selected", "true");

		// Either patch columns are shown or the empty state
		await expect(weaponParams.locators.patchColumns.first()).toBeVisible();

		await expect(subAndSpecialChangesSwitch).toBeChecked();
		await weaponParams.toggleSubAndSpecialChanges();
		await expect(page).toHaveURL(/kitExtras=false/);

		await weaponParams.reload();
		await expect(page).toHaveURL(/kitExtras=false/);
		await expect(subAndSpecialChangesSwitch).not.toBeChecked();
	});
});
