import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import {
	expect,
	expectNoErrorPage,
	impersonate,
	MOBILE_VIEWPORT,
	test,
} from "./helpers/playwright";
import { inHours } from "./helpers/sidebar";
import { BuildsPage } from "./pages/builds/builds-page";
import { CalendarPage } from "./pages/calendar/calendar-page";
import { FrontPage } from "./pages/front-page/front-page";
import { MobileNav } from "./pages/layout/mobile-nav";
import { SettingsPage } from "./pages/settings/settings-page";
import { TournamentPage } from "./pages/tournament/tournament-page";
import { UserPage } from "./pages/user/user-page";

const SPLATTERSHOT_ID = 40;

test.describe("Mobile smoke", () => {
	test("moves through common pages via the mobile nav and saves a setting", async ({
		page,
		factories,
	}) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			name: "Mobile Cup",
			startTimes: [inHours(2)],
		});
		await factories.TournamentTeamFactory.create({
			tournamentId: tournament.id,
			memberUserIds: [NZAP_TEST_ID],
		});

		await page.setViewportSize(MOBILE_VIEWPORT);
		await impersonate(page, NZAP_TEST_ID);

		const front = new FrontPage(page);
		await front.goto();
		await expect(front.locators.welcomeBanner).toBeVisible();

		const mobileNav = new MobileNav(page);
		await mobileNav.openPanel("tourneys");
		await mobileNav.eventItem("Mobile Cup").click();
		await expect(page).toHaveURL(new RegExp(`/to/${tournament.id}`));
		await expectNoErrorPage(page);
		await expect(
			new TournamentPage(page).nameHeading("Mobile Cup"),
		).toBeVisible();

		await mobileNav.openPanel("menu");
		await mobileNav.menuLink("Builds").click();
		await expect(page).toHaveURL(/\/builds/);
		await expectNoErrorPage(page);
		await expect(
			new BuildsPage(page).weaponLink(SPLATTERSHOT_ID),
		).toBeVisible();

		await mobileNav.openPanel("menu");
		await mobileNav.menuLink("Calendar").click();
		await expect(page).toHaveURL(/\/calendar/);
		await expectNoErrorPage(page);
		await expect(
			new CalendarPage(page).tournamentCard("Mobile Cup"),
		).toBeVisible();

		await mobileNav.openPanel("you");
		await mobileNav.locators.youPanelUsername.click();
		await expect(page).toHaveURL(/\/u\//);
		await expectNoErrorPage(page);

		const userPage = new UserPage(page);
		await expect(userPage.locators.editProfileButton).toBeVisible();

		await mobileNav.openPanel("you");
		await mobileNav.locators.youPanelSettingsLink.click();
		await expect(page).toHaveURL(/\/settings/);
		await expectNoErrorPage(page);

		const settings = new SettingsPage(page);
		await settings.selectTab("Preferences");
		await settings.checkDisableBuildAbilitySortingToggle();

		await settings.reload();
		await expect(settings.locators.buildAbilitySortingToggle).toBeChecked();
	});
});
