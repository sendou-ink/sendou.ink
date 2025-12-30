import { expect, impersonate, navigate, seed, test } from "~/utils/playwright";
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

	test("updates clock format preference", async ({ page }) => {
		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: "/",
		});

		const tournamentCard = page.getByTestId("tournament-card").first();
		const timeElement = tournamentCard.locator("time");
		const initialTime = await timeElement.textContent();

		expect(initialTime).toMatch(/AM|PM/);

		await navigate({
			page,
			url: SETTINGS_PAGE,
		});

		const clockFormatSelect = page.locator("#clock-format");
		await clockFormatSelect.selectOption("24h");

		await expect(page.getByText("Settings updated")).toBeVisible();

		await navigate({
			page,
			url: "/",
		});

		const newTime = await tournamentCard.locator("time").textContent();

		expect(newTime).not.toMatch(/AM|PM/);
		expect(newTime).not.toBe(initialTime);
		expect(newTime).toContain(":");
	});
});
