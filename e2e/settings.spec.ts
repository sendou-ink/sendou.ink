import test, { expect } from "@playwright/test";
import { impersonate, navigate, seed } from "~/utils/playwright";
import { SETTINGS_PAGE } from "~/utils/urls";

test.describe("Settings", () => {
	test("updates 'disableBuildAbilitySorting'", async ({ page }) => {
		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: "/builds/luna-blaster",
		});

		const oldContents = await page
			.getByTestId("build-card")
			.first()
			.innerHTML();

		await navigate({
			page,
			url: SETTINGS_PAGE,
		});

		await page
			.getByTestId("UPDATE_DISABLE_BUILD_ABILITY_SORTING-switch")
			.click();

		await navigate({
			page,
			url: "/builds/luna-blaster",
		});

		const newContents = await page
			.getByTestId("build-card")
			.first()
			.innerHTML();

		expect(newContents).not.toBe(oldContents);
	});

	// xxx: what da hell is this
	test("updates clock format preference", async ({ page }) => {
		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: SETTINGS_PAGE,
		});

		const clockFormatSelect = page.locator("#clock-format");

		await clockFormatSelect.selectOption("24h");
		await page.waitForTimeout(500);

		await clockFormatSelect.selectOption("12h");
		await page.waitForTimeout(500);

		await clockFormatSelect.selectOption("auto");
		await page.waitForTimeout(500);

		const selectedValue = await clockFormatSelect.inputValue();
		expect(selectedValue).toBe("auto");
	});
});
