import { expect, impersonate, navigate, seed, test } from "~/utils/playwright";

test.describe("Global search", () => {
	test("searches for users and organizations", async ({ page }) => {
		await seed(page);
		await impersonate(page);
		await navigate({ page, url: "/" });

		const searchDialog = page.getByRole("dialog", { name: "Search" });

		await page.getByRole("button", { name: /Search/ }).click();
		await searchDialog.waitFor({ state: "visible" });
		await searchDialog.getByText("Users").click();
		await page.getByPlaceholder("Search...").fill("sendou");
		await page.getByRole("option", { name: /Sendou/ }).click();
		await expect(page).toHaveURL(/\/u\/sendou/);

		await page.getByRole("button", { name: /Search/ }).click();
		await searchDialog.waitFor({ state: "visible" });
		await searchDialog.getByText("Organizations").click();
		await page.getByPlaceholder("Search...").fill("sendou");
		await page.getByRole("option", { name: /sendou\.ink/ }).click();
		await expect(page).toHaveURL(/\/org\/sendouink/);
	});

	test("searches for weapons", async ({ page }) => {
		await seed(page);
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
		await page.getByRole("option", { name: "Builds", exact: true }).click();
		await expect(page).toHaveURL(/\/builds\/splattershot/);
	});
});
