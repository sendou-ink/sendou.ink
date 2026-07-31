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
