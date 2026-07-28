import path from "node:path";
import { fileURLToPath } from "node:url";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { artFormSchema } from "~/features/art/art-schemas";
import {
	expect,
	impersonate,
	navigate,
	seed,
	test,
} from "./helpers/playwright";
import { createFormHelpers } from "./helpers/playwright-form";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe("Art", () => {
	test("uploads art as NZAP, admin approves, art displays on user page", async ({
		page,
	}) => {
		await seed(page);
		await impersonate(page, NZAP_TEST_ID);

		await navigate({ page, url: "/art/new" });

		const form = createFormHelpers(page, artFormSchema);

		const testImagePath = path.join(__dirname, "fixtures/test-image.png");
		await page.locator('input[type="file"]').setInputFiles(testImagePath);

		await expect(page.locator("form img")).toBeVisible();

		await form.submit();

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

	test("edits already uploaded art keeping its image", async ({ page }) => {
		await seed(page);
		await impersonate(page, NZAP_TEST_ID);

		await navigate({ page, url: "/u/nzap/art" });

		const form = createFormHelpers(page, artFormSchema);
		const editNewestArt = () =>
			page.locator('a[href^="/art/new?art="]').first().click();

		await editNewestArt();

		// the already uploaded image is shown but can't be swapped
		await expect(page.locator('form img[src*="-small."]')).toBeVisible();
		await expect(page.locator('input[type="file"]')).toHaveCount(0);

		await form.fill("description", "Squid drawing");
		await form.submit();

		await expect(page).toHaveURL(/\/u\/.*\/art/);

		await editNewestArt();

		await expect(page.getByLabel(form.getLabel("description"))).toHaveValue(
			"Squid drawing",
		);
	});
});
