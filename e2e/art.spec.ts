import path from "node:path";
import { fileURLToPath } from "node:url";
import { NZAP_TEST_DISCORD_ID, NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { expect, impersonate, isNotVisible, test } from "./helpers/playwright";
import { NewArtPage } from "./pages/art/new-art-page";
import { UserArtPage } from "./pages/art/user-art-page";
import { ImageValidationPage } from "./pages/img-upload/image-validation-page";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_IMAGE_PATH = path.join(__dirname, "fixtures/test-image.png");

test.describe("Art", () => {
	test("uploads art as NZAP, admin approves, art displays on user page", async ({
		page,
		factories,
	}) => {
		await factories.UserFactory.grant(NZAP_TEST_ID, { roles: ["ARTIST"] });

		await impersonate(page, NZAP_TEST_ID);

		const newArt = new NewArtPage(page);
		await newArt.goto();
		await newArt.selectImage(TEST_IMAGE_PATH);

		await expect(newArt.locators.preview).toBeVisible();

		const userArt = await newArt.save();

		await expect(page).toHaveURL(/\/u\/.*\/art/);
		await expect(userArt.locators.pendingApprovalText).toBeVisible();

		await impersonate(page);

		const imageValidation = new ImageValidationPage(page);
		await imageValidation.goto();

		await expect(imageValidation.locators.images.first()).toBeVisible();

		await imageValidation.approveAll();

		await expect(imageValidation.locators.allValidatedText).toBeVisible();

		await userArt.goto(NZAP_TEST_DISCORD_ID);

		const artImage = userArt.image(0);
		await expect(artImage).toBeVisible();

		const box = await artImage.boundingBox();
		expect(box).not.toBeNull();
		expect(box!.width).toBeGreaterThan(0);
		expect(box!.height).toBeGreaterThan(0);
	});

	test("edits own art, unlinks from art made of them and deletes own art", async ({
		page,
		factories,
	}) => {
		await factories.UserFactory.grant(NZAP_TEST_ID, { roles: ["ARTIST"] });
		const art = await factories.ArtFactory.create({ authorId: NZAP_TEST_ID });
		await factories.ArtFactory.create({
			authorId: ADMIN_ID,
			linkedUsers: [NZAP_TEST_ID],
		});

		await impersonate(page, NZAP_TEST_ID);

		const userArt = new UserArtPage(page);
		await userArt.goto(NZAP_TEST_DISCORD_ID);
		await userArt.editLink(art.id).click();

		const newArt = new NewArtPage(page);

		// the already uploaded image is shown but can't be swapped
		// only rendering is asserted as the factory made art has no image file
		await expect(newArt.locators.existingImage).toBeAttached();
		await expect(newArt.locators.fileInput).toHaveCount(0);

		await newArt.form.fill("description", "Squid drawing");
		await newArt.save();

		await expect(page).toHaveURL(/\/u\/.*\/art/);

		// the saved description is loaded back into the form for editing
		await newArt.goto(art.id);
		await expect(newArt.locators.descriptionInput).toHaveValue("Squid drawing");

		// both their own art and the art they are tagged in show on their page
		await userArt.goto(NZAP_TEST_DISCORD_ID);
		await expect(userArt.locators.images).toHaveCount(2);

		await userArt.unlinkFromArt();

		await expect(userArt.locators.images).toHaveCount(1);
		await isNotVisible(userArt.locators.unlinkButton);

		await userArt.deleteArt();

		await expect(userArt.locators.images).toHaveCount(0);
	});
});
