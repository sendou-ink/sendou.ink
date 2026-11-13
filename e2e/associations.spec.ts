import { sub } from "date-fns";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { ASSOCIATION } from "~/features/associations/associations-constants";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { toDBBoolean } from "~/utils/sql";
import type { Factories } from "./helpers/factories";
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

const ASSOCIATION_NAME = "Inkling Alliance";
const LIMITED_POST_TEXT = "Alliance members only";
const PUBLIC_POST_TEXT = "Anyone welcome";
const SCRIM_GROUP_SIZE = 4;

test.describe("Associations", () => {
	/**
	 * Any user can make an association, becoming its admin. A user can be a member of 3 associations,
	 * the ones they made included.
	 */
	test.describe("Creating", () => {
		test("the creator becomes the admin of the new association", async ({
			page,
		}) => {
			await impersonate(page, NZAP_TEST_ID);
			await navigate({ page, url: "/" });

			await new AnythingAdder(page).add("association");

			const newAssociation = new NewAssociationPage(page);
			await newAssociation.form.fill("name", ASSOCIATION_NAME);
			await newAssociation.save();

			const associations = new AssociationsPage(page);
			await expect(associations.heading(ASSOCIATION_NAME)).toBeVisible();
			await expect(associations.adminLine("N-ZAP")).toBeVisible();
			await expect(associations.locators.inviteLinkInputs).toHaveCount(1);
		});

		test("a user already in three associations can't make another", async ({
			page,
			factories,
		}) => {
			for (let i = 0; i < ASSOCIATION.MAX_COUNT_REGULAR_USER; i++) {
				await factories.AssociationFactory.create({ userId: NZAP_TEST_ID });
			}

			await impersonate(page, NZAP_TEST_ID);
			const newAssociation = new NewAssociationPage(page);
			await newAssociation.goto();
			await newAssociation.form.fill("name", ASSOCIATION_NAME);
			await newAssociation.save();

			await expect(newAssociation.locators.limitReachedError).toBeVisible();

			const associations = new AssociationsPage(page);
			await associations.goto();
			await isNotVisible(associations.heading(ASSOCIATION_NAME));
		});
	});

	/**
	 * Users join through the association's invite link, which only its admin and starred members see.
	 * Resetting the link gives it a new code, the old link no longer offering to join.
	 */
	test.describe("Joining", () => {
		test("a user joins through the invite link and can leave again", async ({
			page,
			factories,
		}) => {
			await factories.AssociationFactory.create({
				userId: ADMIN_ID,
				name: ASSOCIATION_NAME,
			});
			const associations = new AssociationsPage(page);

			const inviteCode =
				await test.step("Sendou copies the invite link", async () => {
					await impersonate(page, ADMIN_ID);
					await associations.goto();

					return associations.copyInviteCode();
				});

			await test.step("N-ZAP opens the link and joins", async () => {
				await impersonate(page, NZAP_TEST_ID);
				await associations.openInviteLink(inviteCode);
				await associations.join();

				await expect(associations.heading(ASSOCIATION_NAME)).toBeVisible();
				await isNotVisible(associations.locators.joinButton);
			});

			await test.step("N-ZAP leaves the association", async () => {
				await associations.leave();

				await isNotVisible(associations.heading(ASSOCIATION_NAME));
			});
		});

		test("a reset invite link no longer offers to join", async ({
			page,
			factories,
		}) => {
			await factories.AssociationFactory.create({ userId: ADMIN_ID });
			const associations = new AssociationsPage(page);

			const oldInviteCode =
				await test.step("Sendou resets the invite link after it was shared", async () => {
					await impersonate(page, ADMIN_ID);
					await associations.goto();
					const inviteCode = await associations.copyInviteCode();

					await associations.resetInviteLink();

					await expect
						.poll(() => associations.copyInviteCode())
						.not.toBe(inviteCode);

					return inviteCode;
				});

			await test.step("N-ZAP opening the old link isn't offered to join", async () => {
				await impersonate(page, NZAP_TEST_ID);
				await associations.openInviteLink(oldInviteCode);

				await isNotVisible(associations.locators.joinButton);
			});
		});
	});

	/**
	 * The admin stars members, who then also see and reset the invite link and remove unstarred
	 * members, but not the admin or other starred members. Deleting the association is the admin's alone.
	 */
	test.describe("Members", () => {
		test("a starred member sees the invite link but can't delete the association", async ({
			page,
			factories,
		}) => {
			await factories.AssociationFactory.create(
				{ userId: ADMIN_ID },
				{ memberUserIds: [NZAP_TEST_ID] },
			);
			const associations = new AssociationsPage(page);

			await test.step("N-ZAP doesn't see the invite link as a regular member", async () => {
				await impersonate(page, NZAP_TEST_ID);
				await associations.goto();

				await isNotVisible(associations.locators.inviteLinkInputs);
			});

			await test.step("Sendou stars N-ZAP", async () => {
				await impersonate(page, ADMIN_ID);
				await associations.goto();
				await associations.star("N-ZAP");
			});

			await test.step("N-ZAP now sees and can reset the invite link", async () => {
				await impersonate(page, NZAP_TEST_ID);
				await associations.goto();

				await expect(associations.locators.inviteLinkInputs).toHaveCount(1);
				await expect(associations.locators.resetLinkButton).toBeVisible();
				await isNotVisible(associations.locators.deleteButtons);
			});
		});

		test("the admin removes a member", async ({ page, factories }) => {
			await factories.AssociationFactory.create(
				{ userId: ADMIN_ID },
				{ memberUserIds: [NZAP_TEST_ID] },
			);

			await impersonate(page, ADMIN_ID);
			const associations = new AssociationsPage(page);
			await associations.goto();
			await associations.removeMember("N-ZAP");

			await isNotVisible(associations.removeMemberButton("N-ZAP"));
		});

		test("a starred member can remove unstarred members only", async ({
			page,
			factories,
		}) => {
			const admin = await factories.UserFactory.create();
			const unstarredMember = await factories.UserFactory.create();
			await factories.AssociationFactory.create(
				{ userId: admin.id },
				{
					managerUserIds: [NZAP_TEST_ID, ADMIN_ID],
					memberUserIds: [unstarredMember.id],
				},
			);

			await impersonate(page, NZAP_TEST_ID);
			const associations = new AssociationsPage(page);
			await associations.goto();

			// of the admin, Sendou (also starred), N-ZAP and the unstarred member only the last can be removed
			await expect(associations.locators.removeMemberButtons).toHaveCount(1);
			await isNotVisible(associations.removeMemberButton("Sendou"));
		});
	});

	/**
	 * Members leave whenever they like, except the admin who can leave only when there is a starred member
	 * to take over, who becomes the new admin.
	 */
	test.describe("Leaving and deleting", () => {
		test("the admin can't leave without a starred member", async ({
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
		});

		test("a starred member takes over when the admin leaves", async ({
			page,
			factories,
		}) => {
			await factories.AssociationFactory.create(
				{ userId: ADMIN_ID },
				{ managerUserIds: [NZAP_TEST_ID] },
			);
			const associations = new AssociationsPage(page);

			await test.step("Sendou leaves, told N-ZAP becomes the new admin", async () => {
				await impersonate(page, ADMIN_ID);
				await associations.goto();
				await associations.startLeaving();

				await expect(associations.locators.leaveDialogHeading).toContainText(
					"N-ZAP will become the new admin",
				);

				await associations.confirmLeaving();
			});

			await test.step("N-ZAP is the admin and can delete the association", async () => {
				await impersonate(page, NZAP_TEST_ID);
				await associations.goto();

				await expect(associations.adminLine("N-ZAP")).toBeVisible();
				await expect(associations.locators.deleteButtons).toHaveCount(1);
			});
		});

		test("the admin deletes an association", async ({ page, factories }) => {
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
	});

	/**
	 * A scrim post limited to an association shows only to its members. A "not found" time widens the
	 * audience once it passes. "View scrims" lists the posts limited to the association.
	 */
	test.describe("Limiting scrim posts", () => {
		test("a post limited to an association shows only to its members", async ({
			page,
			factories,
		}) => {
			const association = await factories.AssociationFactory.create({
				userId: NZAP_TEST_ID,
			});
			await factories.ScrimPostFactory.create({
				users: await createScrimGroup(factories),
				text: LIMITED_POST_TEXT,
				visibility: { forAssociation: association.id },
			});
			const scrims = new ScrimsPage(page);

			await test.step("N-ZAP, a member, sees the post", async () => {
				await impersonate(page, NZAP_TEST_ID);
				await scrims.goto();
				await scrims.openTab("available");

				await expect(scrims.post(LIMITED_POST_TEXT)).toBeVisible();
			});

			await test.step("Sendou, not a member, doesn't", async () => {
				await impersonate(page, ADMIN_ID);
				await scrims.goto();
				await scrims.openTab("available");

				await isNotVisible(scrims.post(LIMITED_POST_TEXT));
			});
		});

		test('a post limited to an association shows to everyone once its "not found" time has passed', async ({
			page,
			factories,
		}) => {
			const association = await factories.AssociationFactory.create({
				userId: NZAP_TEST_ID,
			});
			await factories.ScrimPostFactory.create({
				users: await createScrimGroup(factories),
				text: LIMITED_POST_TEXT,
				visibility: {
					forAssociation: association.id,
					notFoundInstructions: [
						{
							at: dateToDatabaseTimestamp(sub(new Date(), { minutes: 1 })),
							forAssociation: null,
						},
					],
				},
			});

			await impersonate(page, ADMIN_ID);
			const scrims = new ScrimsPage(page);
			await scrims.goto();
			await scrims.openTab("available");

			await expect(scrims.post(LIMITED_POST_TEXT)).toBeVisible();
		});

		test('"View scrims" lists only the posts limited to the association', async ({
			page,
			factories,
		}) => {
			const association = await factories.AssociationFactory.create({
				userId: NZAP_TEST_ID,
				name: ASSOCIATION_NAME,
			});
			await factories.ScrimPostFactory.create({
				users: await createScrimGroup(factories),
				text: LIMITED_POST_TEXT,
				visibility: { forAssociation: association.id },
			});
			await factories.ScrimPostFactory.create({
				users: await createScrimGroup(factories),
				text: PUBLIC_POST_TEXT,
			});

			await impersonate(page, NZAP_TEST_ID);
			const associations = new AssociationsPage(page);
			await associations.goto();
			const scrims = await associations.viewScrims();
			await scrims.openTab("available");

			await expect(scrims.post(LIMITED_POST_TEXT)).toBeVisible();
			await isNotVisible(scrims.post(PUBLIC_POST_TEXT));
		});
	});
});

/** A pick-up sized group of new users posting a scrim, the first its owner. */
async function createScrimGroup(factories: Factories) {
	const users = await factories.UserFactory.createMany(SCRIM_GROUP_SIZE);

	return users.map((user, index) => ({
		userId: user.id,
		isOwner: toDBBoolean(index === 0),
	}));
}
