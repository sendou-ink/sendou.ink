import {
	clockFormatSchema,
	disableBuildAbilitySortingSchema,
} from "~/features/settings/settings-schemas";
import {
	expect,
	impersonate,
	navigate,
	seed,
	test,
	waitForPOSTResponse,
} from "~/utils/playwright";
import { createFormHelpers } from "~/utils/playwright-form";
import { CALENDAR_PAGE, SETTINGS_PAGE } from "~/utils/urls";

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

		const form = createFormHelpers(page, disableBuildAbilitySortingSchema);
		await form.check("newValue");
		await waitForPOSTResponse(page, () => form.check("newValue"));

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
			url: CALENDAR_PAGE,
		});

		const clockHeader = page.locator("[class*='clockHeader']").first();
		const initialTime = await clockHeader.locator("span").first().textContent();

		expect(initialTime).toMatch(/AM|PM/);

		await navigate({
			page,
			url: SETTINGS_PAGE,
		});

		const form = createFormHelpers(page, clockFormatSchema);
		await waitForPOSTResponse(page, () => form.select("newValue", "24h"));

		await navigate({
			page,
			url: CALENDAR_PAGE,
		});

		const newTime = await clockHeader.locator("span").first().textContent();

		expect(newTime).not.toMatch(/AM|PM/);
		expect(newTime).not.toBe(initialTime);
		expect(newTime).toContain(":");
	});
});
