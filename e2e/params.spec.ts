import { ANALYZER_URL } from "~/utils/urls";
import {
	expect,
	impersonate,
	navigate,
	selectWeapon,
	test,
} from "./helpers/playwright";

test.describe("Weapon parameters", () => {
	test("table filtering, comparison bar graph and history rows (via Analyzer)", async ({
		page,
	}) => {
		await navigate({ page, url: ANALYZER_URL });

		await selectWeapon({ page, name: "Splattershot" });

		// Selecting the weapon updates the URL search params asynchronously, which in
		// turn updates the "Raw parameters" link's href. Wait for the href to reflect the
		// selection before clicking, otherwise the click can navigate to the stale default.
		const rawParametersLink = page.getByRole("link", {
			name: /Raw parameters/,
		});
		await expect(rawParametersLink).toHaveAttribute(
			"href",
			/\/params\/splattershot/,
		);
		await rawParametersLink.click();
		await expect(page).toHaveURL(/\/params\/splattershot/);

		// Filtering: hide a weapon column. Wait for a sibling column to render after the client-side
		// navigation before counting, otherwise the count can be taken mid-hydration.
		const weaponHeaders = page.locator("th[class*='weaponHeader']");
		await expect(weaponHeaders.nth(1)).toBeVisible();
		const initialColumnCount = await weaponHeaders.count();
		expect(initialColumnCount).toBeGreaterThan(1);

		await page.locator("[data-testid^='hide-weapon-']").first().click();

		const showAllButton = page.getByTestId("show-all-weapons");
		await expect(showAllButton).toBeVisible();
		await expect(weaponHeaders).toHaveCount(initialColumnCount - 1);
		expect(page.url()).toMatch(/hidden=\d/);

		// Refresh keeps the hidden selection
		await page.reload();
		expect(page.url()).toMatch(/hidden=\d/);
		await expect(showAllButton).toBeVisible();
		await expect(weaponHeaders).toHaveCount(initialColumnCount - 1);

		// Restore all weapons
		await showAllButton.click();
		await expect(showAllButton).not.toBeVisible();
		await expect(weaponHeaders).toHaveCount(initialColumnCount);
		expect(page.url()).not.toMatch(/hidden=\d/);

		// Comparison bar graph
		await page.getByTestId("compare-param").first().click();
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();
		const bars = dialog.locator("[class*='bars'] [class*='row']");
		expect(await bars.count()).toBeGreaterThanOrEqual(2);
		await page.keyboard.press("Escape");
		await expect(dialog).not.toBeVisible();

		// Collapsing a history row after expanding it. The patch-count badge is shown while the row
		// is collapsed and hidden once expanded, so it is a reliable signal for the toggle state.
		const expandableRow = page.locator("[class*='expandableRow']").first();
		await expect(expandableRow).toBeVisible();
		const historyBadge = expandableRow
			.locator("[class*='historyBadge']")
			.first();
		await expect(historyBadge).toBeVisible();

		await expandableRow.locator("td[class*='paramName']").click();
		await expect(historyBadge).not.toBeVisible();

		await expandableRow.locator("td[class*='paramName']").click();
		await expect(historyBadge).toBeVisible();
	});

	test("patch history tab persists across refresh (via weapon search)", async ({
		page,
	}) => {
		await impersonate(page);
		await navigate({ page, url: "/" });

		const searchDialog = page.getByRole("dialog", { name: "Search" });
		await page.getByRole("button", { name: /Search/ }).click();
		await searchDialog.waitFor({ state: "visible" });
		await page.getByPlaceholder("Search...").fill("splattershot");
		const weaponOption = page.getByRole("option", {
			name: "Splattershot",
			exact: true,
		});
		await weaponOption.waitFor({ state: "visible" });
		await weaponOption.click({ force: true });
		await page.getByRole("option", { name: "Parameters", exact: true }).click();
		await expect(page).toHaveURL(/\/params\/splattershot/);

		// Switch to the patch history tab
		const patchesTab = page.getByRole("tab", { name: /Patch history/ });
		await patchesTab.click();
		expect(page.url()).toContain("tab=patches");

		// Refresh keeps the selected tab
		await page.reload();
		expect(page.url()).toContain("tab=patches");
		await expect(patchesTab).toHaveAttribute("aria-selected", "true");

		// Either patch columns are shown or the empty state
		const patchColumns = page.locator("[class*='column']");
		await expect(patchColumns.first()).toBeVisible();

		// Toggle "Show sub & special changes" and verify it persists on refresh
		const subSpecialSwitch = page.getByRole("switch", {
			name: /Show sub & special changes/,
		});
		await expect(subSpecialSwitch).toBeChecked();
		await subSpecialSwitch.click({ force: true });
		expect(page.url()).toContain("kitExtras=false");

		await page.reload();
		expect(page.url()).toContain("kitExtras=false");
		await expect(
			page.getByRole("switch", { name: /Show sub & special changes/ }),
		).not.toBeChecked();
	});
});
