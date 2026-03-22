import type { Page } from "@playwright/test";
import { NZAP_TEST_DISCORD_ID, NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_DISCORD_ID } from "~/features/admin/admin-constants";
import { userEditProfileBaseSchema } from "~/features/user-page/user-page-schemas";
import {
	expect,
	impersonate,
	isNotVisible,
	navigate,
	seed,
	submit,
	test,
	waitForPOSTResponse,
} from "~/utils/playwright";
import { createFormHelpers } from "~/utils/playwright-form";
import { userEditProfilePage, userPage } from "~/utils/urls";

const goToEditPage = (page: Page) =>
	page.getByText("Edit", { exact: true }).click();

test.describe("User page", () => {
	test("uses badge pagination", async ({ page }) => {
		await seed(page);
		await navigate({
			page,
			url: userPage({ discordId: NZAP_TEST_DISCORD_ID }),
		});

		await expect(page.getByTestId("badge-display")).toBeVisible();
		await isNotVisible(page.getByTestId("badge-pagination-button"));

		await navigate({
			page,
			url: userPage({ discordId: ADMIN_DISCORD_ID, customUrl: "sendou" }),
		});

		await expect(page.getByAltText("Paddling Pool Weekly")).toBeVisible();
		await page.getByTestId("badge-pagination-button").nth(1).click();

		// test changing the big badge
		await page.getByAltText("Lobster Crossfire").click();
		await expect(page.getByAltText("Lobster Crossfire")).toHaveAttribute(
			"width",
			"125",
		);
	});

	test("customize which badge is shown as big by default as normal user", async ({
		page,
	}) => {
		await seed(page);
		await impersonate(page, NZAP_TEST_ID);
		await navigate({
			page,
			url: userEditProfilePage({ discordId: NZAP_TEST_DISCORD_ID }),
		});

		const badgeSelect = page.getByTestId("badges-selector");
		await badgeSelect.selectOption("5");
		await submit(page);

		await expect(
			page.getByAltText("It's Dangerous to go Alone"),
		).toHaveAttribute("width", "125");
	});

	test("customize big badge + small badge first page order as supporter", async ({
		page,
	}) => {
		await seed(page);
		await impersonate(page);
		await navigate({
			page,
			url: userEditProfilePage({ discordId: ADMIN_DISCORD_ID }),
		});

		const badgeSelect = page.getByTestId("badges-selector");
		await badgeSelect.selectOption("1");
		await expect(page.getByTestId("badge-display")).toBeVisible();
		await badgeSelect.selectOption("11");
		await submit(page);

		await expect(page.getByAltText("4v4 Sundaes")).toBeVisible();
		await expect(page.getByAltText("Lobster Crossfire")).toBeVisible();
	});

	test("edits user profile", async ({ page }) => {
		await seed(page);
		await impersonate(page);
		await navigate({
			page,
			url: userPage({ discordId: ADMIN_DISCORD_ID, customUrl: "sendou" }),
		});

		await page.getByTestId("flag-FI").isVisible();
		await goToEditPage(page);

		const form = createFormHelpers(page, userEditProfileBaseSchema);

		await form.fill("inGameName", "Lean#1234");
		await page.getByLabel("R-stick sens").selectOption("0");
		await page.getByLabel("Motion sens").selectOption("-50");

		await page.getByLabel("Country").click();
		await page.getByRole("searchbox", { name: "Search" }).fill("Sweden");
		await page.getByRole("option", { name: "Sweden" }).click();

		await form.fill("bio", "My awesome bio");
		await form.submit();

		await page.getByTestId("flag-SE").isVisible();
		await page.getByText("My awesome bio").isVisible();
		await page.getByText("Lean#1234").isVisible();
		await page.getByText("Stick 0 / Motion -5").isVisible();
	});

	test("customizes theme colors and resets them", async ({ page }) => {
		await seed(page);
		await impersonate(page);

		const htmlElement = page.locator("html");
		const hasCustomTheme = () =>
			htmlElement.evaluate(
				(el) => el.style.getPropertyValue("--_base-h") !== "",
			);

		await navigate({ page, url: "/settings" });

		// initially no custom theme
		await expect(hasCustomTheme()).resolves.toBe(false);

		// change the base hue slider
		const baseHueSlider = page.locator("#base-hue");
		await baseHueSlider.fill("120");

		// save
		await waitForPOSTResponse(page, () =>
			page.getByRole("button", { name: "Save" }).first().click(),
		);
		await page.reload();

		// verify custom theme was applied
		await expect(hasCustomTheme()).resolves.toBe(true);

		// reset
		await waitForPOSTResponse(page, () =>
			page.getByRole("button", { name: "Reset" }).first().click(),
		);
		await page.reload();

		// verify custom theme was removed
		await expect(hasCustomTheme()).resolves.toBe(false);
	});

	test("edits weapon pool", async ({ page }) => {
		await seed(page);
		await impersonate(page);
		await navigate({
			page,
			url: userPage({ discordId: ADMIN_DISCORD_ID, customUrl: "sendou" }),
		});

		for (const [i, id] of [200, 1100, 2000, 4000].entries()) {
			await expect(page.getByTestId(`${id}-${i + 1}`)).toBeVisible();
		}

		await goToEditPage(page);

		const form = createFormHelpers(page, userEditProfileBaseSchema);

		await form.selectWeapons("weapons", ["Range Blaster"]);
		await page
			.getByRole("button", { name: /Inkbrush/ })
			.getByRole("button", { name: "Delete" })
			.click();

		await form.submit();

		for (const [i, id] of [200, 2000, 4000, 220].entries()) {
			await expect(page.getByTestId(`${id}-${i + 1}`)).toBeVisible();
		}
	});
});
