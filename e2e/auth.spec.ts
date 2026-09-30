import { NZAP_TEST_ID } from "~/db/seed/constants";
import { NOTIFICATIONS_URL } from "~/utils/urls";
import { expect, isNotVisible, navigate, test } from "./helpers/playwright";
import { DiscordAuthorizeInterceptor } from "./pages/auth/discord-authorize";
import { LogInLinkPage } from "./pages/auth/log-in-link-page";
import { FrontPage } from "./pages/front-page/front-page";
import { ErrorPage } from "./pages/layout/error-page";
import { SideNav } from "./pages/layout/side-nav";
import { SettingsPage } from "./pages/settings/settings-page";

test.describe("Auth", () => {
	test("logs in via a log in link and logs out from the settings page", async ({
		page,
		factories,
	}) => {
		const logInLink = await factories.LogInLinkFactory.create({
			userId: NZAP_TEST_ID,
		});

		const logInLinkPage = new LogInLinkPage(page);
		const sideNav = new SideNav(page);

		await logInLinkPage.goto(logInLink.code);
		await expect(page).toHaveURL("/");
		await expect(sideNav.locators.footerUsername).toHaveText("N-ZAP");
		await isNotVisible(sideNav.locators.logInButton);

		const settings = new SettingsPage(page);
		await settings.goto();
		await settings.logOut();

		await expect(sideNav.locators.logInButton).toBeVisible();
		await isNotVisible(sideNav.locators.footerUsername);

		const errorPage = new ErrorPage(page);

		await navigate({ page, url: NOTIFICATIONS_URL });
		await expect(errorPage.heading("Authentication required")).toBeVisible();

		// the first log in consumed the single use link
		const reusedLink = await logInLinkPage.fetchResponse(logInLink.code);
		expect(reusedLink.status).toBe(400);
		expect(reusedLink.body).toContain("Invalid log in link");
	});

	test("log in button starts the Discord OAuth flow", async ({
		page,
		context,
	}) => {
		const discord = new DiscordAuthorizeInterceptor();
		await discord.install(context);

		const frontPage = new FrontPage(page);
		await frontPage.goto();

		const sideNav = new SideNav(page);
		await sideNav.locators.logInButton.click();

		await discord.waitForCapture();
		expect(discord.authorizeUrl.href).toMatch(
			/discord\.com\/(api\/)?oauth2\/authorize/,
		);
		expect(discord.param("client_id")).toBe("123");
		expect(discord.param("response_type")).toBe("code");
		expect(discord.param("scope")).toContain("identify");
		expect(discord.param("state")).toBeTruthy();
		expect(discord.param("redirect_uri")).toMatch(
			/^http:\/\/localhost:\d+\/auth\/callback$/,
		);
	});
});
