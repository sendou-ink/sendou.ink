import { NZAP_TEST_ID } from "~/db/seed/constants";
import { SENDOUQ_PAGE, teamPage } from "~/utils/urls";
import {
	expect,
	impersonate,
	MOBILE_VIEWPORT,
	navigate,
	TABLET_VIEWPORT,
	test,
} from "./helpers/playwright";
import { MobileNav } from "./pages/layout/mobile-nav";
import { SideNav } from "./pages/layout/side-nav";
import { TopNavMenus } from "./pages/layout/top-nav-menus";

test.describe("Navigation", () => {
	test("desktop navigation", async ({ page }) => {
		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: "/" });

		const topNav = new TopNavMenus(page);
		await topNav.open("Play");
		await expect(topNav.link("SendouQ")).toBeVisible();
		await expect(topNav.link("Scrims")).toBeVisible();

		await topNav.link("SendouQ").click();
		await expect(page).toHaveURL(SENDOUQ_PAGE);
		await expect(topNav.link("SendouQ")).not.toBeVisible();

		await topNav.open("Tools");
		await topNav.link("Analyzer").click();
		await expect(page).toHaveURL(/\/analyzer/);

		await topNav.open("Community");
		await topNav.link("Builds").click();
		await expect(page).toHaveURL(/\/builds/);
	});

	test("mobile navigation", async ({ page }) => {
		await page.setViewportSize(MOBILE_VIEWPORT);
		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: "/" });

		const mobileNav = new MobileNav(page);
		await expect(mobileNav.tab("menu")).toBeVisible();
		await expect(mobileNav.tab("friends")).toBeVisible();
		await expect(mobileNav.tab("tourneys")).toBeVisible();
		await expect(mobileNav.tab("chat")).toBeVisible();
		await expect(mobileNav.tab("you")).toBeVisible();

		await mobileNav.openPanel("menu");
		await expect(mobileNav.menuLink("Analyzer")).toBeVisible();
		await expect(mobileNav.menuLink("Builds")).toBeVisible();

		await mobileNav.switchPanel("you");
		await expect(mobileNav.locators.youPanelUsername).toBeVisible();

		await mobileNav.closePanel();
		await expect(mobileNav.locators.youPanelUsername).toHaveCount(0);

		await mobileNav.openPanel("menu");
		await mobileNav.menuLink("SendouQ").click();
		await expect(page).toHaveURL(SENDOUQ_PAGE);
		await expect(mobileNav.menuLink("SendouQ")).not.toBeVisible();
	});

	test("my team shortcut navigates to the team page on desktop and mobile", async ({
		page,
		factories,
	}) => {
		const team = await factories.TeamFactory.create({
			memberUserIds: [NZAP_TEST_ID],
		});

		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: "/" });

		await new SideNav(page).locators.footerTeamLink.click();
		await expect(page).toHaveURL(teamPage(team.customUrl));

		await navigate({ page, url: "/" });
		await page.setViewportSize(MOBILE_VIEWPORT);
		const mobileNav = new MobileNav(page);
		await mobileNav.openPanel("you");
		await mobileNav.locators.youPanelTeamLink.click();
		await expect(page).toHaveURL(teamPage(team.customUrl));
	});

	test("tablet navigation", async ({ page }) => {
		await page.setViewportSize(TABLET_VIEWPORT);
		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: "/" });

		const topNav = new TopNavMenus(page);
		await topNav.open("Play");
		await expect(topNav.link("SendouQ")).toBeVisible();
		await topNav.close();

		await expect(new MobileNav(page).tab("menu")).not.toBeVisible();
	});
});
