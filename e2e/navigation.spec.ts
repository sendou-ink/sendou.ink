import { expect, impersonate, navigate, seed, test } from "~/utils/playwright";

test.describe("Navigation", () => {
	test("desktop navigation", async ({ page }) => {
		await seed(page);
		await impersonate(page);
		await navigate({ page, url: "/" });

		// SideNav visible with section headings
		await expect(page.getByRole("heading", { name: "Events" })).toBeVisible();
		await expect(page.getByRole("heading", { name: "Friends" })).toBeVisible();
		await expect(page.getByRole("heading", { name: "Streams" })).toBeVisible();

		// View all links present
		const viewAllLinks = page.getByRole("link", { name: /View all/ });
		await expect(viewAllLinks.first()).toBeVisible();

		// SideNav collapse/uncollapse
		const collapseButton = page.getByTestId("sidenav-collapse-button");
		await collapseButton.click();
		await expect(
			page.getByRole("heading", { name: "Events" }),
		).not.toBeVisible();

		await collapseButton.click();
		await expect(page.getByRole("heading", { name: "Events" })).toBeVisible();

		// TopNavMenus — Play
		await page.getByRole("button", { name: "Play" }).click();
		const playMenu = page.locator("[class*='menuContent']");
		await expect(playMenu.getByRole("link", { name: "SendouQ" })).toBeVisible();
		await expect(playMenu.getByRole("link", { name: "Scrims" })).toBeVisible();
		await playMenu.getByRole("link", { name: "SendouQ" }).click();
		await expect(
			playMenu.getByRole("link", { name: "SendouQ" }),
		).not.toBeVisible();

		await navigate({ page, url: "/" });

		// TopNavMenus — Tools
		await page.getByRole("button", { name: "Tools" }).click();
		const toolsMenu = page.locator("[class*='menuContent']");
		await expect(
			toolsMenu.getByRole("link", { name: "Analyzer" }),
		).toBeVisible();
		await page.keyboard.press("Escape");

		// TopNavMenus — Community
		await page.getByRole("button", { name: "Community" }).click();
		const communityMenu = page.locator("[class*='menuContent']");
		await expect(
			communityMenu.getByRole("link", { name: "Builds" }),
		).toBeVisible();
		await page.keyboard.press("Escape");

		// SideNav footer — user info
		await expect(page.getByTestId("notifications-button")).toBeVisible();
	});

	test("mobile navigation", async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await seed(page);
		await impersonate(page);
		await navigate({ page, url: "/" });

		// Tab bar visible
		const menuTab = page.getByRole("button", { name: "Menu" });
		const friendsTab = page.getByRole("button", { name: "Friends" });
		const calendarTab = page.getByRole("button", { name: "Events" });
		const chatTab = page.getByRole("button", { name: "Chat" });
		const youTab = page.getByRole("button", { name: "You" });

		await expect(menuTab).toBeVisible();
		await expect(friendsTab).toBeVisible();
		await expect(calendarTab).toBeVisible();
		await expect(chatTab).toBeVisible();
		await expect(youTab).toBeVisible();

		// Menu panel — open and verify contents
		await menuTab.click();
		const mobileMenu = page.getByLabel("Menu", { exact: true });
		await expect(
			mobileMenu.getByRole("link", { name: "SendouQ" }),
		).toBeVisible();
		await expect(
			mobileMenu.getByRole("link", { name: "Analyzer" }),
		).toBeVisible();
		await expect(
			mobileMenu.getByRole("link", { name: "Builds" }),
		).toBeVisible();
		await expect(
			page.locator("h3").filter({ hasText: "Streams" }),
		).toBeVisible();

		// Switch from menu to friends panel via ghost tab
		// Ghost tabs are invisible overlays; use dispatchEvent to trigger them
		// nth(1) = "friends" ghost tab (0=menu, 1=friends, 2=tourneys, 3=chat, 4=you)
		await page
			.locator("[class*='ghostTab']:not([class*='ghostTabBar'])")
			.nth(1)
			.dispatchEvent("click");
		await expect(
			mobileMenu.getByRole("link", { name: "SendouQ" }),
		).not.toBeVisible();
		const friendsViewAll = page.getByRole("link", { name: /View all/ });
		await expect(friendsViewAll).toBeVisible();

		// Switch to You panel via ghost tab (nth(4) = "you")
		await page
			.locator("[class*='ghostTab']:not([class*='ghostTabBar'])")
			.nth(4)
			.dispatchEvent("click");
		// You panel shows user info (username link)
		await expect(page.locator("[class*='youPanelUsername']")).toBeVisible();

		// Switch to calendar panel via ghost tab (nth(2) = "tourneys")
		await page
			.locator("[class*='ghostTab']:not([class*='ghostTabBar'])")
			.nth(2)
			.dispatchEvent("click");
		const tourneysViewAll = page.getByRole("link", { name: /View all/ });
		await expect(tourneysViewAll).toBeVisible();

		// Close panel via X button
		await page.locator("button:has(svg.lucide-x)").first().click();
		await expect(tourneysViewAll).not.toBeVisible();
	});

	test("tablet navigation", async ({ page }) => {
		await page.setViewportSize({ width: 768, height: 1024 });
		await seed(page);
		await impersonate(page);
		await navigate({ page, url: "/" });

		// SideNav not visible as permanent sidebar
		await expect(
			page.getByRole("heading", { name: "Events" }),
		).not.toBeVisible();
		await expect(
			page.getByRole("heading", { name: "Friends" }),
		).not.toBeVisible();

		// Hamburger opens SideNav modal
		const modalTrigger = page.getByTestId("sidenav-modal-trigger");
		await modalTrigger.click();

		await expect(page.getByRole("heading", { name: "Events" })).toBeVisible();
		await expect(page.getByRole("heading", { name: "Friends" })).toBeVisible();
		await expect(page.getByRole("heading", { name: "Streams" })).toBeVisible();
		await expect(
			page.getByRole("link", { name: /View all/ }).first(),
		).toBeVisible();

		// Close modal by pressing Escape
		await page.keyboard.press("Escape");
		await expect(
			page.getByRole("heading", { name: "Events" }),
		).not.toBeVisible();

		// TopNavMenus still work
		await page.getByRole("button", { name: "Play" }).click();
		const tabletPlayMenu = page.locator("[class*='menuContent']");
		await expect(
			tabletPlayMenu.getByRole("link", { name: "SendouQ" }),
		).toBeVisible();
		await page.keyboard.press("Escape");

		// MobileNav hidden
		await expect(page.getByRole("button", { name: "Menu" })).not.toBeVisible();
	});
});
