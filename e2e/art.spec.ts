import path from "node:path";
import { fileURLToPath } from "node:url";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { expect, impersonate, navigate, seed, test } from "~/utils/playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe("Art", () => {
	test("uploads art as NZAP, admin approves, art displays on user page", async ({
		page,
	}) => {
		await seed(page);
		await impersonate(page, NZAP_TEST_ID);

		await navigate({ page, url: "/art/new" });

		const testImagePath = path.join(__dirname, "fixtures/test-image.png");
		await page.locator('input[type="file"]').setInputFiles(testImagePath);

		await expect(page.locator("form img")).toBeVisible();

		await page.getByRole("button", { name: "Save" }).click();

		await expect(page).toHaveURL(/\/u\/.*\/art/);
		await expect(page.getByText(/pending moderator approval/i)).toBeVisible();

		await impersonate(page);
		await navigate({ page, url: "/upload/admin" });

		await expect(page.locator("img").first()).toBeVisible();

		await page.getByRole("button", { name: /All .* above ok/ }).click();

		await expect(page.getByText("All validated!")).toBeVisible();

		await navigate({ page, url: "/u/nzap/art" });

		const artImage = page.locator("img").first();
		await expect(artImage).toBeVisible();

		const box = await artImage.boundingBox();
		expect(box).not.toBeNull();
		expect(box!.width).toBeGreaterThan(0);
		expect(box!.height).toBeGreaterThan(0);
	});
});
