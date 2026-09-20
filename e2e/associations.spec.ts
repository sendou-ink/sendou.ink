import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import {
	expect,
	impersonate,
	isNotVisible,
	navigate,
	test,
} from "./helpers/playwright";
import { AssociationsPage } from "./pages/associations/associations-page";
import { NewAssociationPage } from "./pages/associations/new-association-page";
import { AnythingAdder } from "./pages/layout/anything-adder";
import { ScrimsPage } from "./pages/scrims/scrims-page";

test.describe("Associations", () => {
	test("creates a new association", async ({ page }) => {
		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: "/" });

		await new AnythingAdder(page).add("association");

		const newAssociation = new NewAssociationPage(page);
		await newAssociation.form.fill("name", "My Association");
		await newAssociation.save();

		const associations = new AssociationsPage(page);
		await expect(associations.heading("My Association")).toBeVisible();
	});

	test("deletes an association", async ({ page, factories }) => {
		await factories.AssociationFactory.create({ userId: ADMIN_ID });
		await factories.AssociationFactory.create({ userId: ADMIN_ID });

		await impersonate(page, ADMIN_ID);

		const scrims = new ScrimsPage(page);
		await scrims.goto();

		const associations = await scrims.openAssociations();

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
		await isNotVisible(associations.locators.resetLinkButton);

		await impersonate(page, ADMIN_ID);
		await associations.goto();
		await associations.leave();

		await impersonate(page, NZAP_TEST_ID);
		await associations.goto();

		await expect(associations.locators.resetLinkButton).toBeVisible();
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
