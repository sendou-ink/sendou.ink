import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { badgePage } from "~/utils/urls";
import {
	expect,
	impersonate,
	isNotVisible,
	navigate,
	test,
} from "./helpers/playwright";
import { BadgePage } from "./pages/badges/badge-page";
import { BadgesPage } from "./pages/badges/badges-page";
import { NotificationPopover } from "./pages/layout/notification-popover";

const BADGE_NAME = "4v4 Sundaes";
const OTHER_BADGE_NAME = "In The Zone";

test.describe("Badges", () => {
	/**
	 * `/badges` lists every badge, the ones the viewer manages first under a divider of their own. Searching
	 * narrows the list down to the badges whose name contains the text.
	 */
	test.describe("Browsing", () => {
		test("the badges the viewer manages are listed apart from the rest", async ({
			page,
			factories,
		}) => {
			await factories.BadgeFactory.create(
				{ displayName: BADGE_NAME },
				{ managerIds: [NZAP_TEST_ID] },
			);
			await factories.BadgeFactory.create({ displayName: OTHER_BADGE_NAME });

			await impersonate(page, NZAP_TEST_ID);
			const badges = new BadgesPage(page);
			await badges.goto();

			await expect(
				badges.locators.managedBadges.getByRole("img", { name: BADGE_NAME }),
			).toBeVisible();
			await expect(
				badges.locators.otherBadges.getByRole("img", {
					name: OTHER_BADGE_NAME,
				}),
			).toBeVisible();
		});

		test("searching narrows the list down by badge name", async ({
			page,
			factories,
		}) => {
			await factories.BadgeFactory.create({ displayName: BADGE_NAME });
			await factories.BadgeFactory.create({ displayName: OTHER_BADGE_NAME });

			const badges = new BadgesPage(page);
			await badges.goto();
			await badges.search("zone");

			await expect(badges.badge(OTHER_BADGE_NAME)).toBeVisible();
			await isNotVisible(badges.badge(BADGE_NAME));

			await badges.search("splatfest");

			await expect(badges.locators.noBadgesFoundText).toBeVisible();
		});
	});

	/**
	 * A badge's page tells what it is awarded for, who manages it and who drew it, and lists its owners with
	 * how many copies each has, most first.
	 */
	test.describe("Badge page", () => {
		test("shows the badge's managers, who drew it and its owners", async ({
			page,
			factories,
		}) => {
			await factories.BadgeFactory.create(
				{ displayName: BADGE_NAME, authorId: ADMIN_ID },
				{
					managerIds: [NZAP_TEST_ID],
					ownerIds: [ADMIN_ID, ADMIN_ID, NZAP_TEST_ID],
				},
			);

			const badges = new BadgesPage(page);
			await badges.goto();
			const badge = await badges.openBadge(BADGE_NAME);

			await expect(badge.locators.explanation).toHaveText(
				`Awarded for winning ${BADGE_NAME}`,
			);
			await expect(badge.creditedUser("N-ZAP")).toBeVisible();
			await expect(badge.creditedUser("Sendou")).toBeVisible();
			await expect(badge.owner("Sendou")).toContainText("×2");
			await expect(badge.owner("N-ZAP")).toBeVisible();
		});
	});

	/**
	 * A badge's managers edit who owns it and how many copies each, a user gaining a copy getting a
	 * notification. Users not managing the badge aren't offered to edit it.
	 */
	test.describe("Editing owners", () => {
		test("a new owner is notified, the notification leading to the badge", async ({
			page,
			factories,
		}) => {
			const badge = await factories.BadgeFactory.create(
				{ displayName: BADGE_NAME },
				{ managerIds: [NZAP_TEST_ID] },
			);
			const badgeDetails = new BadgePage(page);

			await test.step("N-ZAP, a manager of the badge, adds Sendou as an owner", async () => {
				await impersonate(page, NZAP_TEST_ID);
				await badgeDetails.goto(badge.id);

				const badgeEdit = await badgeDetails.openEdit();
				await badgeEdit.addOwner("Sendou");
				await badgeEdit.saveOwners();

				await expect(badgeDetails.owner("Sendou")).toBeVisible();
			});

			await test.step("Sendou is notified and opens the badge from the notification", async () => {
				await impersonate(page);
				await navigate({ page, url: "/" });

				const notifications = new NotificationPopover(page);
				await notifications.open();
				await notifications.openNotification(`New badge (${BADGE_NAME})`);

				await expect(page).toHaveURL(badgePage(badge.id));
			});
		});

		test("adding an owner again gives them another copy", async ({
			page,
			factories,
		}) => {
			const badge = await factories.BadgeFactory.create(
				{ displayName: BADGE_NAME },
				{ managerIds: [NZAP_TEST_ID], ownerIds: [ADMIN_ID] },
			);

			await impersonate(page, NZAP_TEST_ID);
			const badgeDetails = new BadgePage(page);
			await badgeDetails.goto(badge.id);
			const badgeEdit = await badgeDetails.openEdit();
			await badgeEdit.addOwner("Sendou");

			await expect(badgeEdit.ownerChange("1 added to Sendou")).toBeVisible();

			await badgeEdit.saveOwners();

			await expect(badgeDetails.owner("Sendou")).toContainText("×2");
		});

		test("setting an owner's copies to zero removes them as an owner", async ({
			page,
			factories,
		}) => {
			const badge = await factories.BadgeFactory.create(
				{ displayName: BADGE_NAME },
				{ managerIds: [NZAP_TEST_ID], ownerIds: [ADMIN_ID, NZAP_TEST_ID] },
			);

			await impersonate(page, NZAP_TEST_ID);
			const badgeDetails = new BadgePage(page);
			await badgeDetails.goto(badge.id);
			const badgeEdit = await badgeDetails.openEdit();
			await badgeEdit.setCopies("Sendou", 0);

			await expect(
				badgeEdit.ownerChange("1 removed from Sendou"),
			).toBeVisible();

			await badgeEdit.saveOwners();

			await isNotVisible(badgeDetails.owner("Sendou"));
			await expect(badgeDetails.owner("N-ZAP")).toBeVisible();
		});

		test("users not managing the badge are not offered to edit it", async ({
			page,
			factories,
		}) => {
			const badge = await factories.BadgeFactory.create(
				{ displayName: BADGE_NAME },
				{ ownerIds: [NZAP_TEST_ID] },
			);

			await impersonate(page, NZAP_TEST_ID);
			const badgeDetails = new BadgePage(page);
			await badgeDetails.goto(badge.id);

			await expect(badgeDetails.owner("N-ZAP")).toBeVisible();
			await isNotVisible(badgeDetails.locators.editLink);
		});
	});

	/** Staff choose a badge's managers. A new manager is notified and can then edit the badge's owners, but not its managers. */
	test.describe("Managers", () => {
		test("a manager added by staff is notified and can edit the owners", async ({
			page,
			factories,
		}) => {
			const badge = await factories.BadgeFactory.create({
				displayName: BADGE_NAME,
			});
			const badgeDetails = new BadgePage(page);

			await test.step("Sendou, as staff, makes N-ZAP a manager of the badge", async () => {
				await impersonate(page);
				await badgeDetails.goto(badge.id);

				const badgeEdit = await badgeDetails.openEdit();
				await badgeEdit.addManager("N-ZAP");
				await badgeEdit.saveManagers();

				await expect(badgeDetails.creditedUser("N-ZAP")).toBeVisible();
			});

			await test.step("N-ZAP is notified and can edit the owners but not the managers", async () => {
				await impersonate(page, NZAP_TEST_ID);
				await navigate({ page, url: "/" });

				const notifications = new NotificationPopover(page);
				await notifications.open();
				await notifications.openNotification(
					`You got manager rights for badge ${BADGE_NAME}`,
				);

				await expect(page).toHaveURL(badgePage(badge.id));

				const badgeEdit = await badgeDetails.openEdit();

				await expect(badgeEdit.locators.ownersEditor).toBeVisible();
				await isNotVisible(badgeEdit.locators.managersEditor);
			});
		});
	});
});
