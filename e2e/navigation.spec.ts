import { NZAP_TEST_ID } from "~/db/seed/constants";
import { expect, impersonate, navigate, test } from "./helpers/playwright";
import { MobileNav } from "./pages/layout/mobile-nav";
import { SideNav } from "./pages/layout/side-nav";
import { TopNavMenus } from "./pages/layout/top-nav-menus";

test.describe("Navigation", () => {
	test("desktop navigation", async ({ page }) => {
		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: "/" });

		const sideNav = new SideNav(page);
		await expect(sideNav.sectionHeading("Events")).toBeVisible();
		await expect(sideNav.sectionHeading("Friends")).toBeVisible();
		await expect(sideNav.sectionHeading("Streams")).toBeVisible();
		await expect(sideNav.locators.viewAllLinks.first()).toBeVisible();

		await sideNav.toggleCollapse();
		await expect(sideNav.sectionHeading("Events")).not.toBeVisible();

		await sideNav.toggleCollapse();
		await expect(sideNav.sectionHeading("Events")).toBeVisible();

		const topNav = new TopNavMenus(page);
		await topNav.open("Play");
		await expect(topNav.link("SendouQ")).toBeVisible();
		await expect(topNav.link("Scrims")).toBeVisible();

		await topNav.link("SendouQ").click();
		await expect(topNav.link("SendouQ")).not.toBeVisible();

		await navigate({ page, url: "/" });

		await topNav.open("Tools");
		await expect(topNav.link("Analyzer")).toBeVisible();
		await topNav.close();

		await topNav.open("Community");
		await expect(topNav.link("Builds")).toBeVisible();
		await topNav.close();

		await expect(sideNav.locators.notificationsButton).toBeVisible();
	});

	test("mobile navigation", async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: "/" });

		const mobileNav = new MobileNav(page);
		await expect(mobileNav.tab("menu")).toBeVisible();
		await expect(mobileNav.tab("friends")).toBeVisible();
		await expect(mobileNav.tab("tourneys")).toBeVisible();
		await expect(mobileNav.tab("chat")).toBeVisible();
		await expect(mobileNav.tab("you")).toBeVisible();

		await mobileNav.openPanel("menu");
		await expect(mobileNav.menuLink("SendouQ")).toBeVisible();
		await expect(mobileNav.menuLink("Analyzer")).toBeVisible();
		await expect(mobileNav.menuLink("Builds")).toBeVisible();
		await expect(mobileNav.locators.streamsHeading).toBeVisible();

		await mobileNav.switchPanel("friends");
		await expect(mobileNav.menuLink("SendouQ")).not.toBeVisible();
		await expect(mobileNav.locators.viewAllLink).toBeVisible();

		await mobileNav.switchPanel("you");
		await expect(mobileNav.locators.youPanelUsername).toBeVisible();

		await mobileNav.switchPanel("tourneys");
		await expect(mobileNav.locators.viewAllLink).toBeVisible();

		await mobileNav.closePanel();
		await expect(mobileNav.locators.viewAllLink).not.toBeVisible();
	});

	test("tablet navigation", async ({ page }) => {
		await page.setViewportSize({ width: 768, height: 1024 });
		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: "/" });

		const sideNav = new SideNav(page);
		await expect(sideNav.sectionHeading("Events")).not.toBeVisible();
		await expect(sideNav.sectionHeading("Friends")).not.toBeVisible();

		await sideNav.openModal();

		await expect(sideNav.sectionHeading("Events")).toBeVisible();
		await expect(sideNav.sectionHeading("Friends")).toBeVisible();
		await expect(sideNav.sectionHeading("Streams")).toBeVisible();
		await expect(sideNav.locators.viewAllLinks.first()).toBeVisible();

		await sideNav.closeModal();
		await expect(sideNav.sectionHeading("Events")).not.toBeVisible();

		const topNav = new TopNavMenus(page);
		await topNav.open("Play");
		await expect(topNav.link("SendouQ")).toBeVisible();
		await topNav.close();

		await expect(new MobileNav(page).tab("menu")).not.toBeVisible();
	});
});
