import path from "node:path";
import { fileURLToPath } from "node:url";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { expect, impersonate, isNotVisible, test } from "./helpers/playwright";
import { ArtPage } from "./pages/art/art-page";
import { NewArtPage } from "./pages/art/new-art-page";
import { UserArtPage } from "./pages/art/user-art-page";
import { ImageValidationPage } from "./pages/img-upload/image-validation-page";
import { NotificationPopover } from "./pages/layout/notification-popover";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_IMAGE_PATH = path.join(__dirname, "fixtures/test-image.png");

const DESCRIPTION = "Squid drawing";

test.describe("Art", () => {
	/**
	 * Only users with the artist role can upload art. Others see it once a moderator has approved its
	 * image, except art of a patron which shows right away.
	 */
	test.describe("Uploading", () => {
		test("art shows to others once a moderator approves it", async ({
			page,
			factories,
		}) => {
			await factories.UserFactory.grant(NZAP_TEST_ID, { roles: ["ARTIST"] });
			const userArt = new UserArtPage(page);

			await test.step("N-ZAP uploads art and is told it awaits approval", async () => {
				await impersonate(page, NZAP_TEST_ID);
				const newArt = new NewArtPage(page);
				await newArt.goto();
				await newArt.selectImage(TEST_IMAGE_PATH);

				await expect(newArt.locators.preview).toBeVisible();

				await newArt.save();

				await expect(page).toHaveURL(/\/u\/.*\/art/);
				await expect(userArt.locators.pendingApprovalText).toBeVisible();
				await expect(userArt.locators.images).toHaveCount(0);
			});

			await test.step("Sendou approves the image", async () => {
				await impersonate(page);
				const imageValidation = new ImageValidationPage(page);
				await imageValidation.goto();

				await expect(imageValidation.locators.images.first()).toBeVisible();

				await imageValidation.approveAll();

				await expect(imageValidation.locators.allValidatedText).toBeVisible();
			});

			await test.step("The art shows on N-ZAP's page", async () => {
				await userArt.goto(NZAP_TEST_ID);

				await expect(userArt.image(0)).toBeVisible();
			});
		});

		test("a patron's art shows without waiting for approval", async ({
			page,
			factories,
		}) => {
			await factories.UserFactory.grant(NZAP_TEST_ID, {
				roles: ["ARTIST"],
				patronTier: 1,
			});

			await impersonate(page, NZAP_TEST_ID);
			const newArt = new NewArtPage(page);
			await newArt.goto();
			await newArt.selectImage(TEST_IMAGE_PATH);
			const userArt = await newArt.save();

			await expect(userArt.locators.images).toHaveCount(1);
			await isNotVisible(userArt.locators.pendingApprovalText);
		});

		test("users without the artist role are told how to get it instead of the form", async ({
			page,
		}) => {
			await impersonate(page, NZAP_TEST_ID);
			const newArt = new NewArtPage(page);
			await newArt.goto();

			await expect(newArt.locators.gainPermissionsText).toBeVisible();
			await isNotVisible(newArt.locators.fileInput);
		});
	});

	/** The author edits their art's description, tags and tagged users, but not its image. */
	test.describe("Editing", () => {
		test("the edited description is saved, the image staying as it was", async ({
			page,
			factories,
		}) => {
			await factories.UserFactory.grant(NZAP_TEST_ID, { roles: ["ARTIST"] });
			const art = await factories.ArtFactory.create({ authorId: NZAP_TEST_ID });

			await impersonate(page, NZAP_TEST_ID);
			const userArt = new UserArtPage(page);
			await userArt.goto(NZAP_TEST_ID);
			await userArt.editLink(art.id).click();

			const newArt = new NewArtPage(page);

			// only rendering is asserted as the factory made art has no image file
			await expect(newArt.locators.existingImage).toBeAttached();
			await isNotVisible(newArt.locators.fileInput);

			await newArt.form.fill("description", DESCRIPTION);
			await newArt.save();

			await expect(page).toHaveURL(/\/u\/.*\/art/);

			await newArt.goto(art.id);
			await expect(newArt.locators.descriptionInput).toHaveValue(DESCRIPTION);
		});

		test("a user tagged in art is notified and finds it on their page", async ({
			page,
			factories,
		}) => {
			await factories.UserFactory.grant(NZAP_TEST_ID, { roles: ["ARTIST"] });
			const art = await factories.ArtFactory.create({ authorId: NZAP_TEST_ID });

			await test.step("N-ZAP tags Sendou in their art", async () => {
				await impersonate(page, NZAP_TEST_ID);
				const newArt = new NewArtPage(page);
				await newArt.goto(art.id);
				await newArt.tagUser("Sendou");
				await newArt.save();
			});

			await test.step("Sendou is notified and the art shows on their page", async () => {
				await impersonate(page);
				const userArt = new UserArtPage(page);
				await userArt.goto(ADMIN_ID);
				const notifications = new NotificationPopover(page);
				await notifications.open();

				await expect(
					notifications.notification("Tagged in art by N-ZAP"),
				).toBeVisible();
				await expect(userArt.locators.images).toHaveCount(1);
			});
		});
	});

	/**
	 * An artist's showcase art is the one art of theirs the showcase tab of `/art` shows: their first
	 * upload until they pick another. The current showcase art can't be unpicked, only replaced.
	 */
	test.describe("Showcase", () => {
		test("picking another art as the showcase shows it in the showcase instead", async ({
			page,
			factories,
		}) => {
			await factories.UserFactory.grant(NZAP_TEST_ID, { roles: ["ARTIST"] });
			const firstArt = await factories.ArtFactory.create({
				authorId: NZAP_TEST_ID,
				url: "first-art.png",
			});
			const secondArt = await factories.ArtFactory.create({
				authorId: NZAP_TEST_ID,
				url: "second-art.png",
			});

			await impersonate(page, NZAP_TEST_ID);
			const newArt = new NewArtPage(page);

			await test.step("The first upload is the showcase art and can't be unpicked", async () => {
				await newArt.goto(firstArt.id);
				await expect(newArt.locators.showcaseSwitch).toBeChecked();
				await expect(newArt.locators.showcaseSwitch).toBeDisabled();
			});

			await test.step("N-ZAP picks their second art as the showcase", async () => {
				await newArt.goto(secondArt.id);
				await newArt.makeShowcase();
				await newArt.save();
			});

			// /art is cached for two hours, visited first only now so its cache misses
			await test.step("The showcase shows the second art", async () => {
				const art = new ArtPage(page);
				await art.goto();
				await art.openShowcase();

				await expect(art.locators.images).toHaveCount(1);
				await expect(art.locators.images).toHaveAttribute("src", /second-art/);
			});
		});
	});

	/** `/art` narrows the showcase down to a tag, and both of its tabs to artists taking commissions. */
	test.describe("Browsing", () => {
		test("filtering the showcase by a tag shows only the art having it", async ({
			page,
			factories,
		}) => {
			await factories.ArtFactory.create({
				authorId: NZAP_TEST_ID,
				tags: [{ name: "cat" }],
			});
			await factories.ArtFactory.create({
				authorId: ADMIN_ID,
				tags: [{ name: "dog" }],
			});

			const art = new ArtPage(page);
			await art.goto();
			await art.openShowcase();
			await expect(art.locators.images).toHaveCount(2);

			await art.filterByTag("cat");

			await expect(art.locators.images).toHaveCount(1);
			await expect(art.artistLink("N-ZAP")).toBeVisible();

			await art.clearTagFilter();

			await expect(art.locators.images).toHaveCount(2);
		});

		test("the commissions open filter shows only the art of artists taking commissions", async ({
			page,
			factories,
		}) => {
			await factories.UserFactory.updateProfile(NZAP_TEST_ID, {
				commissionsOpen: 1,
			});
			await factories.ArtFactory.create({ authorId: NZAP_TEST_ID });
			await factories.ArtFactory.create({ authorId: ADMIN_ID });

			const art = new ArtPage(page);
			await art.goto();
			await expect(art.locators.images).toHaveCount(2);

			await art.toggleCommissionsOpenOnly();

			await expect(art.locators.images).toHaveCount(1);
			await expect(art.artistLink("N-ZAP")).toBeVisible();
		});
	});

	/**
	 * A user's art page lists the art they made and the art others made of them, latest first. When
	 * they have both, the two can be shown apart, and either narrowed down to a tag.
	 */
	test.describe("User's art page", () => {
		test("art made by and made of the user are shown apart and filtered by tag", async ({
			page,
			factories,
		}) => {
			await factories.ArtFactory.create({
				authorId: NZAP_TEST_ID,
				tags: [{ name: "cat" }],
			});
			await factories.ArtFactory.create({ authorId: NZAP_TEST_ID });
			await factories.ArtFactory.create({
				authorId: ADMIN_ID,
				linkedUsers: [NZAP_TEST_ID],
				tags: [{ name: "dog" }],
			});

			const userArt = new UserArtPage(page);
			await userArt.goto(NZAP_TEST_ID);
			await expect(userArt.locators.images).toHaveCount(3);

			await userArt.showSource("MADE-BY");
			await expect(userArt.locators.images).toHaveCount(2);

			await userArt.showSource("MADE-OF");
			await expect(userArt.locators.images).toHaveCount(1);

			await userArt.showSource("ALL");
			await userArt.filterByTag("cat");
			await expect(userArt.locators.images).toHaveCount(1);
		});

		test("an art's link opens it big with its description, tags and tagged users", async ({
			page,
			factories,
		}) => {
			const art = await factories.ArtFactory.create({
				authorId: ADMIN_ID,
				description: DESCRIPTION,
				linkedUsers: [NZAP_TEST_ID],
				tags: [{ name: "cat" }],
			});

			const userArt = new UserArtPage(page);
			await userArt.openArtLink(ADMIN_ID, art.id);

			await expect(userArt.locators.bigArt).toContainText(DESCRIPTION);
			await expect(
				userArt.locators.bigArt.getByRole("link", { name: "#cat" }),
			).toBeVisible();
			await expect(
				userArt.locators.bigArt.getByRole("link", { name: "N-ZAP" }),
			).toBeVisible();
		});
	});

	/** The author deletes their art. A user tagged in art removes themselves from it, taking it off their page. */
	test.describe("Removing", () => {
		test("deleting own art removes it", async ({ page, factories }) => {
			await factories.ArtFactory.create({ authorId: NZAP_TEST_ID });

			await impersonate(page, NZAP_TEST_ID);
			const userArt = new UserArtPage(page);
			await userArt.goto(NZAP_TEST_ID);
			await userArt.deleteArt();

			await expect(userArt.locators.images).toHaveCount(0);
		});

		test("a tagged user unlinking art takes it off their page", async ({
			page,
			factories,
		}) => {
			await factories.ArtFactory.create({ authorId: NZAP_TEST_ID });
			await factories.ArtFactory.create({
				authorId: ADMIN_ID,
				linkedUsers: [NZAP_TEST_ID],
			});

			await impersonate(page, NZAP_TEST_ID);
			const userArt = new UserArtPage(page);
			await userArt.goto(NZAP_TEST_ID);
			await expect(userArt.locators.images).toHaveCount(2);

			await userArt.unlinkFromArt();

			await expect(userArt.locators.images).toHaveCount(1);
			await isNotVisible(userArt.locators.unlinkButton);
		});
	});
});
