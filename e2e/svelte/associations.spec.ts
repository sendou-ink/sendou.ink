import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { expect, impersonate, isNotVisible, test } from "../helpers/playwright";
import { AssociationsPage } from "../pages/associations/associations-page";
import { NewAssociationPage } from "../pages/associations/new-association-page";

// Same flows as ../associations.spec.ts, driven through the same page objects against the SvelteKit
// slice (E2E_TARGET=svelte). Pages the slice does not serve are entered directly instead of through
// the React app's navigation.
test.describe("Associations (SvelteKit)", () => {
	test("creates a new association", async ({ page }) => {
		await impersonate(page, NZAP_TEST_ID);

		const newAssociation = new NewAssociationPage(page);
		await newAssociation.goto();
		await newAssociation.form.fill("name", "My Association");
		await newAssociation.save();

		const associations = new AssociationsPage(page);
		await expect(associations.heading("My Association")).toBeVisible();
	});

	test("shows a required error for an empty name", async ({ page }) => {
		await impersonate(page, NZAP_TEST_ID);

		const newAssociation = new NewAssociationPage(page);
		await newAssociation.goto();
		await page.getByTestId("submit-button").click();

		await expect(page.getByText("This field is required")).toBeVisible();
	});

	test("deletes an association", async ({ page, factories }) => {
		await factories.AssociationFactory.create({ userId: ADMIN_ID });
		await factories.AssociationFactory.create({ userId: ADMIN_ID });

		await impersonate(page, ADMIN_ID);

		const associations = new AssociationsPage(page);
		await associations.goto();

		await expect(associations.locators.deleteButtons).toHaveCount(2);

		await associations.deleteFirst();

		await expect(associations.locators.deleteButtons).toHaveCount(1);
	});

	test("stars a member, who then takes over when the admin leaves", async ({
		page,
		factories,
	}) => {
		await factories.AssociationFactory.create(
			{ userId: ADMIN_ID },
			{ memberUserIds: [NZAP_TEST_ID] },
		);

		await impersonate(page, ADMIN_ID);

		const associations = new AssociationsPage(page);
		await associations.goto();

		await isNotVisible(associations.locators.leaveButton);

		await associations.toggleManager("N-ZAP");

		await expect(associations.locators.leaveButton).toBeVisible();

		await impersonate(page, NZAP_TEST_ID);
		await associations.goto();

		await expect(associations.locators.inviteLinkInputs).toHaveCount(1);
		await expect(associations.locators.resetLinkButton).toBeVisible();
		await isNotVisible(associations.locators.deleteButtons);

		await impersonate(page, ADMIN_ID);
		await associations.goto();
		await associations.leave();

		await impersonate(page, NZAP_TEST_ID);
		await associations.goto();

		await expect(associations.locators.deleteButtons).toHaveCount(1);
	});

	test("joins and leaves an association", async ({ page, factories }) => {
		await factories.AssociationFactory.create({ userId: ADMIN_ID });

		await impersonate(page, ADMIN_ID);

		const associations = new AssociationsPage(page);
		await associations.goto();

		const inviteCode = await associations.inviteCode();

		await impersonate(page, NZAP_TEST_ID);
		await associations.gotoInvite(inviteCode);
		await associations.join();

		await associations.leave();

		await isNotVisible(associations.locators.leaveButton);
	});
});
