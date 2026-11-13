import { addDays, setHours, startOfHour, subDays } from "date-fns";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { SUSPENDED_PAGE } from "~/utils/urls";
import type { Factories } from "./helpers/factories";
import { expect, impersonate, navigate, test } from "./helpers/playwright";
import { AdminBanPage } from "./pages/ban/admin-ban-page";
import { SuspendedPage } from "./pages/ban/suspended-page";
import { UserAdminPage } from "./pages/user/user-admin-page";
import { UserEditProfilePage } from "./pages/user/user-edit-profile-page";

const BAN_REASON = "Harassing other players";
const FRIEND_CODE = "0123-4567-8901";

test.describe("Ban", () => {
	/**
	 * Staff ban a user from the admin page, optionally with a reason and an end date. A banned user is sent
	 * to the suspended page from every page of the site until the ban ends.
	 */
	test.describe("Banning", () => {
		test("a banned user is sent to the suspended page from every page", async ({
			page,
		}) => {
			const suspended = new SuspendedPage(page);

			await test.step("Sendou bans N-ZAP from the admin page", async () => {
				await impersonate(page, ADMIN_ID);
				const adminBan = new AdminBanPage(page);
				await adminBan.goto();
				await adminBan.banUser("N-ZAP", { reason: BAN_REASON });
			});

			await test.step("N-ZAP sees why they were banned and that the ban has no end", async () => {
				await impersonate(page, NZAP_TEST_ID);
				await navigate({ page, url: "/" });

				await expect(page).toHaveURL(SUSPENDED_PAGE);
				await expect(suspended.locators.heading).toBeVisible();
				await expect(suspended.reason(BAN_REASON)).toBeVisible();
				await expect(suspended.locators.noEndTime).toBeVisible();
			});

			await test.step("N-ZAP can't open any other page", async () => {
				await navigate({ page, url: "/builds" });
				await expect(page).toHaveURL(SUSPENDED_PAGE);

				await navigate({ page, url: "/calendar" });
				await expect(page).toHaveURL(SUSPENDED_PAGE);
			});
		});

		test("a ban that has ended no longer suspends the user", async ({
			page,
			factories,
		}) => {
			await banNZap(factories, { banned: subDays(new Date(), 1) });

			await impersonate(page, NZAP_TEST_ID);
			await navigate({ page, url: "/" });

			await expect(page).not.toHaveURL(SUSPENDED_PAGE);
		});
	});

	/** The suspended page tells a banned user when their ban ends and sends everyone else to the front page. */
	test.describe("Suspended page", () => {
		test("a timed ban shows when it ends", async ({ page, factories }) => {
			await banNZap(factories, {
				banned: startOfHour(setHours(addDays(new Date(), 1), 12)),
			});

			await impersonate(page, NZAP_TEST_ID);
			const suspended = new SuspendedPage(page);
			await suspended.goto();

			await expect(suspended.reason(BAN_REASON)).toBeVisible();
			await expect(suspended.locators.endsAt).toBeVisible();
			await expect(suspended.locators.noEndTime).not.toBeVisible();
		});

		test("a user who isn't banned is sent to the front page", async ({
			page,
		}) => {
			await impersonate(page, NZAP_TEST_ID);
			const suspended = new SuspendedPage(page);
			await suspended.goto();

			await expect(page).toHaveURL("/");
		});
	});

	/** Staff lift a ban from the admin page, letting the user back in right away. */
	test.describe("Unbanning", () => {
		test("an unbanned user can use the site again", async ({
			page,
			factories,
		}) => {
			await banNZap(factories, { banned: 1 });

			await test.step("Sendou unbans N-ZAP from the admin page", async () => {
				await impersonate(page, ADMIN_ID);
				const adminBan = new AdminBanPage(page);
				await adminBan.goto();
				await adminBan.unbanUser("N-ZAP");
			});

			await test.step("N-ZAP can open pages again", async () => {
				await impersonate(page, NZAP_TEST_ID);
				await navigate({ page, url: "/builds" });

				await expect(page).toHaveURL("/builds");
			});
		});
	});

	/** Every ban and unban made by staff is logged on the user's admin page, with who made it, latest first. */
	test.describe("Ban log", () => {
		test("the user's admin page lists their bans and unbans", async ({
			page,
			factories,
		}) => {
			await banNZap(factories, { banned: 1 });

			await impersonate(page, ADMIN_ID);
			const adminBan = new AdminBanPage(page);
			await adminBan.goto();
			await adminBan.unbanUser("N-ZAP");

			const userAdmin = new UserAdminPage(page);
			await userAdmin.goto(NZAP_TEST_ID);

			await expect(userAdmin.locators.banLogEntries).toHaveCount(2);
			const [unban, ban] = [
				userAdmin.locators.banLogEntries.nth(0),
				userAdmin.locators.banLogEntries.nth(1),
			];
			await expect(unban).toContainText("Unbanned");
			await expect(unban).toContainText("By: Sendou");
			await expect(ban).toContainText("Banned");
			await expect(ban).toContainText("No end date set");
			await expect(ban).toContainText(BAN_REASON);
		});
	});

	/**
	 * A friend code can belong to only one account: a user submitting one another account already has is
	 * banned without an end, to be sorted out (e.g. by merging the accounts) by staff.
	 */
	test.describe("Automatic ban", () => {
		test("submitting a friend code another account already has bans the user", async ({
			page,
			factories,
		}) => {
			await factories.UserFactory.setFriendCode(ADMIN_ID, FRIEND_CODE);

			await impersonate(page, NZAP_TEST_ID);
			const editProfile = new UserEditProfilePage(page);
			await editProfile.goto(NZAP_TEST_ID);
			await editProfile.setFriendCode(FRIEND_CODE);

			const suspended = new SuspendedPage(page);
			await expect(page).toHaveURL(SUSPENDED_PAGE);
			await expect(
				suspended.reason(/^Reason: \[automatic ban\]/),
			).toBeVisible();
			await expect(suspended.locators.noEndTime).toBeVisible();
		});
	});
});

/** N-ZAP banned by Sendou for `BAN_REASON`, `banned` being `1` for a ban without an end or the date it ends. */
function banNZap(factories: Factories, { banned }: { banned: 1 | Date }) {
	return factories.UserFactory.grant(NZAP_TEST_ID, {
		ban: { banned, bannedReason: BAN_REASON, bannedByUserId: ADMIN_ID },
	});
}
